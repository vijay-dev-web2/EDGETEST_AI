"use client";

import { useState } from "react";
import type {
  CompletenessResult,
  GithubFetchResult,
  TestCategory,
  TestFile,
  SandboxResult,
  RiskResult,
  TraceabilityData,
  EligibilityReport,
} from "@/lib/backendApi";
import {
  exchangeGithubToken,
  analyzeCompleteness,
  analyzeRisk,
  computeTraceability,
  createSession,
  streamPseudocode,
  discoverScenarios,
  generateUnitTests as apiGenerateUnitTests,
  generateIntegrationTests as apiGenerateIntegrationTests,
  runUnitSandboxTests,
  runIntegrationSandboxTests,
  storyToCode,
  fetchGithubRepo,
  fetchEligibility,
} from "@/lib/backendApi";
import { DEMO_EXAMPLE } from "@/lib/examples";

export type Language = "python" | "typescript" | "javascript" | "java" | "csharp" | "cpp";
export type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type InputTab = "paste" | "github" | "story";

export interface AnalysisState {
  currentStep: Step;
  isDemoMode: boolean;
  // Step 1
  code: string;
  language: Language;
  userStory: string;
  generatingCode: boolean;
  repoUrl: string;
  branch: string;
  inputTab: InputTab;
  githubFetching: boolean;
  githubFilesFound: string[];
  moduleGraph: GithubFetchResult["module_graph"] | null;
  structuredFiles: { path: string; content: string }[];
  // Step 2 — Code Understanding
  sessionId: string | null;
  completeness: CompletenessResult | null;
  selectedSuggestion: number | null;
  pseudocode: string;
  pseudocodeStreaming: boolean;
  pseudocodeApproved: boolean;
  pseudocodeEditing: boolean;
  // Step 3 — Risk Analysis
  riskResult: RiskResult | null;
  riskLoading: boolean;
  // Internal: scenario categories (used to split unit/integration)
  categories: TestCategory[];
  selectedCategoryNames: string[];
  categoriesLoading: boolean;
  // Step 4 — Generate Unit Tests
  unitTestFiles: TestFile[];
  unitGenerating: boolean;
  unitCoverage: number;
  // Step 5 — Generate Integration Tests
  integrationTestFiles: TestFile[];
  integrationGenerating: boolean;
  integrationCoverage: number;
  // Step 6 — Traceability Map
  traceabilityData: TraceabilityData | null;
  traceabilityLoading: boolean;
  unitTraceabilityData: TraceabilityData | null;
  integrationTraceabilityData: TraceabilityData | null;
  // Step 7 — Execute Unit Tests
  unitSandboxResult: SandboxResult | null;
  unitSandboxRunning: boolean;
  // Step 8 — Execute Integration Tests
  integrationSandboxResult: SandboxResult | null;
  integrationSandboxRunning: boolean;
  // Global
  eligibility: EligibilityReport | null;
  pipelineGates: Record<string, boolean> | null;
  loading: boolean;
  loadingMessage: string;
  error: string | null;
}

const DEFAULT_STATE: AnalysisState = {
  currentStep: 1,
  isDemoMode: false,
  code: "",
  language: "python",
  userStory: "",
  generatingCode: false,
  repoUrl: "",
  branch: "main",
  inputTab: "paste",
  githubFetching: false,
  githubFilesFound: [],
  moduleGraph: null,
  structuredFiles: [],
  sessionId: null,
  completeness: null,
  selectedSuggestion: null,
  pseudocode: "",
  pseudocodeStreaming: false,
  pseudocodeApproved: false,
  pseudocodeEditing: false,
  riskResult: null,
  riskLoading: false,
  categories: [],
  selectedCategoryNames: [],
  categoriesLoading: false,
  unitTestFiles: [],
  unitGenerating: false,
  unitCoverage: 0,
  integrationTestFiles: [],
  integrationGenerating: false,
  integrationCoverage: 0,
  traceabilityData: null,
  traceabilityLoading: false,
  unitTraceabilityData: null,
  integrationTraceabilityData: null,
  unitSandboxResult: null,
  unitSandboxRunning: false,
  integrationSandboxResult: null,
  integrationSandboxRunning: false,
  loading: false,
  loadingMessage: "",
  error: null,
  eligibility: null,
  pipelineGates: null,
};

