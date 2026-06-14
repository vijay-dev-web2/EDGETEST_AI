"""Phase 0 — Framework Detection for EdgeTest AI.

Deterministically detects the test framework, language version, and locking
conventions (class naming, file naming, imports, assertion style, directory
structure) from config files **before** any LLM-based generation begins.

Supported config files
----------------------
* Python  — requirements.txt, setup.cfg, pyproject.toml
* JS/TS   — package.json
* Java    — pom.xml, build.gradle
* C#      — .csproj
* C++     — CMakeLists.txt

Public API
----------
detect_framework(language, config_files=None) → FrameworkProfile
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# FrameworkProfile — the locked output of Phase 0
# ---------------------------------------------------------------------------


@dataclass
class FrameworkProfile:
    """Immutable set of conventions locked before code generation."""

    language: str
    """One of: python, javascript, typescript, java, csharp, cpp."""

    test_framework: str
    """Detected test framework identifier (e.g. pytest, jest, junit5, xunit, gtest)."""

    class_naming: str
    """Pattern for test class names. Placeholders: {Name}."""

    file_naming: str
    """Pattern for test file names. Placeholders: {name}, {Name}."""

    import_style: list[str] = field(default_factory=list)
    """Locked list of import statements to include at the top of every test file."""

    assertion_style: str = ""
    """Primary assertion idiom (e.g. 'pytest.raises', 'expect().toThrow')."""

    directory_structure: str = "flat"
    """Directory layout: 'flat', 'src/test/java/...', 'tests/', etc."""

    package_declaration: str | None = None
    """Java/C# package/namespace declaration, or None."""

    source_module: str = "solution"
    """Default module/class name the generated tests should import from."""


# ---------------------------------------------------------------------------
# Detection helpers (pure parsing, no LLM)
# ---------------------------------------------------------------------------


