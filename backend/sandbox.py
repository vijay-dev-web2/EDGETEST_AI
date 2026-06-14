"""Docker sandbox executor for EdgeTest AI.

Runs generated test files inside an isolated ``edgetest-sandbox`` Docker
container and returns structured pass/fail results.

Security measures
-----------------
* ``--network none`` — the container has no network access whatsoever.
* ``--memory 256m --memory-swap 256m`` — prevents memory exhaustion and
  disables swap so the process cannot escape the memory cap via swapping.
* ``--rm`` — the container is automatically removed after it exits.
* Test files are mounted read-only (``/tests:ro``); only the JSON report
  output directory is writable (a fresh ``tempfile.TemporaryDirectory``).
* A unique ``--name`` is assigned so a ``docker rm -f`` can forcibly
  terminate the container if the Python-level timeout fires.
* Python syntax is pre-validated locally (``py_compile``) before Docker is
  even invoked, short-circuiting the full container spin-up for trivially
  broken generated code.

Language support
----------------
* python  — pytest + pytest-json-report    (edgetest-sandbox:latest)
* javascript / typescript — Jest           (edgetest-sandbox:latest)
* java    — JUnit 5 Console Standalone     (edgetest-sandbox-jvm:latest)
* csharp  — dotnet test + xUnit            (edgetest-sandbox-dotnet:latest)
* cpp     — g++ + Google Test              (edgetest-sandbox-cpp:latest)

Public API
----------
run_tests(session_id, language) → {total, passed, failed, failures: [...]}
"""

from __future__ import annotations

import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass

from config import settings

# Sandbox image names for each language family
_SANDBOX_IMAGE_JVM    = "edgetest-sandbox-jvm:latest"     # Java — JDK + JUnit 5 standalone
_SANDBOX_IMAGE_DOTNET = "edgetest-sandbox-dotnet:latest"  # C# — .NET SDK + xUnit
_SANDBOX_IMAGE_CPP    = "edgetest-sandbox-cpp:latest"     # C++ — g++ + Google Test

# ---------------------------------------------------------------------------
# Source-alias helper — ensures the source module is importable under whatever
# name the LLM chose, not just "solution".
# ---------------------------------------------------------------------------

_PY_FROM_RE = re.compile(r"^from\s+([\w]+)\s+import", re.MULTILINE)
_PY_IMP_RE  = re.compile(r"^import\s+([\w]+)", re.MULTILINE)
_JS_REQ_RE  = re.compile(r"""require\(['"]\.?/?([^'"./]+)['"]\)""")
_JS_ESM_RE  = re.compile(r"""from\s+['"]\.?/?([^'"./]+)['"]""")

_STDLIB = frozenset({
    "pytest", "unittest", "mock", "os", "sys", "re", "json", "math",
    "typing", "pathlib", "datetime", "collections", "itertools",
    "functools", "abc", "io", "copy", "time", "random", "string",
    "jest", "describe", "it", "expect", "beforeEach", "afterEach",
})


def _alias_source_modules(test_dir: pathlib.Path, lang: str) -> None:
    """If solution.py exists, copy it under every module name the tests import.

    This makes the sandbox resilient to the LLM using any module name — even
    if it didn't follow the 'import from solution' instruction.
    """
    if lang == "python":
        source = test_dir / "solution.py"
        if not source.exists():
            return
        for tf in test_dir.glob("test_*.py"):
            code = tf.read_text(encoding="utf-8")
            names: set[str] = set()
            for m in _PY_FROM_RE.finditer(code):
                names.add(m.group(1))
            for m in _PY_IMP_RE.finditer(code):
                names.add(m.group(1))
            for name in names:
                if name in _STDLIB or name.startswith("test"):
                    continue
                alias = test_dir / f"{name}.py"
                if not alias.exists():
                    shutil.copy2(source, alias)
    else:
        source = test_dir / "solution.js"
        if not source.exists():
            return
        for tf in list(test_dir.glob("*.test.js")) + list(test_dir.glob("*.test.ts")) + list(test_dir.glob("*.spec.js")) + list(test_dir.glob("*.spec.ts")):
            code = tf.read_text(encoding="utf-8")
            names: set[str] = set()
            for m in _JS_REQ_RE.finditer(code):
                names.add(m.group(1))
            for m in _JS_ESM_RE.finditer(code):
                names.add(m.group(1))
            for name in names:
                if name in _STDLIB or name.startswith("test"):
                    continue
                alias = test_dir / f"{name}.js"
                if not alias.exists():
                    shutil.copy2(source, alias)

