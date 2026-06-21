import { supabase } from "./supabase"

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession()
  if (session?.access_token) {
    return { "Authorization": `Bearer ${session.access_token}` }
  }
  return {}
}

async function backendFetch(path: string, init: RequestInit): Promise<Response> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders, ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail ?? `Request to ${path} failed`);
  }
  return res;
}

export async function exchangeGithubToken(_accessToken: string): Promise<void> {
  // With Supabase auth, the Bearer token in all requests handles authentication.
  // This call warms up the backend user record on first login.
  await backendFetch("/api/auth/me", { method: "GET" });
}

export interface CompletenessResult {
  is_complete: boolean;
  completeness_score: number;
  missing_elements: string[];
  suggestions: string[] | null;
}

export async function analyzeCompleteness(
  code: string,
  language: string,
  userStory?: string,
): Promise<CompletenessResult> {
  console.log("[analyzeCompleteness] calling", `${BACKEND}/api/analyze/completeness`, { language, codeLen: code.length });
  const res = await backendFetch("/api/analyze/completeness", {
    method: "POST",
    body: JSON.stringify({ code, language, user_story: userStory ?? null }),
  });
  const data = await res.json();
  console.log("[analyzeCompleteness] response", data);
  return data;
}

export async function createSession(
  code: string,
  language: string,
  userStory?: string,
  moduleGraph?: GithubFetchResult["module_graph"],
): Promise<string> {
  const res = await backendFetch("/api/analyze/sessions", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      user_story: userStory ?? null,
      module_graph: moduleGraph ?? null,
    }),
  });
  const data = await res.json();
  return data.session_id as string;
}

export interface TestCategory {
  name: string;
  type: "unit" | "integration" | "edge" | "negative" | "business_rule" | "smoke" | "security" | "mutation";
  description: string;
  estimated_count: number;
  relevant_functions: string[];
}

// ---------------------------------------------------------------------------
// GitHub Repo Fetch
// ---------------------------------------------------------------------------

export interface GithubFetchResult {
  success: boolean;
  repo_url: string;
  repo_path: string;
  branch: string;
  combined_code: string;
  language: "python" | "typescript" | "javascript" | "java" | "csharp" | "cpp";
  files_found: string[];
  file_count: number;
  total_size_bytes: number;
  structured_files: { path: string; content: string }[];
  module_graph: {
    modules: Record<string, { imports: string[]; classes: string[]; depends_on: Record<string, string[]> }>;
    integration_boundaries: { from: string; to: string; type: string }[];
    entrypoints: string[];
  } | null;
  skipped_files: { path: string; reason: string }[];
}

export async function fetchGithubRepo(
  repoUrl: string,
  branch: string,
): Promise<GithubFetchResult> {
  const res = await backendFetch("/api/ingest/github", {
    method: "POST",
    body: JSON.stringify({ repo_url: repoUrl, branch }),
  });
  return res.json();
}

export async function storyToCode(userStory: string, language: string): Promise<{ code: string }> {
  const res = await backendFetch("/api/analyze/story-to-code", {
    method: "POST",
    body: JSON.stringify({ user_story: userStory, language }),
  });
  return res.json();
}

