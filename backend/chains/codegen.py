"""Test-code generation LangChain chain for EdgeTest AI.

Generates immediately runnable pytest (Python) or Jest (JavaScript/TypeScript)
test files from source code and a list of selected test scenarios.

Pipeline phases implemented here
---------------------------------
* **Phase 4 — State Tracking**: system prompts mandate step-by-step variable
  tracing and exact formula computation before every numeric assertion.
* **Phase 5 — Test Code Generation**: generates exactly N test methods,
  uses assertion values from Phase 4, applies naming/imports from Phase 0.
* **Phase 6 — Verification Gate**: validates test-method count = N, class
  name / package / imports match the FrameworkProfile, and no assertion
  contains an uncomputed numeric value.

Validation rules enforced before accepting LLM output
------------------------------------------------------
* Every parameter name declared in ``@pytest.mark.parametrize("a, b, ...")``
  must appear in the decorated function's argument list (Rule 1 / Rule 2).
* A data-providing fixture and ``@pytest.mark.parametrize`` for the same data
  are mutually exclusive — exactly one must be chosen (Rule 3).
* Syntax errors are caught and auto-fixed with autopep8 when available.

If the LLM produces invalid code, the chain retries up to three times with
structured error feedback appended to the prompt. After three failures the
exception is re-raised so the caller can surface it to the user.

Public API
----------
generate_tests(code, language, selected_scenarios, session_id,
               extra_context, user_story, framework_profile,
               coverage_manifest) → list[TestFile]
"""

from __future__ import annotations

import ast
import json
import logging
import pathlib
import re
import uuid
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from chains.base import make_chain
from chains.coverage_extract import CoverageManifest
from chains.framework_detect import FrameworkProfile, detect_framework

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_STATE_TRACKING_INSTRUCTIONS = """\

══════════════════════════════════════════════════════
MANDATORY TEST STRUCTURE — AAA PATTERN (CRITICAL)
══════════════════════════════════════════════════════
Every single test function MUST follow this exact pattern with no exceptions:

def test_[function]_[scenario]_[expected_result]():
    \"\"\"
    Given: [precondition — what state exists before the action]
    When:  [action — what the test does, one sentence]
    Then:  [expected outcome — what is asserted and why]
    \"\"\"
    # --- Arrange ---
    # Set up ALL inputs, mocks, fixtures, and preconditions here.

    # --- Act ---
    # Call the function under test EXACTLY ONCE.
    result = function_under_test(args)

    # --- Assert ---
    # Verify the outcome. Use named constants, not magic numbers.
    EXPECTED_VALUE = 100.0
    assert result == EXPECTED_VALUE, f"Expected {EXPECTED_VALUE}, got {result}"

NAMING RULES:
- Function name: test_[what]_[condition]_[expected]
  GOOD: test_deposit_negative_amount_raises_value_error
  BAD:  test_deposit_1, test_case_3, test_it_works

DOCSTRING RULES:
- Every test MUST have a docstring.
- Docstring MUST contain Given:, When:, Then: on separate lines.
- No empty Given/When/Then — each must be a real sentence.

CONSTANTS RULES:
- NO magic numbers or magic strings in assertions.
  BAD:  assert result == 1000
  GOOD: EXPECTED_BALANCE = 1000.0; assert result == EXPECTED_BALANCE

STRUCTURE RULES:
- ALL three comment markers are REQUIRED in every test:
  # --- Arrange ---
  # --- Act ---
  # --- Assert ---
- Each section must have at least one line of code.
- Act section has EXACTLY ONE function call. No loops in Act.

══════════════════════════════════════════════════════
STEP 4 — POLYGLOT SYNTAX ENGINE (CRITICAL RULES)
══════════════════════════════════════════════════════
Generate clean, runnable, syntactically perfect test code matching the source
file's language framework. Maximise Branch, Boundary, and Exception coverage.

A) STATE TRACKING — MANDATORY before every numeric assertion:
   1. Trace variable state step by step through the exact source formula.
   2. Show the computation as a comment immediately above the assertion:
      # State: balance = 100 + deposit(50) = 150
      assert account.balance == 150
   3. NEVER estimate, round, or guess a numeric expected value.
   4. For chained operations trace every step:
      # Step 1: balance = 100 + 50 = 150
      # Step 2: balance = 150 - 30 = 120
      assert account.balance == 120

B) PYTHON-SPECIFIC RULES:
   - Use pytest. Import: import pytest
   - Exceptions: use pytest.raises() — NEVER bare try/except in tests
     with pytest.raises(ValueError, match="Amount must be positive"):
         account.deposit(-1)
   - Floating-point: use pytest.approx() — NEVER == on floats
     assert result == pytest.approx(3.14, rel=1e-6)
   - Boundary parametrize: use @pytest.mark.parametrize for N-1/N/N+1 triples
     @pytest.mark.parametrize("amount,expected", [(999, True), (1000, True), (1001, False)])
     def test_transfer_boundary(account, amount, expected):
         assert account.can_transfer(amount) == expected

C) JAVASCRIPT / TYPESCRIPT RULES:
   - Use Jest (or Vitest if detected). Import from the correct module.
   - Exceptions: use .toThrow() — NEVER try/catch in tests
     expect(() => account.deposit(-1)).toThrow("Amount must be positive");
   - Floating-point: use .toBeCloseTo() — NEVER toBe() on floats
     expect(result).toBeCloseTo(3.14, 6);
   - Boundary table tests: use it.each() for N-1/N/N+1 triples
     it.each([
       [999, true],
       [1000, true],
       [1001, false],
     ])("transfer(%i) → %s", (amount, expected) => {
       expect(account.canTransfer(amount)).toBe(expected);
     });

D) COVERAGE COMPLETENESS CHECK (before finalising):
   - Every GUARD clause from the source must have at least one test that
     violates it (negative test).
   - Every THROW / RAISE must have at least one test that triggers it.
   - Every comparison boundary N must have tests at N-1, N, and N+1.
   - Every boolean return must have both a true-path and false-path test.
"""