# ---------------------------------------------------------------------------
# Legacy DockerSandbox (kept for backward compatibility; uses subprocess)
# ---------------------------------------------------------------------------


@dataclass
class SandboxResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool = False

    @property
    def success(self) -> bool:
        return self.exit_code == 0 and not self.timed_out


class DockerSandbox:
    """Runs an arbitrary code snippet in the sandbox image and returns stdout/stderr."""

    def run_sync(self, code: str, language: str = "python") -> SandboxResult:
        if language == "python":
            cmd = ["python", "-c", code]
        elif language in ("javascript", "typescript"):
            cmd = ["node", "-e", code]
        elif language == "java":
            cmd = ["java", "-cp", "/tests/classes", code]
        elif language == "csharp":
            cmd = ["dotnet", "script", "--", code]
        elif language == "cpp":
            cmd = ["bash", "-c", f"echo '{code}' > /tmp/snippet.cpp && g++ -std=c++14 /tmp/snippet.cpp -o /tmp/snippet && /tmp/snippet"]
        else:
            raise ValueError(f"Unsupported sandbox language: {language}")

        try:
            proc = subprocess.run(
                [
                    "docker", "run", "--rm",
                    "--network", "none",
                    "--memory", "256m",
                    "--memory-swap", "256m",
                    settings.SANDBOX_IMAGE,
                    *cmd,
                ],
                capture_output=True,
                text=True,
                timeout=settings.SANDBOX_TIMEOUT,
            )
            return SandboxResult(
                stdout=proc.stdout,
                stderr=proc.stderr,
                exit_code=proc.returncode,
            )
        except subprocess.TimeoutExpired:
            return SandboxResult(stdout="", stderr="Execution timed out", exit_code=1, timed_out=True)


# ---------------------------------------------------------------------------
# Result parsers
# ---------------------------------------------------------------------------


def _parse_pytest(data: dict) -> dict:
    summary = data.get("summary", {})
    failures = []
    all_tests = []

    # Surface collection errors (pytest exit code 2) — they appear in
    # "collectors" not "tests", so summary.total stays 0 without this.
    for collector in data.get("collectors", []):
        if collector.get("outcome") != "failed":
            continue
        longrepr = collector.get("longrepr", "")
        error_message = ""
        for line in longrepr.splitlines():
            stripped = line.lstrip()
            if stripped.startswith("E ") or stripped.startswith("E\t"):
                error_message = stripped[2:].strip()
                break
        if not error_message:
            error_message = next(
                (l.strip() for l in reversed(longrepr.splitlines()) if l.strip()),
                longrepr,
            )
        node_id = collector.get("nodeid", "__collection_error__")
        failures.append({
            "test_name": node_id,
            "error_message": error_message,
            "traceback": longrepr,
        })
        all_tests.append({
            "test_name": node_id,
            "node_id": node_id,
            "file_name": node_id,
            "status": "failed",
            "duration": 0.0,
            "error_message": error_message,
            "traceback": longrepr,
        })

    for test in data.get("tests", []):
        node_id = test.get("nodeid", "unknown")
        outcome = test.get("outcome", "unknown")
        duration = test.get("duration", 0) or 0

        call = test.get("call", {})
        longrepr = call.get("longrepr", "") if isinstance(call, dict) else str(call)

        error_message = ""
        traceback_str = ""
        if outcome == "failed":
            for line in longrepr.splitlines():
                stripped = line.lstrip()
                if stripped.startswith("E ") or stripped.startswith("E\t"):
                    error_message = stripped[2:].strip()
                    break
            if not error_message:
                error_message = next(
                    (l.strip() for l in reversed(longrepr.splitlines()) if l.strip()),
                    longrepr,
                )
            traceback_str = longrepr
            failures.append({
                "test_name": node_id,
                "error_message": error_message,
                "traceback": traceback_str,
            })

        parts = node_id.split("::")
        file_name = parts[0] if parts else ""
        test_func = "::".join(parts[1:]) if len(parts) > 1 else node_id

        all_tests.append({
            "test_name": test_func,
            "node_id": node_id,
            "file_name": file_name,
            "status": outcome,
            "duration": round(duration * 1000, 1),
            "error_message": error_message,
            "traceback": traceback_str,
        })

    collection_errors = len([f for f in failures if "__collection_error__" in f["test_name"] or f["test_name"].endswith(".py")])
    return {
        "total": summary.get("total", 0) or (len(failures) if failures and summary.get("total", 0) == 0 else 0),
        "passed": summary.get("passed", 0),
        "failed": summary.get("failed", 0) + collection_errors,
        "failures": failures,
        "tests": all_tests,
    }