export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(DEFAULT_STATE);

  function patch(partial: Partial<AnalysisState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  function clearError() { patch({ error: null }); }

  // ── Step 1 ────────────────────────────────────────────────────────────────

  function setCode(code: string) { patch({ code }); }
  function setLanguage(language: Language) { patch({ language }); }
  function setUserStory(userStory: string) { patch({ userStory: userStory.slice(0, 1000) }); }
  function setInputTab(inputTab: InputTab) { patch({ inputTab }); }
  function setRepoUrl(repoUrl: string) { patch({ repoUrl }); }
  function setBranch(branch: string) { patch({ branch }); }

  function loadExample(exampleId: string) {
    const { CODE_EXAMPLES } = require("@/lib/examples");
    const ex = CODE_EXAMPLES.find((e: { id: string }) => e.id === exampleId);
    if (ex) patch({ code: ex.code, language: ex.language, userStory: ex.userStory ?? "", inputTab: "paste" });
  }

  async function generateCodeFromStory(userStory: string, language: Language) {
    if (!userStory.trim()) return;
    patch({ generatingCode: true, error: null });
    try {
      const { code } = await storyToCode(userStory, language);
      patch({ code, generatingCode: false, inputTab: "paste" });
    } catch (e) {
      patch({ generatingCode: false, error: e instanceof Error ? e.message : "Code generation failed" });
    }
  }

  async function fetchAndAnalyzeRepo(
    accessToken: string,
    repoUrl: string,
    branch: string,
    userStory: string,
  ) {
    if (!repoUrl.trim()) {
      patch({ error: "Please enter a GitHub repository URL" });
      return;
    }
    patch({ githubFetching: true, error: null, githubFilesFound: [] });
    let result;
    try {
      result = await fetchGithubRepo(repoUrl, branch || "main");
    } catch (e) {
      patch({
        githubFetching: false,
        error: e instanceof Error ? e.message : "Failed to fetch repository",
      });
      return;
    }
    patch({
      githubFetching: false,
      code: result.combined_code,
      language: result.language,
      githubFilesFound: result.files_found,
      moduleGraph: result.module_graph ?? null,
      structuredFiles: result.structured_files ?? [],
    });
    await startAnalysis(accessToken, result.combined_code, result.language, userStory);
  }

  async function startAnalysis(accessToken: string, code: string, language: Language, userStory: string) {
    patch({
      loading: true,
      loadingMessage: "Authenticating…",
      error: null,
      currentStep: 2,
      completeness: null,
      pseudocode: "",
      pseudocodeApproved: false,
      riskResult: null,
    });
    try {
      await exchangeGithubToken(accessToken);
      patch({ loadingMessage: "Creating session…" });
      const sessionId = await createSession(code, language, userStory || undefined);
      patch({ sessionId, loadingMessage: "Analyzing code…", loading: false });
    } catch (e) {
      patch({ loading: false, loadingMessage: "", error: e instanceof Error ? e.message : "Analysis failed", currentStep: 1 });
    }
  }

  async function startDemo(accessToken: string) {
    patch({
      code: DEMO_EXAMPLE.code,
      language: DEMO_EXAMPLE.language as Language,
      userStory: DEMO_EXAMPLE.userStory ?? "",
      inputTab: "paste",
      isDemoMode: true,
      error: null,
    });
    await new Promise((r) => setTimeout(r, 400));
    await startAnalysis(accessToken, DEMO_EXAMPLE.code, DEMO_EXAMPLE.language as Language, DEMO_EXAMPLE.userStory ?? "");
  }

  // ── Step 2 — Code Understanding ────────────────────────────────────────────

  async function runCompleteness(code: string, language: Language, userStory?: string) {
    patch({ loading: true, loadingMessage: "Checking completeness…" });
    try {
      const completeness = await analyzeCompleteness(code, language, userStory || undefined);
      patch({ completeness, loading: false, loadingMessage: "" });
    } catch (e) {
      patch({ loading: false, loadingMessage: "", error: e instanceof Error ? e.message : "Completeness check failed" });
    }
  }

  async function runEligibilityScan(sessionId: string) {
    try {
      const result = await fetchEligibility(sessionId);
      patch({
        eligibility: result.eligibility,
        pipelineGates: result.pipeline_gates,
      });
    } catch (e) {
      console.error("Eligibility analysis failed:", e);
      patch({
        pipelineGates: {
          ingest: true,
          analyze: true,
          risk_score: true,
          generate_unit_tests: true,
          generate_integration_tests: false,
          traceability: true,
          execute_unit_tests: true,
          execute_integration_tests: false,
          report: true,
        }
      });
    }
  }

  async function startPseudocodeStream(code: string, sessionId: string, userStory?: string) {
    patch({ pseudocode: "", pseudocodeStreaming: true, error: null });
    try {
      await streamPseudocode(code, sessionId, (token) => {
        setState((prev) => ({ ...prev, pseudocode: prev.pseudocode + token }));
      }, userStory);
      patch({ pseudocodeStreaming: false });
      await runEligibilityScan(sessionId);
    } catch (e) {
      patch({ pseudocodeStreaming: false, error: e instanceof Error ? e.message : "Pseudocode generation failed" });
    }
  }

  function selectSuggestion(idx: number) { patch({ selectedSuggestion: idx }); }

  function acceptSuggestion(suggestion: string) {
    patch({ code: state.code + "\n\n" + suggestion, selectedSuggestion: null });
  }

  function setPseudocodeEditing(pseudocodeEditing: boolean) { patch({ pseudocodeEditing }); }
  function updatePseudocode(pseudocode: string) { patch({ pseudocode }); }

  async function regeneratePseudocode(code: string, sessionId: string, userStory?: string) {
    await startPseudocodeStream(code, sessionId, userStory);
  }

  function approveCodeUnderstanding() {
    patch({
      currentStep: 3,
      pseudocodeApproved: true,
      pseudocodeEditing: false,
      riskResult: null,
      riskLoading: false,
    });
  }

  // ── Step 3 — Risk Analysis ─────────────────────────────────────────────────

  async function runRiskAnalysis(code: string, language: Language, sessionId: string | null, userStory?: string) {
    patch({ riskLoading: true, error: null });
    try {
      const result = await analyzeRisk(code, language, sessionId ?? undefined, userStory || undefined);
      patch({ riskResult: result, riskLoading: false });
    } catch (e) {
      patch({ riskLoading: false, error: e instanceof Error ? e.message : "Risk analysis failed" });
    }
  }

  function proceedWithRisk() {
    patch({
      currentStep: 4,
      categories: [],
      selectedCategoryNames: [],
      categoriesLoading: false,
      unitTestFiles: [],
      unitGenerating: false,
    });
  }

  // ── Internal: Scenario Discovery (runs automatically in Step 4) ─────────────

  async function _discoverScenarios(
    code: string,
    pseudocode: string,
    userStory?: string,
    riskLevel?: string,
    highRiskFunctions?: string[],
    moduleGraph?: GithubFetchResult["module_graph"],
  ) {
    patch({ categoriesLoading: true });
    try {
      const { categories: allCategories } = await discoverScenarios(
        code, pseudocode, userStory || undefined, riskLevel, highRiskFunctions, moduleGraph ?? undefined,
      );
      patch({
        categories: allCategories,
        selectedCategoryNames: allCategories.map((c) => c.name),
        categoriesLoading: false,
      });
      return allCategories;
    } catch {
      patch({ categoriesLoading: false });
      return [];
    }
  }

  // ── Step 4 — Generate Unit Tests ───────────────────────────────────────────

  async function generateUnitTests(
    code: string,
    language: Language,
    sessionId: string,
    pseudocode: string,
    userStory?: string,
    riskLevel?: string,
    highRiskFunctions?: string[],
    structuredFiles?: { path: string; content: string }[],
  ) {
    patch({ unitGenerating: true, error: null });

    let categories = state.categories;
    if (categories.length === 0) {
      categories = await _discoverScenarios(
        code, pseudocode, userStory, riskLevel, highRiskFunctions, state.moduleGraph ?? undefined,
      );
    }

    const unitCategoryNames = categories
      .filter((c) => c.type !== "integration")
      .map((c) => c.name);

    try {
      const files = await apiGenerateUnitTests(
        code, language,
        unitCategoryNames.length > 0 ? unitCategoryNames : ["unit"],
        sessionId, userStory || undefined,
        structuredFiles && structuredFiles.length > 0 ? structuredFiles : undefined,
      );
      const coverage = Math.min(100, files.length * 15);
      patch({ unitTestFiles: files, unitGenerating: false, unitCoverage: coverage });
    } catch (e) {
      patch({ unitGenerating: false, error: e instanceof Error ? e.message : "Unit test generation failed" });
    }
  }

  function proceedToIntegrationTests() {
    patch({
      currentStep: 5,
      integrationTestFiles: [],
      integrationGenerating: false,
    });
  }

  // ── Step 5 — Generate Integration Tests ────────────────────────────────────

  async function generateIntegrationTests(
    code: string,
    language: Language,
    sessionId: string,
    pseudocode: string,
    userStory?: string,
    riskLevel?: string,
    highRiskFunctions?: string[],
    structuredFiles?: { path: string; content: string }[],
  ) {
    patch({ integrationGenerating: true, error: null });

    let categories = state.categories;
    if (categories.length === 0) {
      categories = await _discoverScenarios(
        code, pseudocode, userStory, riskLevel, highRiskFunctions, state.moduleGraph ?? undefined,
      );
    }

    const integrationCategoryNames = categories
      .filter((c) => c.type === "integration")
      .map((c) => c.name);

    try {
      const files = await apiGenerateIntegrationTests(
        code, language,
        integrationCategoryNames.length > 0 ? integrationCategoryNames : ["integration"],
        sessionId, userStory || undefined,
        structuredFiles && structuredFiles.length > 0 ? structuredFiles : undefined,
      );
      const coverage = Math.min(100, files.length * 12);
      patch({ integrationTestFiles: files, integrationGenerating: false, integrationCoverage: coverage });
    } catch (e) {
      patch({ integrationGenerating: false, error: e instanceof Error ? e.message : "Integration test generation failed" });
    }
  }

  function proceedToTraceability() {
    patch({
      currentStep: 6,
      traceabilityData: null,
      unitTraceabilityData: null,
      integrationTraceabilityData: null,
      traceabilityLoading: false,
    });
  }

  // ── Step 6 — Traceability Map ─────────────────────────────────────────────

  async function runTraceability(
    code: string,
    language: Language,
    categories: TestCategory[],
    sessionId: string | null,
    userStory?: string,
    highRiskFunctions?: string[],
  ) {
    patch({ traceabilityLoading: true, error: null });
    try {
      const unitCategories = categories.filter((c) => c.type !== "integration");
      const integCategories = categories.filter((c) => c.type === "integration");

      const [unitData, integData] = await Promise.all([
        unitCategories.length > 0
          ? computeTraceability(code, language, unitCategories, sessionId ?? undefined, userStory || undefined, highRiskFunctions)
          : Promise.resolve(null),
        integCategories.length > 0
          ? computeTraceability(code, language, integCategories, sessionId ?? undefined, userStory || undefined, highRiskFunctions)
          : Promise.resolve(null),
      ]);

      const combinedData = unitData ?? integData ?? { matrix: [], function_coverage_pct: 0, requirement_coverage_pct: 0, high_risk_covered: 0, high_risk_total: 0 };

      patch({
        traceabilityData: combinedData,
        unitTraceabilityData: unitData,
        integrationTraceabilityData: integData,
        traceabilityLoading: false,
      });
    } catch (e) {
      patch({ traceabilityLoading: false, error: e instanceof Error ? e.message : "Traceability analysis failed" });
    }
  }

  function proceedToExecuteUnit() {
    patch({ currentStep: 7, unitSandboxResult: null, unitSandboxRunning: false });
  }

  // ── Step 7 — Execute Unit Tests ────────────────────────────────────────────

  function updateUnitFile(filename: string, code: string) {
    setState((prev) => ({
      ...prev,
      unitTestFiles: prev.unitTestFiles.map((f) => f.filename === filename ? { ...f, code } : f),
    }));
  }

  async function runUnitSandbox(sessionId: string, language: Language) {
    patch({ unitSandboxRunning: true, unitSandboxResult: null, error: null });
    try {
      const result = await runUnitSandboxTests(sessionId, language);
      patch({ unitSandboxResult: result, unitSandboxRunning: false });
    } catch (e) {
      patch({ unitSandboxRunning: false, error: e instanceof Error ? e.message : "Unit sandbox run failed" });
    }
  }

  function proceedToExecuteIntegration() {
    patch({ currentStep: 8, integrationSandboxResult: null, integrationSandboxRunning: false });
  }

  // ── Step 8 — Execute Integration Tests ────────────────────────────────────

  function updateIntegrationFile(filename: string, code: string) {
    setState((prev) => ({
      ...prev,
      integrationTestFiles: prev.integrationTestFiles.map((f) => f.filename === filename ? { ...f, code } : f),
    }));
  }

  async function runIntegrationSandbox(sessionId: string, language: Language) {
    patch({ integrationSandboxRunning: true, integrationSandboxResult: null, error: null });
    try {
      const result = await runIntegrationSandboxTests(sessionId, language);
      patch({ integrationSandboxResult: result, integrationSandboxRunning: false });
    } catch (e) {
      patch({ integrationSandboxRunning: false, error: e instanceof Error ? e.message : "Integration sandbox run failed" });
    }
  }

  function proceedToReport() {
    patch({ currentStep: 9 });
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goToStep(step: Step) {
    if (step < state.currentStep) patch({ currentStep: step, error: null });
  }

  function goBack() {
    if (state.currentStep > 1) patch({ currentStep: (state.currentStep - 1) as Step, error: null });
  }

  function resetAll() {
    setState(DEFAULT_STATE);
  }

  // Legacy helpers for backward compatibility
  function continueAnyway() { approveCodeUnderstanding(); }
  function editCode() { patch({ currentStep: 1 }); }
  function approvePseudocode() { approveCodeUnderstanding(); }

  return {
    state,
    clearError,
    setCode,
    setLanguage,
    setUserStory,
    setInputTab,
    setRepoUrl,
    setBranch,
    loadExample,
    generateCodeFromStory,
    fetchAndAnalyzeRepo,
    startAnalysis,
    startDemo,
    runCompleteness,
    startPseudocodeStream,
    runEligibilityScan,
    selectSuggestion,
    acceptSuggestion,
    setPseudocodeEditing,
    updatePseudocode,
    regeneratePseudocode,
    approveCodeUnderstanding,
    continueAnyway,
    editCode,
    approvePseudocode,
    runRiskAnalysis,
    proceedWithRisk,
    generateUnitTests,
    proceedToIntegrationTests,
    generateIntegrationTests,
    proceedToTraceability,
    runTraceability,
    proceedToExecuteUnit,
    updateUnitFile,
    runUnitSandbox,
    proceedToExecuteIntegration,
    updateIntegrationFile,
    runIntegrationSandbox,
    proceedToReport,
    goToStep,
    goBack,
    resetAll,
  };
}