_PYTHON_FRAMEWORK = """\
Generate pytest-style tests using these strict rules:

IMPORTS & STRUCTURE
- The source code is importable as the module `solution` — always use:
    from solution import MyClass, my_func
- Top-level imports: pytest, unittest.mock (Mock, patch, MagicMock)
- Name every test function: test_<subject>_<condition>_<expectation>
- Do NOT include a __main__ block
RULE 1 — PARAMETRIZE vs FIXTURES (CRITICAL — violation causes runtime error):
@pytest.mark.parametrize and a data-providing fixture are MUTUALLY EXCLUSIVE
for the same test data. Pick EXACTLY ONE:

  Option A — fixture only (preferred for complex multi-step setup):
      @pytest.fixture
      def registered_user():
          return ("alice", "password123", "alice@example.com")

      def test_login_success(auth_service, registered_user):
          username, password, email = registered_user
          result = auth_service.login(username, password)
          assert result is not None

  Option B — parametrize only (preferred for multiple input variations):
      @pytest.mark.parametrize("username,password,email", [
          ("alice", "pass1234", "alice@example.com"),
          ("bob",   "pass5678", "bob@example.com"),
      ])
      def test_login_success(auth_service, username, password, email):
          auth_service.register(username, password, email)
          result = auth_service.login(username, password)
          assert result is not None

RULE 2 — PARAMETRIZE SIGNATURE MUST MATCH (CRITICAL):
When using @pytest.mark.parametrize, every parameter name declared in the
decorator string MUST appear in the function's argument list.

  WRONG (pytest raises "function uses no argument 'a'"):
      @pytest.mark.parametrize("a, b, expected", [(1, 2, 3)])
      def test_add(calculator):         # ← a, b, expected are MISSING
          pass

  CORRECT:
      @pytest.mark.parametrize("a, b, expected", [(1, 2, 3)])
      def test_add(a, b, expected):     # ← ALL parametrize names present
          assert add(a, b) == expected

  CORRECT (parametrize + unrelated fixture is fine):
      @pytest.mark.parametrize("amount", [10, 50, 100])
      def test_deposit(account, amount):  # 'account' is a fixture, 'amount' is parametrized
          result = account.deposit(amount)
          assert result == amount

RULE 3 — NEVER UNPACK FIXTURE DATA VIA PARAMETRIZE VARIABLE:
If a fixture provides data, consume it via the fixture parameter — never
also declare the same names in @pytest.mark.parametrize.

  WRONG:
      @pytest.mark.parametrize("username, password", [("alice", "pw")])
      def test_login(auth_service, registered_user):   # registered_user provides same data
          username, password = registered_user          # username/password never received

  CORRECT — use fixture only:
      def test_login(auth_service, registered_user):
          username, password = registered_user
          assert auth_service.login(username, password) is not None

RULE 4 — EXCEPTION TESTS:
Use @pytest.mark.parametrize for multiple invalid inputs:
    @pytest.mark.parametrize("amount", [-1, 0, -100])
    def test_deposit_invalid(account, amount):
        with pytest.raises(ValueError):
            account.deposit(amount)

RULE 5 — PREFERRED PATTERN BY USE CASE:
- Simple happy path          → fixture, no parametrize
- Multiple valid inputs      → parametrize only
- Error/exception cases      → parametrize with invalid inputs
- Complex workflow (multi-step) → fixtures only
- Boundary/edge values       → parametrize
""" + _STATE_TRACKING_INSTRUCTIONS

_JS_FRAMEWORK = """\
Generate Jest-style tests using these strict rules:

IMPORTS & STRUCTURE
- Source code is at `'./solution'` — always import from there:
    const { myFunc } = require('./solution')   // CJS
    import { myFunc } from './solution'         // ESM
- Group tests with describe() named after the unit under test
- Write each scenario as it() or test() with a full English description
- Use jest.mock('<module>') at the top for external dependencies
- Use expect() with the most specific matcher (toEqual, toThrow, etc.)

RULE 1 — it.each vs beforeEach (CRITICAL):
it.each and a data-providing beforeEach are MUTUALLY EXCLUSIVE for the same data.

  WRONG (beforeEach already sets testUser, don't also use it.each with user data):
      beforeEach(() => { testUser = { username: 'alice', password: 'pw' }; });
      it.each([['alice', 'pw']])('test_login %s', (username, password) => {
          const result = login(testUser.username, testUser.password);  // duplicate
      });

  CORRECT — use beforeEach only:
      beforeEach(() => { account = new BankAccount('alice', 100); });
      it('deposits successfully', () => {
          expect(account.deposit(50)).toBe(150);
      });

  CORRECT — use it.each only (no overlapping beforeEach setup):
      it.each([
          [10,  110],
          [50,  150],
          [100, 200],
      ])('deposit(%i) returns %i', (amount, expected) => {
          const account = new BankAccount('alice', 100);
          expect(account.deposit(amount)).toBe(expected);
      });

RULE 2 — EXCEPTION TESTS:
    it.each([-1, 0, -100])('deposit(%i) throws', (amount) => {
        expect(() => account.deposit(amount)).toThrow();
    });
""" + _STATE_TRACKING_INSTRUCTIONS

_JAVA_FRAMEWORK = """\
Generate JUnit 5 tests using these strict rules:

IMPORTS & STRUCTURE
- The source class is in the same package — import it directly:
    import com.example.service.UserService;
    import com.example.model.User;
- Top-level imports: org.junit.jupiter.api.Test, org.junit.jupiter.api.BeforeEach,
  org.junit.jupiter.api.DisplayName, org.mockito.Mock, org.mockito.InjectMocks,
  org.mockito.Mockito (static imports: when, verify, any, eq)
- Annotate every test class with @ExtendWith(MockitoExtension.class)
- Name every test method: should<Condition>_when<Scenario>
- Use @BeforeEach to initialise common fixtures
- Use @DisplayName for human-readable test descriptions
- Cover: happy path, null inputs, empty collections, boundary values, exceptions

RULE 1 — MOCKING (CRITICAL):
- Mock external dependencies (repositories, HTTP clients, external services) with @Mock
- Use @InjectMocks on the class under test
- Never mock the class under test itself

RULE 2 — ASSERTIONS:
- Use org.junit.jupiter.api.Assertions.* (assertEquals, assertThrows, assertNotNull, etc.)
- For exception tests: assertThrows(ExceptionClass.class, () -> unit.method(badInput))

RULE 3 — SPRING BOOT DETECTION:
- If the source uses @RestController, @Service, or @Repository, set up Mockito accordingly
- For @RestController: test the service layer (not the HTTP layer) unless MockMvc is requested

RULE 4 — FILE NAMING:
- Output filename: Test{OriginalClassName}.java (e.g., TestUserService.java)
- Include the correct package declaration at the top of the file

RULE 5 — IMPORTS VERSION (CRITICAL):
- ALWAYS use JUnit 5 (Jupiter) imports: org.junit.jupiter.api.*
- NEVER use JUnit 4 imports: org.junit.Test, org.junit.Assert
- Parameterized tests: use @ParameterizedTest + @CsvSource from org.junit.jupiter.params
""" + _STATE_TRACKING_INSTRUCTIONS