def _parse_junit_xml(xml_dir: str) -> dict:
    """Parse JUnit/xUnit XML reports written by JUnit Platform Console or Maven Surefire.

    Accepts a directory path; reads every *.xml file inside it.
    """
    failures: list[dict] = []
    all_tests: list[dict] = []
    total = passed = failed = 0

    xml_path = pathlib.Path(xml_dir)
    xml_files = list(xml_path.glob("*.xml"))
    if not xml_files:
        # Try the path itself as a single file
        single = xml_path.parent / "result.xml"
        if single.exists():
            xml_files = [single]

    for xml_file in xml_files:
        try:
            tree = ET.parse(xml_file)
        except ET.ParseError:
            continue
        root = tree.getroot()
        suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
        for suite in suites:
            for tc in suite.findall("testcase"):
                name = f"{tc.get('classname', '')}.{tc.get('name', 'unknown')}".strip(".")
                dur = float(tc.get("time", 0) or 0) * 1000
                total += 1
                # Use explicit None checks — ET Elements are falsy when they have no children
                failure_el = tc.find("failure")
                if failure_el is None:
                    failure_el = tc.find("error")
                if failure_el is not None:
                    failed += 1
                    msg = failure_el.get("message", "") or (failure_el.text or "")
                    tb = failure_el.text or ""
                    failures.append({"test_name": name, "error_message": msg, "traceback": tb})
                    all_tests.append({
                        "test_name": name, "node_id": name, "file_name": xml_file.name,
                        "status": "failed", "duration": dur,
                        "error_message": msg, "traceback": tb,
                    })
                elif tc.find("skipped") is not None:  # explicit None check same reason
                    all_tests.append({
                        "test_name": name, "node_id": name, "file_name": xml_file.name,
                        "status": "skipped", "duration": dur,
                        "error_message": "", "traceback": "",
                    })
                else:
                    passed += 1
                    all_tests.append({
                        "test_name": name, "node_id": name, "file_name": xml_file.name,
                        "status": "passed", "duration": dur,
                        "error_message": "", "traceback": "",
                    })

    return {"total": total, "passed": passed, "failed": failed, "failures": failures, "tests": all_tests}


def _parse_gtest_json(data: dict) -> dict:
    """Parse Google Test JSON output (--gtest_output=json:...)."""
    failures: list[dict] = []
    all_tests: list[dict] = []

    for suite in data.get("testsuites", []):
        suite_name = suite.get("name", "")
        for tc in suite.get("testsuite", []):
            name = f"{suite_name}.{tc.get('name', 'unknown')}"
            dur = float((tc.get("time", "0s") or "0s").rstrip("s")) * 1000
            status = tc.get("result", "RUN")
            failures_list = tc.get("failures", [])
            if failures_list:
                msg = failures_list[0].get("failure", "")
                failures.append({"test_name": name, "error_message": msg, "traceback": msg})
                all_tests.append({
                    "test_name": name, "node_id": name, "file_name": suite_name,
                    "status": "failed", "duration": dur, "error_message": msg, "traceback": msg,
                })
            elif status == "SUPPRESSED":
                all_tests.append({
                    "test_name": name, "node_id": name, "file_name": suite_name,
                    "status": "skipped", "duration": dur, "error_message": "", "traceback": "",
                })
            else:
                all_tests.append({
                    "test_name": name, "node_id": name, "file_name": suite_name,
                    "status": "passed", "duration": dur, "error_message": "", "traceback": "",
                })

    total = data.get("tests", 0)
    failed_count = data.get("failures", 0) + data.get("errors", 0)
    return {
        "total": total,
        "passed": total - failed_count,
        "failed": failed_count,
        "failures": failures,
        "tests": all_tests,
    }