def _detect_python(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect Python test framework from requirements.txt / pyproject.toml."""
    framework = "pytest"  # default

    for filename, content in config_files.items():
        lower = content.lower()
        if filename in ("requirements.txt", "requirements-dev.txt"):
            if "unittest2" in lower and "pytest" not in lower:
                framework = "unittest"
        elif filename in ("pyproject.toml", "setup.cfg"):
            if "[tool.pytest" in lower or "pytest" in lower:
                framework = "pytest"
            elif "unittest" in lower and "pytest" not in lower:
                framework = "unittest"

    if framework == "pytest":
        return FrameworkProfile(
            language="python",
            test_framework="pytest",
            class_naming="Test{Name}",
            file_naming="test_{name}.py",
            import_style=[
                "import pytest",
                "from unittest.mock import Mock, patch, MagicMock",
                "from solution import *",
            ],
            assertion_style="pytest.raises",
            directory_structure="flat",
            source_module="solution",
        )
    else:
        return FrameworkProfile(
            language="python",
            test_framework="unittest",
            class_naming="Test{Name}",
            file_naming="test_{name}.py",
            import_style=[
                "import unittest",
                "from unittest.mock import Mock, patch, MagicMock",
                "from solution import *",
            ],
            assertion_style="self.assertRaises",
            directory_structure="flat",
            source_module="solution",
        )


def _detect_javascript(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect JS test framework from package.json."""
    framework = "jest"  # default

    pkg_content = config_files.get("package.json", "")
    if pkg_content:
        try:
            pkg = json.loads(pkg_content)
            dev_deps = pkg.get("devDependencies", {})
            deps = pkg.get("dependencies", {})
            all_deps = {**deps, **dev_deps}
            if "vitest" in all_deps:
                framework = "vitest"
            elif "mocha" in all_deps:
                framework = "mocha"
            elif "jest" in all_deps:
                framework = "jest"
        except json.JSONDecodeError:
            pass

    if framework == "jest":
        return FrameworkProfile(
            language="javascript",
            test_framework="jest",
            class_naming="{name}",
            file_naming="{name}.test.js",
            import_style=["const {{ }} = require('./solution');"],
            assertion_style="expect().toThrow",
            directory_structure="flat",
            source_module="solution",
        )
    elif framework == "vitest":
        return FrameworkProfile(
            language="javascript",
            test_framework="vitest",
            class_naming="{name}",
            file_naming="{name}.test.js",
            import_style=[
                "import { describe, it, expect, beforeEach } from 'vitest';",
                "import { } from './solution';",
            ],
            assertion_style="expect().toThrow",
            directory_structure="flat",
            source_module="solution",
        )
    else:  # mocha
        return FrameworkProfile(
            language="javascript",
            test_framework="mocha",
            class_naming="{name}",
            file_naming="{name}.test.js",
            import_style=[
                "const { expect } = require('chai');",
                "const { } = require('./solution');",
            ],
            assertion_style="expect().to.throw",
            directory_structure="flat",
            source_module="solution",
        )


def _detect_typescript(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect TS test framework from package.json."""
    framework = "jest"  # default

    pkg_content = config_files.get("package.json", "")
    if pkg_content:
        try:
            pkg = json.loads(pkg_content)
            dev_deps = pkg.get("devDependencies", {})
            deps = pkg.get("dependencies", {})
            all_deps = {**deps, **dev_deps}
            if "vitest" in all_deps:
                framework = "vitest"
            elif "mocha" in all_deps:
                framework = "mocha"
            elif "jest" in all_deps or "ts-jest" in all_deps:
                framework = "jest"
        except json.JSONDecodeError:
            pass

    if framework == "jest":
        return FrameworkProfile(
            language="typescript",
            test_framework="jest",
            class_naming="{name}",
            file_naming="{name}.test.ts",
            import_style=["import { } from './solution';"],
            assertion_style="expect().toThrow",
            directory_structure="flat",
            source_module="solution",
        )
    elif framework == "vitest":
        return FrameworkProfile(
            language="typescript",
            test_framework="vitest",
            class_naming="{name}",
            file_naming="{name}.test.ts",
            import_style=[
                "import { describe, it, expect, beforeEach } from 'vitest';",
                "import { } from './solution';",
            ],
            assertion_style="expect().toThrow",
            directory_structure="flat",
            source_module="solution",
        )
    else:  # mocha
        return FrameworkProfile(
            language="typescript",
            test_framework="mocha",
            class_naming="{name}",
            file_naming="{name}.test.ts",
            import_style=[
                "import { expect } from 'chai';",
                "import { } from './solution';",
            ],
            assertion_style="expect().to.throw",
            directory_structure="flat",
            source_module="solution",
        )


def _detect_java(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect Java test framework from pom.xml / build.gradle."""
    framework = "junit5"  # default

    pom = config_files.get("pom.xml", "")
    gradle = config_files.get("build.gradle", "") + config_files.get("build.gradle.kts", "")

    combined = pom + gradle
    lower = combined.lower()

    if "junit-jupiter" in lower or "org.junit.jupiter" in lower:
        framework = "junit5"
    elif "testng" in lower:
        framework = "testng"
    elif "junit" in lower and "jupiter" not in lower:
        # Check for JUnit 4 specifically
        if "junit:junit:4" in lower or "junit:junit:" in lower:
            framework = "junit4"
        else:
            framework = "junit5"  # ambiguous, default to 5

    # Try to extract package from pom.xml groupId
    package = None
    group_match = re.search(r"<groupId>([^<]+)</groupId>", pom)
    artifact_match = re.search(r"<artifactId>([^<]+)</artifactId>", pom)
    if group_match:
        package = group_match.group(1)
        if artifact_match:
            package = f"{package}.{artifact_match.group(1)}"

    if framework == "junit5":
        return FrameworkProfile(
            language="java",
            test_framework="junit5",
            class_naming="Test{Name}",
            file_naming="Test{Name}.java",
            import_style=[
                "import org.junit.jupiter.api.Test;",
                "import org.junit.jupiter.api.BeforeEach;",
                "import org.junit.jupiter.api.DisplayName;",
                "import org.junit.jupiter.api.extension.ExtendWith;",
                "import org.junit.jupiter.params.ParameterizedTest;",
                "import org.junit.jupiter.params.provider.CsvSource;",
                "import static org.junit.jupiter.api.Assertions.*;",
                "import org.mockito.Mock;",
                "import org.mockito.InjectMocks;",
                "import org.mockito.junit.jupiter.MockitoExtension;",
                "import static org.mockito.Mockito.*;",
            ],
            assertion_style="assertThrows",
            directory_structure="src/test/java",
            package_declaration=f"package {package};" if package else None,
            source_module="Solution",
        )
    elif framework == "junit4":
        return FrameworkProfile(
            language="java",
            test_framework="junit4",
            class_naming="Test{Name}",
            file_naming="Test{Name}.java",
            import_style=[
                "import org.junit.Test;",
                "import org.junit.Before;",
                "import org.junit.runner.RunWith;",
                "import static org.junit.Assert.*;",
                "import org.mockito.Mock;",
                "import org.mockito.InjectMocks;",
                "import org.mockito.junit.MockitoJUnitRunner;",
                "import static org.mockito.Mockito.*;",
            ],
            assertion_style="assertThrows",
            directory_structure="src/test/java",
            package_declaration=f"package {package};" if package else None,
            source_module="Solution",
        )
    else:  # testng
        return FrameworkProfile(
            language="java",
            test_framework="testng",
            class_naming="Test{Name}",
            file_naming="Test{Name}.java",
            import_style=[
                "import org.testng.annotations.Test;",
                "import org.testng.annotations.BeforeMethod;",
                "import static org.testng.Assert.*;",
            ],
            assertion_style="assertThrows",
            directory_structure="src/test/java",
            package_declaration=f"package {package};" if package else None,
            source_module="Solution",
        )


def _detect_csharp(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect C# test framework from .csproj files."""
    framework = "xunit"  # default

    for filename, content in config_files.items():
        if filename.endswith(".csproj"):
            lower = content.lower()
            if "nunit" in lower:
                framework = "nunit"
            elif "mstest" in lower:
                framework = "mstest"
            elif "xunit" in lower:
                framework = "xunit"

    # Try to extract namespace from .csproj RootNamespace
    namespace = None
    for filename, content in config_files.items():
        if filename.endswith(".csproj"):
            ns_match = re.search(r"<RootNamespace>([^<]+)</RootNamespace>", content)
            if ns_match:
                namespace = ns_match.group(1)

    if framework == "xunit":
        return FrameworkProfile(
            language="csharp",
            test_framework="xunit",
            class_naming="{Name}Tests",
            file_naming="{Name}Tests.cs",
            import_style=[
                "using Xunit;",
                "using Moq;",
                "using System;",
                "using System.Collections.Generic;",
            ],
            assertion_style="Assert.Throws<T>",
            directory_structure="flat",
            package_declaration=f"namespace {namespace}.Tests;" if namespace else None,
            source_module="Solution",
        )
    elif framework == "nunit":
        return FrameworkProfile(
            language="csharp",
            test_framework="nunit",
            class_naming="{Name}Tests",
            file_naming="{Name}Tests.cs",
            import_style=[
                "using NUnit.Framework;",
                "using Moq;",
                "using System;",
                "using System.Collections.Generic;",
            ],
            assertion_style="Assert.Throws<T>",
            directory_structure="flat",
            package_declaration=f"namespace {namespace}.Tests;" if namespace else None,
            source_module="Solution",
        )
    else:  # mstest
        return FrameworkProfile(
            language="csharp",
            test_framework="mstest",
            class_naming="{Name}Tests",
            file_naming="{Name}Tests.cs",
            import_style=[
                "using Microsoft.VisualStudio.TestTools.UnitTesting;",
                "using Moq;",
                "using System;",
                "using System.Collections.Generic;",
            ],
            assertion_style="Assert.ThrowsException<T>",
            directory_structure="flat",
            package_declaration=f"namespace {namespace}.Tests;" if namespace else None,
            source_module="Solution",
        )


def _detect_cpp(config_files: dict[str, str]) -> FrameworkProfile:
    """Detect C++ test framework from CMakeLists.txt."""
    framework = "gtest"  # default

    cmake = config_files.get("CMakeLists.txt", "")
    lower = cmake.lower()

    if "catch2" in lower or "catch_discover_tests" in lower:
        framework = "catch2"
    elif "boost_test" in lower or "boost.test" in lower:
        framework = "boost"
    elif "gtest" in lower or "googletest" in lower or "google_test" in lower:
        framework = "gtest"

    if framework == "gtest":
        return FrameworkProfile(
            language="cpp",
            test_framework="gtest",
            class_naming="{Name}Test",
            file_naming="test_{name}.cpp",
            import_style=[
                '#include <gtest/gtest.h>',
                '#include "solution.h"',
            ],
            assertion_style="EXPECT_THROW",
            directory_structure="flat",
            source_module="solution",
        )
    elif framework == "catch2":
        return FrameworkProfile(
            language="cpp",
            test_framework="catch2",
            class_naming="{Name}Test",
            file_naming="test_{name}.cpp",
            import_style=[
                '#include <catch2/catch_test_macros.hpp>',
                '#include "solution.h"',
            ],
            assertion_style="REQUIRE_THROWS_AS",
            directory_structure="flat",
            source_module="solution",
        )
    else:  # boost
        return FrameworkProfile(
            language="cpp",
            test_framework="boost",
            class_naming="{Name}Test",
            file_naming="test_{name}.cpp",
            import_style=[
                '#define BOOST_TEST_MODULE SolutionTest',
                '#include <boost/test/included/unit_test.hpp>',
                '#include "solution.h"',
            ],
            assertion_style="BOOST_CHECK_THROW",
            directory_structure="flat",
            source_module="solution",
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


_DETECTORS = {
    "python": _detect_python,
    "javascript": _detect_javascript,
    "typescript": _detect_typescript,
    "java": _detect_java,
    "csharp": _detect_csharp,
    "cpp": _detect_cpp,
}


def detect_framework(
    language: str,
    config_files: dict[str, str] | None = None,
) -> FrameworkProfile:
    """Detect the test framework for *language* from optional config file contents.

    Parameters
    ----------
    language : str
        One of: python, javascript, typescript, java, csharp, cpp.
    config_files : dict[str, str] | None
        Mapping of config filename → file content.  When ``None`` or empty,
        sensible defaults are used (pytest, jest, junit5, xunit, gtest).

    Returns
    -------
    FrameworkProfile
        Locked conventions to use throughout the pipeline.
    """
    lang = language.lower()
    detector = _DETECTORS.get(lang)
    if detector is None:
        raise ValueError(
            f"Unsupported language: {language!r}. "
            f"Supported: {', '.join(sorted(_DETECTORS))}"
        )
    return detector(config_files or {})