export async function streamPseudocode(
  code: string,
  sessionId: string,
  onToken: (token: string) => void,
  userStory?: string,
): Promise<string> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${BACKEND}/api/analyze/pseudocode`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ code, ast_json: {}, session_id: sessionId, user_story: userStory ?? null }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail ?? "Pseudocode generation failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const token = line.slice(6);
      if (token === "[DONE]") return fullText;
      if (token.startsWith("[ERROR]")) throw new Error(token.slice(8).trim());
      fullText += token;
      onToken(token);
    }
  }
  return fullText;
}

export async function streamCodeCompletion(
  code: string,
  language: string,
  instruction: string,
  onToken: (token: string) => void,
): Promise<string> {
  const authHeaders = await getAuthHeader();
  const res = await fetch(`${BACKEND}/api/analyze/complete-code`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ code, language, instruction }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail ?? "Code completion failed");
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const token = line.slice(6);
      if (token === "[DONE]") return fullText;
      if (token.startsWith("[ERROR]")) throw new Error(token.slice(8).trim());
      // Unescape newlines encoded by the backend
      const decoded = token.replace(/\\n/g, "\n");
      fullText += decoded;
      onToken(decoded);
    }
  }
  return fullText;
}

export async function discoverScenarios(
  code: string,
  pseudocode: string,
  userStory?: string,
  riskLevel?: string,
  highRiskFunctions?: string[],
  moduleGraph?: GithubFetchResult["module_graph"],
): Promise<{ categories: TestCategory[], total_scenario_count: number }> {
  const res = await backendFetch("/api/analyze/discover", {
    method: "POST",
    body: JSON.stringify({
      code,
      pseudocode,
      ast_json: {},
      user_story: userStory ?? null,
      risk_level: riskLevel ?? null,
      high_risk_functions: highRiskFunctions ?? null,
      module_graph: moduleGraph ?? null,
    }),
  });
  return res.json();
}

export interface TestFile {
  filename: string;
  language: "python" | "typescript" | "javascript" | "java" | "csharp" | "cpp";
  code: string;
  aaa_compliant?: boolean;
  aaa_compliance_percent?: number;
  aaa_issues?: string[];
  misclassified?: boolean;
  classification_warning?: string;
}

export interface TestScenario {
  name: string;
  type?: string;
  priority?: string;
  description?: string;
  edge_case?: boolean;
}

export async function generateTests(
  code: string,
  language: string,
  selectedCategories: string[],
  sessionId: string,
  userStory?: string,
  structuredFiles?: { path: string; content: string }[],
): Promise<TestFile[]> {
  const res = await backendFetch("/api/analyze/generate", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      selected_categories: selectedCategories,
      session_id: sessionId,
      user_story: userStory ?? null,
      structured_files: structuredFiles ?? null,
    }),
  });
  return res.json();
}

export async function generateUnitTests(
  code: string,
  language: string,
  selectedCategories: string[],
  sessionId: string,
  userStory?: string,
  structuredFiles?: { path: string; content: string }[],
): Promise<TestFile[]> {
  const res = await backendFetch("/api/analyze/generate-unit", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      selected_categories: selectedCategories,
      session_id: sessionId,
      user_story: userStory ?? null,
      structured_files: structuredFiles ?? null,
    }),
  });
  return res.json();
}

export interface RejectedIntegrationTest {
  proposed_name: string;
  rejection_rule: string;
  reason: string;
  correct_classification: string;
}

export interface GenerateIntegrationResult {
  files: TestFile[];
  rejected: RejectedIntegrationTest[];
}

export async function generateIntegrationTests(
  code: string,
  language: string,
  selectedCategories: string[],
  sessionId: string,
  userStory?: string,
  structuredFiles?: { path: string; content: string }[],
): Promise<GenerateIntegrationResult> {
  const res = await backendFetch("/api/analyze/generate-integration", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      selected_categories: selectedCategories,
      session_id: sessionId,
      user_story: userStory ?? null,
      structured_files: structuredFiles ?? null,
    }),
  });
  return res.json();
}

export async function runUnitSandboxTests(
  sessionId: string,
  language: string,
): Promise<SandboxResult> {
  const res = await backendFetch("/api/sandbox/run-unit", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, language }),
  });
  return res.json();
}

export async function runIntegrationSandboxTests(
  sessionId: string,
  language: string,
): Promise<SandboxResult> {
  const res = await backendFetch("/api/sandbox/run-integration", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, language }),
  });
  return res.json();
}

export interface SandboxFailure {
  test_name: string;
  error_message: string;
  traceback: string;
}

export interface SandboxResult {
  total: number;
  passed: number;
  failed: number;
  failures: SandboxFailure[];
}

export async function runSandboxTests(
  sessionId: string,
  language: string,
): Promise<SandboxResult> {
  const res = await backendFetch("/api/sandbox/run", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, language }),
  });
  return res.json();
}

export async function exportWorkflowYaml(
  sessionId: string,
  language: string,
  testFilePaths: string[],
): Promise<Blob> {
  const depFile = language === "python" ? "requirements.txt" : "package.json";
  const res = await backendFetch("/api/export/workflow", {
    method: "POST",
    body: JSON.stringify({
      session_id: sessionId,
      language,
      test_file_paths: testFilePaths,
      dependency_file: depFile,
    }),
  });
  return res.blob();
}

export async function pushToGitHub(
  sessionId: string,
  repoFullName: string,
): Promise<{ status: string; path: string }> {
  const res = await backendFetch("/api/export/push-to-github", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId, repo_full_name: repoFullName }),
  });
  return res.json();
}

export interface PlatformMetrics {
  total_sessions: number;
  sessions_today: number;
  total_test_runs: number;
  language_breakdown: Record<string, number>;
  avg_completeness_score: number;
  avg_tests_generated: number;
  pass_rate: number;
  top_scenarios: { name: string; count: number }[];
}

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const res = await backendFetch("/api/metrics", { method: "GET" });
  return res.json();
}

export async function downloadReportPdf(sessionId: string): Promise<Blob> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${BACKEND}/api/report/${sessionId}/pdf`, {
    credentials: "include",
    headers: { ...authHeaders },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail ?? "PDF export failed");
  }
  return res.blob();
}

