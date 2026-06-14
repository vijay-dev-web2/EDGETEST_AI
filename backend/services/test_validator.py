"""Validates that generated test code follows the mandatory AAA structure."""

from __future__ import annotations

import re


def validate_aaa_structure(test_code: str) -> dict:
    issues: list[str] = []
    functions = re.findall(r"def (test_\w+)\s*\([^)]*\)\s*:", test_code)

    if not functions:
        return {
            "valid": False,
            "issues": ["No test functions found in generated code"],
            "function_count": 0,
            "functions_checked": [],
            "passing_functions": 0,
            "compliance_percent": 0,
        }

    passing = 0

    for fn_name in functions:
        fn_issues: list[str] = []

        fn_start = test_code.find(f"def {fn_name}")
        if fn_start == -1:
            continue
        colon_pos = test_code.find(":", fn_start)
        fn_body = test_code[colon_pos + 1: colon_pos + 1200]

        # Check 1: docstring present
        has_docstring = '"""' in fn_body[:300] or "'''" in fn_body[:300]
        if not has_docstring:
            fn_issues.append(f"{fn_name}: missing docstring")

        # Check 2: Given/When/Then in docstring
        if has_docstring:
            docstring_end = fn_body.find('"""', 3)
            if docstring_end == -1:
                docstring_end = fn_body.find("'''", 3)
            docstring_content = fn_body[:docstring_end + 3].lower() if docstring_end > 0 else fn_body[:300].lower()
            if "given:" not in docstring_content:
                fn_issues.append(f"{fn_name}: docstring missing 'Given:'")
            if "when:" not in docstring_content:
                fn_issues.append(f"{fn_name}: docstring missing 'When:'")
            if "then:" not in docstring_content:
                fn_issues.append(f"{fn_name}: docstring missing 'Then:'")

        # Check 3: Arrange section
        body_lower = fn_body.lower()
        has_arrange = (
            "# --- arrange ---" in body_lower
            or "# arrange" in body_lower
            or "# setup" in body_lower
        )
        if not has_arrange:
            fn_issues.append(f"{fn_name}: missing '# --- Arrange ---' section")

        # Check 4: Act section
        has_act = "# --- act ---" in body_lower or "# act" in body_lower
        if not has_act:
            fn_issues.append(f"{fn_name}: missing '# --- Act ---' section")

        # Check 5: Assert section
        has_assert_section = "# --- assert ---" in body_lower or "# assert" in body_lower
        if not has_assert_section:
            fn_issues.append(f"{fn_name}: missing '# --- Assert ---' section")

        # Check 6: at least one assert statement
        if "assert " not in fn_body:
            fn_issues.append(f"{fn_name}: no assert statement found")

        # Check 7: no magic numbers in assert lines
        assert_lines = [l for l in fn_body.split("\n") if l.strip().startswith("assert ")]
        for line in assert_lines:
            if re.search(r"==\s*\d+\.?\d*\b", line):
                fn_issues.append(
                    f"{fn_name}: magic number in assertion — use a named constant"
                )
                break

        if not fn_issues:
            passing += 1
        else:
            issues.extend(fn_issues)

    compliance = round((passing / len(functions)) * 100) if functions else 0

    return {
        "valid": len(issues) == 0,
        "issues": issues,
        "function_count": len(functions),
        "functions_checked": functions,
        "passing_functions": passing,
        "compliance_percent": compliance,
    }