_CSHARP_FRAMEWORK = """\
Generate xUnit tests using these strict rules:

IMPORTS & STRUCTURE
- The source class is in the same namespace — reference it directly:
    using MyApp.Services;
    using MyApp.Models;
- Top-level usings: Xunit, Moq, System, System.Collections.Generic
- Use [Fact] for single-case tests, [Theory] + [InlineData] for multiple inputs
- Name every test method: MethodName_Should<Expectation>_When<Condition>
- Use constructor injection for shared setup (xUnit creates a new instance per test)
- Declare a private readonly Mock<IDependency> _mockDep and the SUT in the constructor

RULE 1 — MOCKING (CRITICAL):
- Mock interfaces/abstract dependencies with Moq: new Mock<IUserRepository>()
- Call _mock.Setup(x => x.Method(It.IsAny<Type>())).Returns(value) for happy-path
- Call _mock.Verify(x => x.Method(It.IsAny<Type>()), Times.Once()) for side-effects

RULE 2 — ASSERTIONS:
- Use Assert.Equal, Assert.Null, Assert.NotNull, Assert.Throws<T> from xUnit

RULE 3 — ASP.NET DETECTION:
- If the source uses Controllers/Services/Repositories, set up Moq for interfaces
- For controllers: inject mock services, call action methods directly

RULE 4 — FILE NAMING:
- Output filename: {OriginalClassName}Tests.cs (e.g., UserServiceTests.cs)
- Include the correct namespace declaration

RULE 5 — NAMESPACE (CRITICAL):
- ALWAYS include a namespace declaration matching the source project
- Use file-scoped namespace syntax: namespace MyApp.Tests;
""" + _STATE_TRACKING_INSTRUCTIONS

_CPP_FRAMEWORK = """\
Generate Google Test (gtest) tests using these strict rules:

INCLUDES & STRUCTURE
- Include gtest header: #include <gtest/gtest.h>
- Include the header under test: #include "solution.h" (or the detected header)
- Name every TEST or TEST_F: ClassName_MethodName_Condition
- Use TEST(SuiteName, TestName) for standalone tests
- Use TEST_F(FixtureName, TestName) + a fixture class inheriting ::testing::Test for shared setup
- SetUp() initialises shared state; TearDown() cleans up

RULE 1 — ASSERTIONS:
- Use EXPECT_EQ, EXPECT_NE, EXPECT_TRUE, EXPECT_FALSE for non-fatal assertions
- Use ASSERT_EQ, ASSERT_NE, ASSERT_TRUE for fatal assertions that abort the test on failure
- Use EXPECT_THROW(expr, ExcType) for exception tests

RULE 2 — COVERAGE:
- Happy path: valid inputs, expected return values
- Null/empty inputs: nullptr, empty string, empty container
- Boundary values: INT_MIN, INT_MAX, 0, negative numbers
- Exception/error cases: invalid arguments, division by zero, out-of-range

RULE 3 — MOCKING:
- If GoogleMock is available, use MOCK_METHOD macros for interface mocks
- Otherwise test concrete implementations directly

RULE 4 — FILE NAMING:
- Output filename: test_{original_filename}.cpp (e.g., test_calculator.cpp)

RULE 5 — MAIN FUNCTION (CRITICAL):
- ALWAYS include main() at the bottom:
  int main(int argc, char **argv) {
      ::testing::InitGoogleTest(&argc, argv);
      return RUN_ALL_TESTS();
  }
""" + _STATE_TRACKING_INSTRUCTIONS

# ---------------------------------------------------------------------------
# Hardened system prompt — replaces _SYSTEM_TEMPLATE + old addenda.
# Enforces strict classification gate before any test is generated.
# Uses str.replace() instead of str.format() so literal JSON braces inside
# the prompt text do not need escaping.
# ---------------------------------------------------------------------------