// ---------------------------------------------------------------------------
// Risk Analysis
// ---------------------------------------------------------------------------

export interface RiskResult {
  risk_score: number;
  risk_level: "high" | "medium" | "low";
  complexity_score: number;
  business_impact_score: number;
  dependency_depth_score: number;
  coverage_gap_score: number;
  security_sensitivity_score: number;
  risk_factors: string[];
  recommended_test_types: string[];
  human_readable_reason: string;
  high_risk_functions: string[];
}

export async function analyzeRisk(
  code: string,
  language: string,
  sessionId?: string,
  userStory?: string,
): Promise<RiskResult> {
  const res = await backendFetch("/api/analyze/risk", {
    method: "POST",
    body: JSON.stringify({ code, language, session_id: sessionId ?? null, user_story: userStory ?? null }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Traceability
// ---------------------------------------------------------------------------

export interface TraceabilityMatrixRow {
  category_name: string;
  covers_functions: string[];
  covers_requirements: string[];
  risk_level: "high" | "medium" | "low";
}

export interface TraceabilityData {
  matrix: TraceabilityMatrixRow[];
  function_coverage_pct: number;
  requirement_coverage_pct: number;
  high_risk_covered: number;
  high_risk_total: number;
}

export async function computeTraceability(
  code: string,
  language: string,
  categories: TestCategory[],
  sessionId?: string,
  userStory?: string,
  highRiskFunctions?: string[],
): Promise<TraceabilityData> {
  const res = await backendFetch("/api/analyze/traceability", {
    method: "POST",
    body: JSON.stringify({
      code,
      language,
      categories: categories.map((c) => ({ name: c.name, type: c.type, description: c.description })),
      session_id: sessionId ?? null,
      user_story: userStory ?? null,
      high_risk_functions: highRiskFunctions ?? null,
    }),
  });
  return res.json();
}

// ---------------------------------------------------------------------------
// Export helpers (XLSX, JSON, DOCX)
// ---------------------------------------------------------------------------

const _BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

export async function exportXlsx(sessionId: string): Promise<Blob> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${_BACKEND}/api/export/${sessionId}/xlsx`, {
    credentials: "include",
    headers: { ...authHeaders },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function exportJson(sessionId: string): Promise<Blob> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${_BACKEND}/api/export/${sessionId}/json`, {
    credentials: "include",
    headers: { ...authHeaders },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function exportDocx(sessionId: string): Promise<Blob> {
  const authHeaders = await getAuthHeader()
  const res = await fetch(`${_BACKEND}/api/export/${sessionId}/docx`, {
    credentials: "include",
    headers: { ...authHeaders },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}


// ---------------------------------------------------------------------------
// Eligibility Analysis
// ---------------------------------------------------------------------------

export interface UnitTestTarget {
  name: string;
  type: string;
  test_categories: string[];
}

export interface IntegrationBoundary {
  boundary_type: string;
  description: string;
  components_involved: string[];
  test_scenario: string;
}

export interface ComponentInfo {
  name: string;
  type: string;
  dependencies: string[];
  complexity: string;
}

export interface SkippedStep {
  step: string;
  reason: string;
}

export interface RecommendedTestPlan {
  unit_tests_to_generate: number;
  integration_tests_to_generate: number;
  estimated_coverage: string;
  priority_order: string[];
  skipped_steps: SkippedStep[];
}

export interface EligibilityReport {
  unit_test_eligible: boolean;
  unit_test_reason: string;
  unit_test_targets: UnitTestTarget[];
  integration_test_eligible: boolean;
  integration_test_reason: string;
  integration_boundaries: IntegrationBoundary[];
  architecture_summary: string;
  components: ComponentInfo[];
  recommended_test_plan: RecommendedTestPlan;
  user_message: string;
}

export interface EligibilityResponse {
  eligibility: EligibilityReport;
  pipeline_gates: Record<string, boolean>;
}

export async function fetchEligibility(sessionId: string): Promise<EligibilityResponse> {
  const res = await backendFetch("/api/analyze/eligibility", {
    method: "POST",
    body: JSON.stringify({ session_id: sessionId }),
  });
  return res.json();
}