def _parse_jest(data: dict) -> dict:
    failures = []
    all_tests = []

    for file_result in data.get("testResults", []):
        file_name = file_result.get("testFilePath", "")
        for test in file_result.get("testResults", []):
            full_name = test.get("fullName", "unknown")
            status = test.get("status", "unknown")
            duration = test.get("duration") or 0

            error_message = ""
            traceback_str = ""
            if status == "failed":
                messages = test.get("failureMessages", [])
                raw_msg = messages[0] if messages else ""
                lines = raw_msg.splitlines()
                error_message = next((l.strip() for l in lines if l.strip()), raw_msg)
                traceback_str = raw_msg
                failures.append({
                    "test_name": full_name,
                    "error_message": error_message,
                    "traceback": traceback_str,
                })

            all_tests.append({
                "test_name": full_name,
                "node_id": full_name,
                "file_name": file_name,
                "status": status,
                "duration": float(duration),
                "error_message": error_message,
                "traceback": traceback_str,
            })

    return {
        "total": data.get("numTotalTests", 0),
        "passed": data.get("numPassedTests", 0),
        "failed": data.get("numFailedTests", 0),
        "failures": failures,
        "tests": all_tests,
    }


# ---------------------------------------------------------------------------
# Pre-flight syntax check (runs locally, no Docker overhead)
# ---------------------------------------------------------------------------


def _check_python_syntax(test_dir: pathlib.Path) -> str | None:
    """Run py_compile on every generated test file in the directory.

    Only validates test_*.py files — skips solution.py and conftest.py since
    a syntax error in the source code should surface as a pytest collection error
    (which gives a more useful message) rather than blocking the entire run.

    Returns a human-readable error string on the first failure, or None if
    all test files are syntactically valid.
    """
    import py_compile

    for py_file in sorted(test_dir.glob("test_*.py")):
        try:
            py_compile.compile(str(py_file), doraise=True)
        except py_compile.PyCompileError as exc:
            return f"{py_file.name}: {exc}"
    return None


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_unit_tests(session_id: str, language: str) -> dict:
    """Run only the generated unit tests for this session."""
    return run_tests(session_id, language, subdir="unit")


def run_integration_tests(session_id: str, language: str) -> dict:
    """Run only the generated integration tests for this session."""
    return run_tests(session_id, language, subdir="integration")