_HARDENED_SYSTEM_PROMPT = """\
You are a senior QA engineer generating test suites for a codebase.
Follow every rule in this prompt without exception.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
GOAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Generate two completely separate outputs:
  Output 1: Unit Tests
  Output 2: Integration Tests

These are NEVER mixed. A test belongs to exactly one category.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CLASSIFY THE CODE BEFORE WRITING ANY TEST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before writing a single test, inspect the provided code and produce
this classification map:

  Pure logic units (testable in isolation):
    - List every function/method/class with no external dependency
  Integration boundaries found:
    - List every place the code touches: database, file system,
      HTTP client, message queue, external API, another service class,
      framework router/controller, cache, email sender, etc.
    - If NONE found → set integration_tests.available = false

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DEFINITIONS — MEMORIZE THESE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

UNIT TEST:
  Tests ONE function or ONE class method in COMPLETE ISOLATION.
  All external dependencies are mocked, stubbed, or patched out.
  ✓ One class instantiated (the class under test)
  ✓ Zero real I/O (no DB, no network, no file system)
  ✓ All collaborators are mocks/stubs
  ✓ Deterministic — same result every run

INTEGRATION TEST:
  Tests REAL COLLABORATION between two or more DISTINCT components
  across a genuine architectural boundary.
  VALID boundaries (must use at least one):
  a) Service class + Repository class with real data store
  b) Service class + actual Database (SQLite in-memory counts)
  c) API route/controller + Service class
  d) Module + real File System (reads/writes actual temp files)
  e) Producer + Message Queue (real queue or realistic queue mock)
  f) Two or more DISTINCT service/module classes (different types,
     not two instances of the same class)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — MANDATORY DECISION GATE (INTEGRATION TESTS ONLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Before writing each integration test you MUST confirm:
  • Components involved: [list every distinct class/module]
  • Real boundary being crossed: [DB / FileSystem / HTTP / Queue / ServiceA→ServiceB]
  • Why this is NOT a unit test: [what makes isolation impossible]
  • Required real setup: [what real infrastructure is needed]

If any field cannot be answered truthfully → add to rejected_integration_tests
with the applicable rejection rule.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STRICT REJECTION RULES — REJECT ANY TEST MATCHING THESE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

RULE 1 — SINGLE CLASS: Only one class instantiated → unit test.
RULE 2 — SAME CLASS MULTIPLE INSTANCES: Two BankAccount objects is NOT
          an integration boundary — it is still one class.
RULE 3 — FAKE INFRASTRUCTURE: A Python list/dict pretending to be a
          database or queue is NOT a real boundary.
RULE 4 — LONG WORKFLOW: Many steps ≠ integration. Boundary = integration.
RULE 5 — NAME-BASED: "flow", "workflow", "transfer", "system" in the name
          does not make it an integration test.
RULE 6 — MOCK REMOVAL: Removing mocks from a unit test ≠ integration test
          without a real boundary.
RULE 7 — PURE LOGIC: If the test needs zero external setup (no DB, no file,
          no HTTP server, no queue) it is a unit test regardless of complexity.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — UNIT TEST GENERATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

For each unit, cover ALL of:
  □ POSITIVE   — valid input, expected output
  □ NEGATIVE   — invalid input, bad value, wrong type
  □ BOUNDARY   — min, max, zero, empty, None
  □ EXCEPTION  — errors raised with correct messages
  □ EDGE       — very large numbers, unicode, float precision

Mandatory AAA structure:
  def test_[function]_[condition]_[expected]():
      \"\"\"
      Given: [precondition]
      When:  [action]
      Then:  [outcome]
      \"\"\"
      # --- Arrange ---
      CONSTANT = value
      # --- Act ---
      result = function(args)  # EXACTLY ONE call
      # --- Assert ---
      EXPECTED = value
      assert result == EXPECTED

NAMING: test_[what]_[condition]_[expected]
  Good: test_deposit_zero_amount_raises_value_error
  Bad:  test_deposit_1, test_case_3, test_it_works

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — INTEGRATION TEST GENERATION RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Only generate if a boundary was confirmed in Step 1 and passed Step 2.

WHAT MUST BE REAL:
  - Database: use SQLite :memory: or a real test DB, NOT a Python dict
  - File system: use tempfile.mkdtemp(), NOT a string variable
  - HTTP: use TestClient (FastAPI/Flask) or httpretty, NOT a mock return
  - Queue: use a real in-memory queue, NOT a list

Mandatory structure:
  def test_[workflow]_[scenario]_[outcome]():
      \"\"\"
      Given: [ALL components initialized]
      When:  [action that CROSSES the boundary]
      Then:  [state verified across ALL components]

      Components: [list]
      Boundary:   [DB / FileSystem / HTTP / Queue / ServiceA→ServiceB]
      \"\"\"
      # --- Arrange ---
      # Initialize ALL real components
      # --- Act ---
      # ONE workflow action that crosses the boundary
      # --- Assert ---
      # Verify state in EVERY component involved

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LANGUAGE-SPECIFIC SYNTAX RULES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{framework_instructions}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — OUTPUT FORMAT (RETURN THIS EXACT JSON)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Return a JSON object with EXACTLY these top-level keys:

{
  "classification_map": {
    "pure_logic_units": ["list of functions/classes for unit testing"],
    "integration_boundaries": ["list of real boundaries found, or empty array"],
    "decision": "unit_only | integration_found | no_tests_possible"
  },
  "unit_tests": {
    "file_name": "test_unit_<module>.py",
    "test_count": <integer>,
    "coverage_categories": {
      "positive": <integer>, "negative": <integer>, "boundary": <integer>,
      "exception": <integer>, "edge": <integer>
    },
    "code": "<complete test file as a single string, or null>"
  },
  "integration_tests": {
    "available": <true|false>,
    "reason_if_unavailable": "<null or explanation>",
    "file_name": "<filename or null>",
    "test_count": <integer>,
    "gates_passed": [
      {
        "test_name": "<name>",
        "components": ["list"],
        "boundary": "<DB|FileSystem|HTTP|Queue|ServiceA→ServiceB>",
        "why_not_unit": "<explanation>",
        "required_setup": "<explanation>"
      }
    ],
    "code": "<complete test file as a single string, or null>"
  },
  "rejected_integration_tests": [
    {
      "proposed_name": "<name>",
      "rejection_rule": "<RULE 1|RULE 2|...|RULE 7>",
      "reason": "<plain English explanation>",
      "correct_classification": "<unit|not_testable>"
    }
  ]
}

Return ONLY valid JSON. No markdown fences. No text outside the JSON.
"""


def _system_prompt(language: str, test_mode: str = "unit") -> str:
    if language == "python":
        instructions = _PYTHON_FRAMEWORK
    elif language == "java":
        instructions = _JAVA_FRAMEWORK
    elif language == "csharp":
        instructions = _CSHARP_FRAMEWORK
    elif language == "cpp":
        instructions = _CPP_FRAMEWORK
    else:
        instructions = _JS_FRAMEWORK
    return _HARDENED_SYSTEM_PROMPT.replace("{framework_instructions}", instructions)


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class TestFile(BaseModel):
    filename: str = Field(min_length=1)
    language: Literal["python", "typescript", "javascript", "java", "csharp", "cpp"]
    code: str = Field(min_length=1)
    # AAA validation fields — populated after generation
    aaa_compliant: bool = True
    aaa_compliance_percent: int = 100
    aaa_issues: list[str] = Field(default_factory=list)
    # Classification fields — populated by the integration test route
    misclassified: bool = False
    classification_warning: str = ""


class CodegenResult(BaseModel):
    files: list[TestFile]


# ---------------------------------------------------------------------------
# Pydantic models for the hardened JSON format
# ---------------------------------------------------------------------------


class _CoverageCategories(BaseModel):
    positive: int = 0
    negative: int = 0
    boundary: int = 0
    exception: int = 0
    edge: int = 0


class _HardenedUnitTests(BaseModel):
    file_name: str = "test_unit.py"
    test_count: int = 0
    coverage_categories: _CoverageCategories = Field(default_factory=_CoverageCategories)
    code: str | None = None


class _HardenedIntegrationGate(BaseModel):
    test_name: str = ""
    components: list[str] = Field(default_factory=list)
    boundary: str = ""
    why_not_unit: str = ""
    required_setup: str = ""


class _HardenedIntegrationTests(BaseModel):
    available: bool = False
    reason_if_unavailable: str | None = None
    file_name: str | None = None
    test_count: int = 0
    gates_passed: list[_HardenedIntegrationGate] = Field(default_factory=list)
    code: str | None = None


class _RejectedIntegrationTest(BaseModel):
    proposed_name: str = ""
    rejection_rule: str = ""
    reason: str = ""
    correct_classification: str = "unit"


class _ClassificationMap(BaseModel):
    pure_logic_units: list[str] = Field(default_factory=list)
    integration_boundaries: list[str] = Field(default_factory=list)
    decision: str = "unit_only"


class HardenedCodegenResult(BaseModel):
    classification_map: _ClassificationMap = Field(default_factory=_ClassificationMap)
    unit_tests: _HardenedUnitTests | None = None
    integration_tests: _HardenedIntegrationTests | None = None
    rejected_integration_tests: list[_RejectedIntegrationTest] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# AST validation — catches parametrize/fixture conflicts before execution
# ---------------------------------------------------------------------------


