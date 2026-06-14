"""Backend orchestrator for the EdgeTest AI CLI."""

from __future__ import annotations

import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path


class CLIRunner:
    def __init__(self, args):
        self.args = args
        self.output_dir = Path(args.output)
        self.output_dir.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------ #
    # Public entry point
    # ------------------------------------------------------------------ #

    async def run(self) -> int:
        self._log(f"\n EdgeTest AI", bold=True)
        self._log(f" Analyzing: {self.args.file}\n")

        source_code = self._read_source()
        if source_code is None:
            return 1

        # Story mode: bypass code analysis
        if getattr(self.args, "story", None):
            return await self._run_story_mode()

        # Detect language
        language = self._detect_language(str(self.args.file))

        # AI generation (simplified: use story_to_tests chain for demo purposes)
        try:
            test_code = await self._generate_tests_simple(source_code, language)
        except Exception as exc:
            self._log(f"\n Error during AI generation: {exc}", error=True)
            return 1

        # Save generated tests
        test_file = self.output_dir / f"test_{Path(str(self.args.file)).stem}.py"
        test_file.write_text(test_code, encoding="utf-8")
        # Save source so tests can import it
        (self.output_dir / f"{Path(str(self.args.file)).stem}.py").write_text(source_code, encoding="utf-8")
        self._log(f"    Saved tests → {test_file}")

        # Execute
        exec_results = self._execute_tests()

        # Coverage gate
        from services.coverage_gate import check_coverage_gate
        gate = check_coverage_gate(
            unit_coverage_percent=exec_results.get("unit_coverage", 0.0),
            custom_threshold=self.args.coverage_threshold,
        )

        # Save workflow
        if getattr(self.args, "save_workflow", False):
            self._save_github_workflow(language)

        # Build + save report
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "file": str(self.args.file),
            "language": language,
            "summary": exec_results,
            "coverage_gate": gate,
            "status": "passed" if gate["passed"] else "coverage_gate_failed",
        }
        report_path = self.output_dir / "last_report.json"
        with open(report_path, "w") as f:
            json.dump(report, f, indent=2)

        self._print_result(exec_results, gate)

        if getattr(self.args, "format", "text") == "json":
            print(json.dumps(report, indent=2))

        all_passed = gate["passed"] and exec_results.get("unit_failed", 0) == 0
        return 0 if all_passed else 1

    # ------------------------------------------------------------------ #
    # AI generation — lightweight version for CLI (no full pipeline)
    # ------------------------------------------------------------------ #

    async def _generate_tests_simple(self, source_code: str, language: str) -> str:
        """Generate tests via the codegen chain without a full DB session."""
        self._log("[1/3] Analyzing source code with AI…")
        from chains.base import make_chain

        system = (
            "You are an expert test engineer. Write a complete, immediately runnable pytest test file "
            "for the provided Python source code. Follow the AAA (Arrange-Act-Assert) pattern. "
            "Every test function MUST have:\n"
            "  - A docstring with Given:/When:/Then: sections\n"
            "  - # --- Arrange --- comment\n"
            "  - # --- Act --- comment\n"
            "  - # --- Assert --- comment with named constant assertions\n"
            "Source is importable as 'source'. Return ONLY the test code — no fences, no explanation."
        )
        chain = make_chain(system, temperature=0.1, json_mode=False)
        self._log("[2/3] Generating tests…")
        resp = await chain.ainvoke({
            "input": f"Language: {language}\n\nSource code:\n```{language}\n{source_code}\n```"
        })
        code = resp.content if hasattr(resp, "content") else str(resp)
        # Strip markdown fences if present
        code = re.sub(r"^```[a-z]*\n?", "", code.strip())
        code = re.sub(r"\n?```$", "", code)
        self._log("[3/3] Tests generated.")
        return code

    # ------------------------------------------------------------------ #
    # Story mode
    # ------------------------------------------------------------------ #

    async def _run_story_mode(self) -> int:
        self._log("[1/1] Generating tests from user story…")
        from chains.story_to_tests import generate_tests_from_story
        result = await generate_tests_from_story(
            user_story=self.args.story,
            language="python",
        )
        all_code = "\n\n".join(tc["test_code"] for tc in result.get("test_cases", []))
        out_path = self.output_dir / result.get("test_file_name", "test_story.py")
        out_path.write_text(all_code, encoding="utf-8")
        total = result.get("total_tests", len(result.get("test_cases", [])))
        self._log(f"    Generated {total} test cases")
        self._log(f"    Saved to {out_path}")

        # Save minimal report
        report = {
            "generated_at": datetime.utcnow().isoformat(),
            "file": "story",
            "mode": "story",
            "story_summary": result.get("story_summary", ""),
            "total_tests": total,
            "summary": {"unit_passed": 0, "unit_failed": 0, "unit_coverage": 0.0},
            "coverage_gate": {"passed": True, "threshold": self.args.coverage_threshold},
            "status": "generated",
        }
        (self.output_dir / "last_report.json").write_text(json.dumps(report, indent=2))
        return 0

    # ------------------------------------------------------------------ #
    # Test execution
    # ------------------------------------------------------------------ #

    def _execute_tests(self) -> dict:
        self._log("[…] Executing tests in sandbox…")
        proc = subprocess.run(
            ["pytest", str(self.output_dir), "--tb=short", "-q",
             "--cov=.", "--cov-report=json:coverage.json",
             "--ignore=edgetest_output"],
            capture_output=True, text=True, cwd=str(self.output_dir),
        )
        self._log(proc.stdout.strip() or "(no output)")

        passed = failed = 0
        for line in proc.stdout.split("\n"):
            m = re.search(r"(\d+) passed", line)
            if m:
                passed = int(m.group(1))
            m = re.search(r"(\d+) failed", line)
            if m:
                failed = int(m.group(1))

        coverage = 0.0
        cov_file = self.output_dir / "coverage.json"
        if cov_file.exists():
            try:
                data = json.loads(cov_file.read_text())
                coverage = data.get("totals", {}).get("percent_covered", 0.0)
            except Exception:
                pass

        return {
            "unit_passed": passed,
            "unit_failed": failed,
            "unit_coverage": round(coverage, 1),
            "integration_passed": 0,
            "integration_failed": 0,
        }

    # ------------------------------------------------------------------ #
    # GitHub Actions workflow
    # ------------------------------------------------------------------ #

    def _save_github_workflow(self, language: str) -> None:
        try:
            from jinja2 import Environment, FileSystemLoader
            base = Path(__file__).parent
            env = Environment(loader=FileSystemLoader(str(base / "templates")))
            tpl = env.get_template("github_actions.yml.j2")
            rendered = tpl.render(
                language=language,
                coverage_threshold=self.args.coverage_threshold,
                test_paths=["tests/"],
                dependency_file="requirements.txt",
                branch="main",
            )
            wf_dir = Path(".github/workflows")
            wf_dir.mkdir(parents=True, exist_ok=True)
            wf_path = wf_dir / "edgetest.yml"
            wf_path.write_text(rendered, encoding="utf-8")
            self._log(f"    Saved GitHub Actions workflow → {wf_path}")
        except Exception as exc:
            self._log(f"    Warning: could not save workflow — {exc}")

    # ------------------------------------------------------------------ #
    # Helpers
    # ------------------------------------------------------------------ #

    @staticmethod
    def _detect_language(filepath: str) -> str:
        ext = Path(filepath).suffix.lower()
        return {
            ".py": "python",
            ".js": "javascript",
            ".ts": "typescript",
            ".java": "java",
            ".cs": "csharp",
            ".cpp": "cpp",
            ".cc": "cpp",
            ".cxx": "cpp",
        }.get(ext, "python")

    def _read_source(self):
        try:
            return Path(str(self.args.file)).read_text(encoding="utf-8")
        except FileNotFoundError:
            self._log(f"Error: file not found — {self.args.file}", error=True)
            return None

    def _log(self, msg: str, bold: bool = False, error: bool = False) -> None:
        red, b, reset = "\033[31m", "\033[1m", "\033[0m"
        if error:
            print(f"{red}{msg}{reset}", file=sys.stderr)
        elif bold:
            print(f"{b}{msg}{reset}")
        else:
            print(msg)

    def _print_result(self, results: dict, gate: dict) -> None:
        passed = gate["passed"]
        icon = "✓" if passed else "✗"
        green, red, reset = "\033[32m", "\033[31m", "\033[0m"
        color = green if passed else red
        print(
            f"\n{color}{icon}  "
            f"{results.get('unit_passed', 0)} passed  "
            f"{results.get('unit_failed', 0)} failed  "
            f"Coverage: {results.get('unit_coverage', 0):.1f}%  "
            f"Threshold: {gate['threshold']}%{reset}\n"
        )