def run_tests(session_id: str, language: str, subdir: str | None = None) -> dict:
    """Run generated test files inside the edgetest-sandbox Docker image.

    Mounts /tmp/edgetest/{session_id}[/{subdir}] read-only as /tests, and a fresh
    temp directory as /tmp so the test runner can write its JSON report there.

    Args:
        session_id: Used to locate the test files under /tmp/edgetest/.
        language:   "python", "javascript", or "typescript".
        subdir:     Optional subdirectory ("unit" or "integration") within the
                    session directory. When None, uses the session root (legacy).

    Returns:
        {total, passed, failed, failures: [{test_name, error_message, traceback}]}
    """
    base_dir = pathlib.Path("/tmp/edgetest") / session_id
    test_dir = base_dir / subdir if subdir else base_dir
    if not test_dir.is_dir():
        # Fall back to legacy root if subdir doesn't exist yet
        if subdir and base_dir.is_dir():
            test_dir = base_dir
        else:
            raise FileNotFoundError(f"Test directory not found: {test_dir}")

    lang = language.lower()

    # Ensure source code is importable under whatever module name the LLM used
    _alias_source_modules(test_dir, lang)

    # Pre-validate Python syntax before spinning up the full test run
    if lang == "python":
        syntax_error = _check_python_syntax(test_dir)
        if syntax_error:
            return {
                "total": 0,
                "passed": 0,
                "failed": 1,
                "failures": [{
                    "test_name": "__syntax_error__",
                    "error_message": syntax_error,
                    "traceback": "",
                }],
            }

    if lang == "python":
        sandbox_image = settings.SANDBOX_IMAGE
        test_cmd = [
            "pytest", "/tests",
            "--json-report", "--json-report-file=/tmp/result.json",
            "-v", "--tb=short",
        ]
        result_format = "pytest_json"
    elif lang in ("javascript", "typescript"):
        sandbox_image = settings.SANDBOX_IMAGE
        test_cmd = [
            "jest", "/tests",
            "--json", "--outputFile=/tmp/result.json",
            "--no-coverage",
            "--forceExit",
        ]
        result_format = "jest_json"
    elif lang == "java":
        # Requires edgetest-sandbox-jvm:latest (JDK + JUnit 5 Console Standalone)
        sandbox_image = _SANDBOX_IMAGE_JVM
        test_cmd = [
            "bash", "-c",
            "mkdir -p /tmp/classes && "
            "javac -cp '/usr/local/lib/junit-platform-console-standalone.jar' "
            "-d /tmp/classes /tests/*.java && "
            "java -jar /usr/local/lib/junit-platform-console-standalone.jar "
            "--class-path /tmp/classes --scan-class-path "
            "--reports-dir=/tmp/reports",
        ]
        result_format = "junit_xml"
    elif lang == "csharp":
        # Requires edgetest-sandbox-dotnet:latest (.NET SDK + xUnit)
        sandbox_image = _SANDBOX_IMAGE_DOTNET
        test_cmd = [
            "dotnet", "test", "/tests",
            "--logger", "junit;LogFilePath=/tmp/result.xml",
            "--nologo", "--no-build",
        ]
        result_format = "junit_xml"
    elif lang == "cpp":
        # Requires edgetest-sandbox-cpp:latest (g++ + Google Test)
        sandbox_image = _SANDBOX_IMAGE_CPP
        test_cmd = [
            "bash", "-c",
            "cd /tests && "
            "g++ -std=c++14 -I. $(ls *.cpp test_*.cpp 2>/dev/null | head -20) "
            "-lgtest -lgtest_main -lpthread -o /tmp/test_runner && "
            "/tmp/test_runner --gtest_output=json:/tmp/result.json",
        ]
        result_format = "gtest_json"
    else:
        raise ValueError(f"Unsupported language: {language!r}")

    # Use a unique container name so we can force-remove it on timeout.
    container_name = f"edgetest-{session_id}"

    with tempfile.TemporaryDirectory() as output_dir:
        docker_cmd = [
            "docker", "run",
            "--rm",                              # auto-remove on exit
            "--name", container_name,            # named so we can force-kill on timeout
            "--network", "none",                 # no outbound network calls from tests
            "--memory", "256m",                  # hard memory cap
            "--memory-swap", "256m",             # disables swap (swap == memory cap)
            "-v", f"{test_dir}:/tests:ro",       # test files: read-only mount
            "-v", f"{output_dir}:/tmp",          # report output: writable temp dir
            sandbox_image,
            *test_cmd,
        ]

        timed_out = False
        proc: subprocess.CompletedProcess | None = None

        try:
            proc = subprocess.run(
                docker_cmd,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except subprocess.TimeoutExpired:
            timed_out = True
            # Kill and remove the (possibly still-running) container.
            subprocess.run(["docker", "rm", "-f", container_name], capture_output=True)

        if timed_out:
            return {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "failures": [{
                    "test_name": "__timeout__",
                    "error_message": "Test run exceeded the 10-second time limit",
                    "traceback": "",
                }],
            }

        # Locate and parse the result file (format varies by language)
        out_path = pathlib.Path(output_dir)
        if result_format == "junit_xml":
            reports_dir = out_path / "reports"
            result_dir = str(reports_dir) if reports_dir.is_dir() else str(out_path)
            return _parse_junit_xml(result_dir)

        result_path = out_path / "result.json"
        if not result_path.exists():
            stderr_snippet = (proc.stderr or "")[:500] if proc else "docker run failed"
            return {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "failures": [{
                    "test_name": "__runner_error__",
                    "error_message": stderr_snippet,
                    "traceback": "",
                }],
            }

        try:
            raw = json.loads(result_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError) as exc:
            return {
                "total": 0,
                "passed": 0,
                "failed": 0,
                "failures": [{"test_name": "__parse_error__", "error_message": str(exc), "traceback": ""}],
            }

        if result_format == "gtest_json":
            return _parse_gtest_json(raw)
        if result_format == "jest_json":
            return _parse_jest(raw)
        return _parse_pytest(raw)