def _validate_pytest_parametrize(code: str) -> list[str]:
    """Return a list of human-readable errors for parametrize violations.

    Checks that every name declared in @pytest.mark.parametrize("a, b, ...")
    actually appears in the decorated function's argument list.
    An empty list means the code is valid.
    """
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return [f"SyntaxError: {exc}"]

    errors: list[str] = []

    for node in ast.walk(tree):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            continue

        for dec in node.decorator_list:
            # Match @pytest.mark.parametrize(...)
            if not (
                isinstance(dec, ast.Call)
                and isinstance(dec.func, ast.Attribute)
                and dec.func.attr == "parametrize"
                and isinstance(dec.func.value, ast.Attribute)
                and dec.func.value.attr == "mark"
            ):
                continue

            if not dec.args:
                continue

            param_arg = dec.args[0]
            if not isinstance(param_arg, ast.Constant) or not isinstance(param_arg.value, str):
                continue

            # "a, b, expected" → ["a", "b", "expected"]
            param_names = [p.strip() for p in param_arg.value.split(",") if p.strip()]

            # Collect all argument names in the function signature
            all_args = (
                {a.arg for a in node.args.args}
                | {a.arg for a in node.args.posonlyargs}
                | {a.arg for a in node.args.kwonlyargs}
            )

            missing = [p for p in param_names if p not in all_args]
            if missing:
                errors.append(
                    f"Function `{node.name}` (line {node.lineno}): "
                    f"@pytest.mark.parametrize declares {missing!r} "
                    f"but those names are NOT in the function signature {sorted(all_args)!r}. "
                    f"Fix: add {missing!r} to the function's parameter list, "
                    f"OR remove @pytest.mark.parametrize and use only a fixture."
                )

    return errors


def _build_error_feedback(errors: list[str], attempt: int) -> str:
    bullet_errors = "\n".join(f"  • {e}" for e in errors)
    return (
        f"\n\n{'=' * 60}\n"
        f"ATTEMPT {attempt} VALIDATION FAILED — FIX BEFORE RETURNING:\n"
        f"{bullet_errors}\n\n"
        "Mandatory fixes:\n"
        "1. Every name in @pytest.mark.parametrize('a, b, ...') MUST appear "
        "in the function's argument list.\n"
        "2. NEVER use both a data-providing fixture AND @pytest.mark.parametrize "
        "for the same test data — choose ONE.\n"
        "3. If a fixture already provides the data, just unpack the fixture in "
        "the function body; do NOT also add @pytest.mark.parametrize.\n"
        f"{'=' * 60}"
    )


# ---------------------------------------------------------------------------
# File writer
# ---------------------------------------------------------------------------


_CONFTEST = (
    "import sys, pathlib\n"
    "sys.path.insert(0, str(pathlib.Path(__file__).parent))\n"
)


def _strip_markdown_fences(code: str) -> str:
    """Extract Python source from markdown code fences if present.

    If the code contains ``` fences, returns the content of the *last* complete
    fence block (the LLM often appends a corrected version after the original).
    Falls back to everything before the first fence if no closing fence is found.
    """
    if "```" not in code:
        return code
    lines = code.splitlines()
    starts: list[int] = []
    ends: list[int] = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("```"):
            if len(starts) == len(ends):
                starts.append(i)
            else:
                ends.append(i)
    if starts and ends:
        # Use the last complete fence block — LLMs often fix code in a second block
        last_start = starts[-1]
        last_end = ends[-1] if ends else len(lines)
        candidate = "\n".join(lines[last_start + 1 : last_end]).strip()
        if candidate:
            return candidate
    if starts:
        # Unclosed fence: take everything before the first fence marker
        before = "\n".join(lines[: starts[0]]).strip()
        if before:
            return before
    return code


def _sanitize_python(code: str) -> str:
    """Validate Python syntax and fix indentation with autopep8 if needed."""
    # Strip BOM and invisible Unicode chars that cause SyntaxError in the AST parser
    code = code.replace("﻿", "")
    code = code.replace("​", "")
    code = re.sub(r"[^\x00-\x7F\n\t ]", lambda m: " " if m.group() == "\xa0" else "", code)
    # Strip markdown code fences the LLM may have included
    code = _strip_markdown_fences(code)
    try:
        ast.parse(code)
        return code
    except SyntaxError:
        pass

    try:
        import autopep8
        fixed = autopep8.fix_code(code, options={"aggressive": 1})
        ast.parse(fixed)
        return fixed
    except SyntaxError as exc:
        raise ValueError(f"Source code has a syntax error that could not be auto-fixed: {exc}") from exc
    except ImportError:
        try:
            ast.parse(code)
        except SyntaxError as exc:
            raise ValueError(f"Source code has a syntax error: {exc}") from exc
        return code


_PY_IMPORT_RE = re.compile(
    r"^(?:from\s+([\w]+)\s+import|import\s+([\w]+))",
    re.MULTILINE,
)
_JS_IMPORT_RE = re.compile(
    r"""(?:require\(['"]\.?/?([^'"./]+)['"]|from\s+['"]\.?/?([^'"./]+)['"])""",
)
_JAVA_IMPORT_STEM_RE = re.compile(r"^import\s+(?:static\s+)?[\w$.]+\.(\w+);", re.MULTILINE)
_CS_USING_STEM_RE = re.compile(r"^using\s+(?:static\s+)?[\w.]+\.(\w+);", re.MULTILINE)
_CPP_INCLUDE_STEM_RE = re.compile(r'#include\s+"([^"]+)"')

_RESERVED = frozenset({
    "pytest", "unittest", "mock", "os", "sys", "re", "json", "math",
    "typing", "pathlib", "datetime", "collections", "itertools",
    "functools", "abc", "io", "copy", "time", "random",
    "jest", "describe", "it", "expect", "beforeEach", "afterEach",
})


def _infer_source_module(files: list[TestFile], language: str) -> set[str]:
    names: set[str] = set()
    for f in files:
        if language == "python":
            for m in _PY_IMPORT_RE.finditer(f.code):
                name = m.group(1) or m.group(2)
                if name and name not in _RESERVED and not name.startswith("test"):
                    names.add(name)
        elif language in ("javascript", "typescript"):
            for m in _JS_IMPORT_RE.finditer(f.code):
                name = m.group(1) or m.group(2)
                if name and name not in _RESERVED and not name.startswith("test"):
                    names.add(name)
        # Java, C#, C++ source modules are handled by extension-aware writers below
    return names


