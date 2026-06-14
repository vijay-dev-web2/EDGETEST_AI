#!/usr/bin/env python3
"""
EdgeTest AI CLI
Usage:
  edgetest run <file> [options]
  edgetest report [--format text|json|html]
  edgetest --help
"""
import argparse
import asyncio
import json
import sys
from pathlib import Path


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="edgetest",
        description="EdgeTest AI — AI-powered test generator",
    )
    sub = parser.add_subparsers(dest="command")

    # edgetest run
    run = sub.add_parser("run", help="Generate and execute tests for a file")
    run.add_argument("file", help="Source file (.py, .js, .ts, .java, .cs)")
    run.add_argument(
        "--output", "-o", default="./edgetest_output",
        help="Output directory for generated tests (default: ./edgetest_output)",
    )
    run.add_argument(
        "--coverage-threshold", "-c", type=int, default=80,
        help="Minimum coverage %% required (default: 80)",
    )
    run.add_argument(
        "--no-autofix", action="store_true",
        help="Disable auto-fix loop for failing tests",
    )
    run.add_argument(
        "--unit-only", action="store_true",
        help="Generate and run unit tests only",
    )
    run.add_argument(
        "--integration-only", action="store_true",
        help="Generate and run integration tests only",
    )
    run.add_argument(
        "--format", choices=["text", "json", "junit"],
        default="text", help="Output format (default: text)",
    )
    run.add_argument(
        "--ci", action="store_true",
        help="CI mode: exit 0 = pass, exit 1 = fail, no interactive prompts",
    )
    run.add_argument(
        "--story", "-s",
        help="User story text — generates tests from story instead of code",
    )
    run.add_argument(
        "--save-workflow", action="store_true",
        help="Save GitHub Actions workflow YAML to .github/workflows/",
    )

    # edgetest report
    rpt = sub.add_parser("report", help="Show last saved report")
    rpt.add_argument(
        "--output", "-o", default="./edgetest_output",
        help="Output directory used in 'run' (default: ./edgetest_output)",
    )
    rpt.add_argument(
        "--format", choices=["text", "json", "html"],
        default="text", help="Output format (default: text)",
    )

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "run":
        sys.exit(asyncio.run(cmd_run(args)))
    elif args.command == "report":
        sys.exit(asyncio.run(cmd_report(args)))


async def cmd_run(args) -> int:
    """Returns 0 for success, 1 for failure."""
    import os
    os.environ.setdefault("EDGETEST_CLI", "true")

    # Ensure backend/ is on sys.path so chain imports work
    backend_path = Path(__file__).parent / "backend"
    if str(backend_path) not in sys.path:
        sys.path.insert(0, str(backend_path))

    from cli_runner import CLIRunner
    runner = CLIRunner(args)
    return await runner.run()


async def cmd_report(args) -> int:
    report_path = Path(args.output) / "last_report.json"
    if not report_path.exists():
        print("No report found. Run 'edgetest run <file>' first.")
        return 1
    with open(report_path) as f:
        report = json.load(f)
    if args.format == "json":
        print(json.dumps(report, indent=2))
    else:
        _print_text_report(report)
    return 0


def _print_text_report(report: dict) -> None:
    s = report.get("summary", {})
    gate = report.get("coverage_gate", {})
    passed = gate.get("passed", False)
    green, red, bold, reset = "\033[32m", "\033[31m", "\033[1m", "\033[0m"
    color = green if passed else red
    print(f"\n{bold}EdgeTest AI Report{reset}")
    print("=" * 48)
    print(f"  File:          {report.get('file', 'unknown')}")
    print(f"  Generated:     {report.get('generated_at', '')}")
    print(f"  Unit tests:    {s.get('unit_passed', 0)} passed / {s.get('unit_failed', 0)} failed")
    print(f"  Integration:   {s.get('integration_passed', 0)} passed / {s.get('integration_failed', 0)} failed")
    print(f"  Coverage:      {gate.get('unit_coverage', 0):.1f}%")
    print(f"  Threshold:     {gate.get('threshold', 80)}%")
    status = "PASS" if passed else "FAIL"
    print(f"  Gate:          {color}{status}{reset}")
    if gate.get("reasons"):
        for r in gate["reasons"]:
            print(f"  {red}!{reset} {r}")
    if gate.get("recommendation"):
        print(f"\n  Tip: {gate['recommendation']}")
    print("=" * 48 + "\n")


if __name__ == "__main__":
    main()