def _write_output_files(
    session_id: uuid.UUID,
    files: list[TestFile],
    source_code: str,
    language: str,
    structured_files: list[dict[str, str]] | None = None,
    subdir: str | None = None,
) -> pathlib.Path:
    base = pathlib.Path("/tmp/edgetest") / str(session_id)
    out_dir = base / subdir if subdir else base
    out_dir.mkdir(parents=True, exist_ok=True)

    if structured_files and language == "python":
        # Multi-file mode: save each repo file preserving directory structure
        for sf in structured_files:
            dest = out_dir / sf["path"]
            dest.parent.mkdir(parents=True, exist_ok=True)
            # Create __init__.py in sub-packages so relative imports work
            for parent_dir in dest.parents:
                if parent_dir == out_dir:
                    break
                init = parent_dir / "__init__.py"
                if not init.exists():
                    init.write_text("", encoding="utf-8")
            dest.write_text(sf["content"], encoding="utf-8")
        # Also write combined solution.py for backward compat with single-file tests
        try:
            _clean_src = _sanitize_python(source_code)
        except ValueError:
            _clean_src = _strip_markdown_fences(source_code)
        (out_dir / "solution.py").write_text(_clean_src, encoding="utf-8")
        (out_dir / "conftest.py").write_text(_CONFTEST, encoding="utf-8")
    elif language == "python":
        try:
            clean_code = _sanitize_python(source_code)
        except ValueError:
            # Source has a syntax error that couldn't be auto-fixed — write as-is.
            # The sandbox run will surface the actual error.
            clean_code = source_code
        (out_dir / "solution.py").write_text(clean_code, encoding="utf-8")
        for name in _infer_source_module(files, language):
            (out_dir / f"{name}.py").write_text(clean_code, encoding="utf-8")
        (out_dir / "conftest.py").write_text(_CONFTEST, encoding="utf-8")
    elif language in ("javascript", "typescript"):
        (out_dir / "solution.js").write_text(source_code, encoding="utf-8")
        for name in _infer_source_module(files, language):
            (out_dir / f"{name}.js").write_text(source_code, encoding="utf-8")
    elif language == "java":
        (out_dir / "Solution.java").write_text(source_code, encoding="utf-8")
    elif language == "csharp":
        (out_dir / "Solution.cs").write_text(source_code, encoding="utf-8")
    elif language == "cpp":
        (out_dir / "solution.cpp").write_text(source_code, encoding="utf-8")
        # Also write as solution.h so #include "solution.h" in tests resolves
        (out_dir / "solution.h").write_text(source_code, encoding="utf-8")

    for f in files:
        (out_dir / f.filename).write_text(f.code, encoding="utf-8")
    return out_dir


# ---------------------------------------------------------------------------
# Chain logic with validation + retry + verification gate
# ---------------------------------------------------------------------------


def _multifile_system_prompt(language: str, file_paths: list[str]) -> str:
    """System prompt for multi-file (GitHub repo) codegen."""
    file_list = "\n".join(f"  - {p}" for p in file_paths)

    if language == "python":
        module_names = [pathlib.Path(p).stem for p in file_paths if p.endswith(".py")]
        example_imports = "\n".join(
            f"  from {m} import <ClassName>" for m in module_names[:4]
        )
        import_rules = f"IMPORT RULES — use real module names, NOT 'solution':\n{example_imports}"
        instructions = _PYTHON_FRAMEWORK
    elif language == "java":
        example_imports = "\n".join(
            f"  import {pathlib.Path(p).stem};" for p in file_paths[:4] if p.endswith(".java")
        )
        import_rules = f"IMPORT RULES — use real class names:\n{example_imports}"
        instructions = _JAVA_FRAMEWORK
    elif language == "csharp":
        example_imports = "\n".join(
            f"  using {pathlib.Path(p).stem};" for p in file_paths[:4] if p.endswith(".cs")
        )
        import_rules = f"IMPORT RULES — use real namespace/class names:\n{example_imports}"
        instructions = _CSHARP_FRAMEWORK
    elif language == "cpp":
        example_imports = "\n".join(
            f'  #include "{pathlib.Path(p).name}"' for p in file_paths[:4]
            if p.endswith((".h", ".hpp"))
        )
        import_rules = f"INCLUDE RULES — include the actual headers:\n{example_imports}"
        instructions = _CPP_FRAMEWORK
    else:
        example_imports = ""
        import_rules = "IMPORT RULES — use real module names, NOT 'solution'."
        instructions = _JS_FRAMEWORK

    return (
        "You are an expert test engineer. Your only job is to write complete, "
        "immediately runnable test code — no placeholders, no TODOs.\n\n"
        f"{instructions}\n\n"
        "MULTI-FILE REPOSITORY MODE\n"
        f"Source files available:\n{file_list}\n\n"
        f"{import_rules}\n\n"
        "INTEGRATION TEST RULES:\n"
        "- Use REAL service instances — NEVER mock classes from the repo above\n"
        "- Only mock external I/O: network calls, time.sleep, random, DB connections\n"
        "- Assert BOTH return values AND side effects (state changes in other modules)\n\n"
        "UNIT TEST RULES:\n"
        "- May use Mock/patch for dependencies from within the repo\n\n"
        "Return a JSON object with exactly one key \"files\" whose value is an array. "
        "Each element must have EXACTLY these fields:\n"
        '  "filename": string — e.g. "test_orders.py", "TestOrderService.java", '
        '"OrderServiceTests.cs", "test_orders.cpp"\n'
        '  "language": "python", "typescript", "javascript", "java", "csharp", or "cpp"\n'
        '  "code": string — the full, self-contained test file\n\n'
        "Return only valid JSON. No markdown fences, no commentary outside the JSON."
    )


# ---------------------------------------------------------------------------
# Phase 6 — Verification Gate
# ---------------------------------------------------------------------------

# Language-aware regex patterns for counting test methods
_TEST_METHOD_PATTERNS: dict[str, re.Pattern] = {
    "python": re.compile(r"^\s*(?:async\s+)?def\s+(test_\w+)\s*\(", re.MULTILINE),
    "javascript": re.compile(r"(?:it|test)\s*\(\s*['\"]", re.MULTILINE),
    "typescript": re.compile(r"(?:it|test)\s*\(\s*['\"]", re.MULTILINE),
    "java": re.compile(r"(?:@Test|@ParameterizedTest|@RepeatedTest)\b", re.MULTILINE),
    "csharp": re.compile(r"(?:\[Fact\]|\[Theory\]|\[TestMethod\]|\[Test\])", re.MULTILINE),
    "cpp": re.compile(r"\b(?:TEST|TEST_F|TEST_P)\s*\(", re.MULTILINE),
}


def _count_test_methods(code: str, language: str) -> int:
    """Count the number of test methods in generated code."""
    pattern = _TEST_METHOD_PATTERNS.get(language)
    if pattern is None:
        return 0
    return len(pattern.findall(code))


def _verification_gate(
    files: list[TestFile],
    profile: FrameworkProfile | None,
    language: str,
) -> list[str]:
    """Phase 6 — verify generated tests before outputting.

    Returns a list of human-readable error strings.  Empty list = all checks pass.
    """
    errors: list[str] = []

    if profile is None:
        return errors

    # --- Check 2: class name / file name matches framework ---
    for f in files:
        if language == "java":
            # Expect Test{Name}.java pattern
            if not f.filename.startswith("Test") and not f.filename.endswith("Test.java"):
                errors.append(
                    f"FILE NAMING: '{f.filename}' does not match Java convention "
                    f"'{profile.file_naming}'. Expected pattern: Test<ClassName>.java"
                )
            # Check for JUnit 5 imports (not JUnit 4)
            if profile.test_framework == "junit5":
                if "import org.junit.Test;" in f.code and "import org.junit.jupiter" not in f.code:
                    errors.append(
                        f"IMPORT MISMATCH in '{f.filename}': using JUnit 4 import "
                        "'org.junit.Test' instead of JUnit 5 'org.junit.jupiter.api.Test'. "
                        "Replace all org.junit imports with org.junit.jupiter equivalents."
                    )
        elif language == "csharp":
            if not f.filename.endswith("Tests.cs"):
                errors.append(
                    f"FILE NAMING: '{f.filename}' does not match C# convention "
                    f"'{profile.file_naming}'. Expected pattern: <ClassName>Tests.cs"
                )
            # Check namespace declaration
            if profile.package_declaration and "namespace" not in f.code:
                errors.append(
                    f"MISSING NAMESPACE in '{f.filename}': expected a namespace declaration."
                )
        elif language == "cpp":
            # Check main() is present
            if "int main(" not in f.code and "RUN_ALL_TESTS" not in f.code:
                errors.append(
                    f"MISSING main() in '{f.filename}': gtest tests require "
                    "int main(int argc, char **argv) {{ ::testing::InitGoogleTest(...); }}"
                )

    # --- Check 3: imports match framework ---
    if profile.import_style:
        for f in files:
            code_lower = f.code.lower()
            # Check at least one of the locked imports is present
            found_any = False
            for imp in profile.import_style:
                # Extract a key token from the import to check
                key_tokens = [
                    t for t in imp.replace(";", "").replace("'", "").replace('"', "").split()
                    if len(t) > 3 and t not in ("import", "from", "using", "const", "#include")
                ]
                if any(tok.lower() in code_lower for tok in key_tokens):
                    found_any = True
                    break
            if not found_any and profile.import_style:
                errors.append(
                    f"IMPORT CHECK in '{f.filename}': none of the expected framework "
                    f"imports ({profile.test_framework}) were found. "
                    f"Expected at least one of: {profile.import_style[:3]}"
                )

    return errors


def _build_verification_feedback(errors: list[str], attempt: int) -> str:
    """Build error feedback specific to Phase 6 verification gate failures."""
    bullet_errors = "\n".join(f"  • {e}" for e in errors)
    return (
        f"\n\n{'=' * 60}\n"
        f"VERIFICATION GATE FAILED (attempt {attempt}) — FIX ALL ISSUES:\n"
        f"{bullet_errors}\n\n"
        "Requirements:\n"
        "1. Use the correct test framework imports (e.g. JUnit 5, not JUnit 4).\n"
        "2. Follow the file naming convention for the language.\n"
        "3. Include namespace/package declarations where required.\n"
        "4. For C++/gtest: always include main() with RUN_ALL_TESTS().\n"
        f"{'=' * 60}"
    )


# ---------------------------------------------------------------------------
# Coverage manifest → prompt context
# ---------------------------------------------------------------------------


def _build_coverage_prompt(manifest: CoverageManifest) -> str:
    """Build a prompt section from the coverage manifest for codegen."""
    lines = [
        "\n\nCOVERAGE MANIFEST (from Phase 2 — use these exact values in assertions):",
    ]

    if manifest.thresholds:
        lines.append("\nBOUNDARY VALUES to test:")
        for t in manifest.thresholds:
            vals = ", ".join(str(v) for v in t.test_values)
            lines.append(
                f"  • {t.function_name}: threshold {t.operator} {t.threshold_value} "
                f"→ test with [{vals}]"
            )

    if manifest.guards:
        lines.append("\nINPUT GUARDS to test (negative tests):")
        for g in manifest.guards:
            lines.append(
                f"  • {g.function_name}: violate '{g.guard_condition}' "
                f"with {g.violation_input} → expect {g.expected_error}"
            )

    if manifest.exceptions:
        lines.append("\nEXCEPTIONS to test:")
        for e in manifest.exceptions:
            lines.append(
                f"  • {e.function_name}: trigger {e.exception_type} "
                f"with {e.trigger_input}"
            )

    if manifest.boolean_returns:
        lines.append("\nBOOLEAN PATHS to test:")
        for b in manifest.boolean_returns:
            lines.append(
                f"  • {b.function_name}: true={b.true_example_input}, "
                f"false={b.false_example_input}"
            )

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def generate_tests(
    code: str,
    language: str,
    selected_categories: list[str],
    session_id: uuid.UUID,
    extra_context: dict[str, Any] | None = None,
    user_story: str | None = None,
    structured_files: list[dict[str, str]] | None = None,
    framework_profile: FrameworkProfile | None = None,
    coverage_manifest: CoverageManifest | None = None,
    subdir: str | None = None,
    test_mode: str = "unit",
    rejected_out: list[dict[str, Any]] | None = None,
) -> list[TestFile]:
    """Generate test files for the given scenarios and write them to /tmp/edgetest/{session_id}/.

    Pipeline phases implemented:
      Phase 0 → framework_profile (from caller or auto-detected)
      Phase 4 → state tracking instructions in system prompt
      Phase 5 → exact N test generation
      Phase 6 → verification gate before output

    When structured_files is provided (GitHub repo mode), generates tests that import
    real module names and saves each source file separately. For Python, validates
    @pytest.mark.parametrize correctness, retrying up to 3 times with error feedback.

    test_mode: "unit" or "integration" — controls which system prompt addendum is injected.
    """
    # Phase 0: auto-detect framework if not provided
    if framework_profile is None:
        framework_profile = detect_framework(language)

    is_multifile = bool(structured_files)
    if is_multifile:
        file_paths = [sf["path"] for sf in (structured_files or [])]
        system = _multifile_system_prompt(language, file_paths)
    else:
        system = _system_prompt(language, test_mode)

    chain = make_chain(system, temperature=0.1, json_mode=True)

    category_block = "\n".join(f"  - {cat}" for cat in selected_categories)
    context_block = (
        f"\nAdditional context:\n{json.dumps(extra_context, indent=2)}"
        if extra_context
        else ""
    )
    story_block = (
        f"\n\nUser Story (use for descriptive test names and assertions):\n{user_story}"
        if user_story
        else ""
    )

    coverage_block = ""
    if coverage_manifest is not None:
        coverage_block = _build_coverage_prompt(coverage_manifest)

    # Mode-specific directive appended to the user message.
    # The system prompt contains all rules; this tells the LLM which section to produce.
    if test_mode == "integration":
        mode_directive = (
            "\n\nApply the MANDATORY DECISION GATE (Step 2) to each proposed integration test. "
            "Set unit_tests.code = null (unit tests are generated separately). "
            "If no real integration boundary exists in the source code, set "
            "integration_tests.available = false and state the reason clearly. "
            "Populate rejected_integration_tests for any test rejected by Rules 1-7."
        )
    else:
        mode_directive = (
            "\n\nGenerate UNIT TESTS ONLY per Step 3 rules. "
            "Set integration_tests.available = false and integration_tests.code = null. "
            "Set rejected_integration_tests = []. "
            "Fill unit_tests with a complete, runnable test file."
        )

    base_human_input = (
        f"Language: {language}\n\n"
        f"Source code:\n```{language}\n{code}\n```\n\n"
        f"Requested test categories:\n{category_block}"
        f"{mode_directive}"
        f"{context_block}"
        f"{story_block}"
        f"{coverage_block}"
    )

    human_input = base_human_input
    result: CodegenResult | None = None
    last_errors: list[str] = []

    for attempt in range(3):
        response = await chain.ainvoke({"input": human_input})

        try:
            data = json.loads(response.content)
        except json.JSONDecodeError as exc:
            if attempt == 2:
                raise ValueError(f"LLM returned non-JSON: {response.content!r}") from exc
            human_input = base_human_input + _build_error_feedback(
                [f"Response was not valid JSON: {exc}"], attempt + 1
            )
            continue

        # Try the hardened format first; fall back to the legacy {"files":[...]} format
        # (legacy format is used by multifile / GitHub-repo mode).
        hardened: HardenedCodegenResult | None = None
        if not is_multifile:
            try:
                hardened = HardenedCodegenResult.model_validate(data)
            except (ValidationError, Exception):
                pass

        if hardened is not None:
            # Extract the relevant test file from the hardened result
            extracted_files: list[TestFile] = []

            if test_mode == "integration":
                it = hardened.integration_tests
                if it and it.available and it.code:
                    fname = it.file_name or f"test_integration_{language}.py"
                    extracted_files = [TestFile(
                        filename=fname,
                        language=language,  # type: ignore[arg-type]
                        code=it.code,
                    )]
                else:
                    # No valid integration boundary — surface the reasons instead
                    # of discarding them. The caller passes `rejected_out` to receive
                    # the top-level reason plus every per-test rejection (rule 1-7).
                    reason = (it.reason_if_unavailable if it else "No integration boundary found")
                    logger.info(
                        "No valid integration tests for session %s: %s",
                        session_id, reason,
                    )
                    for rej in hardened.rejected_integration_tests:
                        logger.debug(
                            "Rejected integration test '%s' by %s: %s",
                            rej.proposed_name, rej.rejection_rule, rej.reason,
                        )
                    if rejected_out is not None:
                        if reason:
                            rejected_out.append({
                                "proposed_name": "",
                                "rejection_rule": "",
                                "reason": reason,
                                "correct_classification": "",
                            })
                        rejected_out.extend(
                            {
                                "proposed_name": rej.proposed_name,
                                "rejection_rule": rej.rejection_rule,
                                "reason": rej.reason,
                                "correct_classification": rej.correct_classification,
                            }
                            for rej in hardened.rejected_integration_tests
                        )
                    return []
            else:
                ut = hardened.unit_tests
                if ut and ut.code:
                    fname = ut.file_name or f"test_unit_{language}.py"
                    extracted_files = [TestFile(
                        filename=fname,
                        language=language,  # type: ignore[arg-type]
                        code=ut.code,
                    )]

            result = CodegenResult(files=extracted_files)
        else:
            # Legacy format parsing (multifile mode or prompt didn't follow hardened schema)
            try:
                result = CodegenResult.model_validate(data)
            except ValidationError as exc:
                if attempt == 2:
                    raise ValueError(f"LLM response failed schema validation: {exc}") from exc
                human_input = base_human_input + _build_error_feedback(
                    [f"Response failed schema validation: {exc}"], attempt + 1
                )
                continue

        if not result.files:
            # Hardened prompt said no valid tests for this mode — already returned above
            # For legacy path an empty file list is unexpected; retry once
            if attempt < 2:
                human_input = base_human_input + _build_error_feedback(
                    ["No test files were returned. Please generate tests as instructed."],
                    attempt + 1,
                )
                continue
            break

        # Validate pytest parametrize correctness (Python only)
        last_errors = []
        if language == "python":
            for f in result.files:
                if f.language == "python":
                    last_errors.extend(_validate_pytest_parametrize(f.code))

        # Phase 6: Verification Gate
        gate_errors = _verification_gate(
            result.files, framework_profile, language
        )
        last_errors.extend(gate_errors)

        if not last_errors:
            break  # valid — exit retry loop

        if attempt < 2:
            feedback = _build_error_feedback(last_errors, attempt + 1)
            if gate_errors:
                feedback += _build_verification_feedback(gate_errors, attempt + 1)
            human_input = base_human_input + feedback

    if last_errors:
        parametrize_errors = [e for e in last_errors if "parametrize" in e.lower() or "SyntaxError" in e]
        gate_only_errors = [e for e in last_errors if e not in parametrize_errors]
        if parametrize_errors:
            raise ValueError(
                "Generated tests failed parametrize validation after 3 attempts.\n"
                + "\n".join(parametrize_errors)
            )
        if gate_only_errors:
            logger.warning(
                "Verification gate warnings (non-fatal after 3 attempts): %s",
                "; ".join(gate_only_errors),
            )

    if result is None or not result.files:
        return []

    _write_output_files(session_id, result.files, code, language, structured_files, subdir=subdir)

    # AAA validation — run after writing files, enrich each TestFile in-place
    try:
        from services.test_validator import validate_aaa_structure
        for f in result.files:
            if f.language == "python":
                v = validate_aaa_structure(f.code)
                f.aaa_compliant = v["valid"]
                f.aaa_compliance_percent = v["compliance_percent"]
                f.aaa_issues = v["issues"]
    except Exception:
        logger.warning("AAA validation failed — skipping", exc_info=True)

    return result.files

