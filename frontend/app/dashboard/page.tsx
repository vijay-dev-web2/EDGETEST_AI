"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Loader2, XCircle, ChevronLeft } from "lucide-react";
import { useAnalysis } from "@/hooks/useAnalysis";
import { Sidebar } from "@/components/Sidebar";
import EligibilityBanner from "@/components/EligibilityBanner";
import { Step1CodeInput } from "@/components/steps/Step1CodeInput";
import { Step2CodeUnderstanding } from "@/components/steps/Step2CodeUnderstanding";
import { Step3RiskAnalysis } from "@/components/steps/Step3RiskAnalysis";
import { Step4GenerateUnitTests } from "@/components/steps/Step4GenerateUnitTests";
import { Step5GenerateIntegrationTests } from "@/components/steps/Step5GenerateIntegrationTests";
import { Step5TraceabilityMap } from "@/components/steps/Step5TraceabilityMap";
import { Step7ExecuteUnitTests } from "@/components/steps/Step7ExecuteUnitTests";
import { Step8ExecuteIntegrationTests } from "@/components/steps/Step8ExecuteIntegrationTests";
import { Step7Export } from "@/components/steps/Step7Export";
import type { Step } from "@/hooks/useAnalysis";
import { supabase } from "@/lib/supabase";

const STEP_META: { title: string; description: string }[] = [
  { title: "Input Ingestion",              description: "Paste code, import from GitHub, or generate from a user story." },
  { title: "Code Understanding",           description: "Completeness check and pseudocode generation." },
  { title: "Risk Analysis & Scoring",      description: "AI-powered risk assessment using 5-factor formula." },
  { title: "Generate Unit Tests",          description: "Generate isolated tests for functions, methods, and classes." },
  { title: "Generate Integration Tests",   description: "Generate workflow-based tests for module interactions." },
  { title: "Traceability Map",             description: "Map unit tests to functions and integration tests to workflows." },
  { title: "Execute Unit Tests",           description: "Run unit tests in an isolated Docker container." },
  { title: "Execute Integration Tests",    description: "Run integration tests in an isolated Docker container." },
  { title: "Report & Export",              description: "Download results in XLSX, DOCX, JSON, PDF, or CI/CD formats." },
];

function DashboardInner() {
  const [user, setUser] = useState<any>(null);
  const [accessToken, setAccessToken] = useState<string>("");
  const [authLoading, setAuthLoading] = useState(true);
  const searchParams = useSearchParams();
  const router = useRouter();
  const analysis = useAnalysis();
  const { state } = analysis;

  useEffect(() => {
    const hasBypass = typeof document !== "undefined" && document.cookie.includes("dev_bypass=true");
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token || (hasBypass ? "dev-mock-token" : ""));
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const bypass = typeof document !== "undefined" && document.cookie.includes("dev_bypass=true");
      setUser(session?.user ?? null);
      setAccessToken(session?.access_token || (bypass ? "dev-mock-token" : ""));
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (searchParams.get("demo") === "1" && accessToken && !state.isDemoMode && state.currentStep === 1) {
      router.replace("/dashboard");
      analysis.startDemo(accessToken);
    }
  }, [accessToken, searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#0F172A]">
        <Loader2 className="size-8 animate-spin text-slate-500" />
      </div>
    );
  }

  const meta = STEP_META[(state.currentStep - 1)] ?? STEP_META[0];
  const userName = user?.user_metadata?.user_name ?? user?.user_metadata?.name ?? user?.email ?? undefined;
  const userImage = user?.user_metadata?.avatar_url ?? undefined;

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden">

      {/* Left sidebar */}
      <Sidebar
        currentStep={state.currentStep}
        code={state.code}
        language={state.language}
        completeness={state.completeness}
        riskResult={state.riskResult}
        unitTestFiles={state.unitTestFiles}
        integrationTestFiles={state.integrationTestFiles}
        unitCoverage={state.unitCoverage}
        integrationCoverage={state.integrationCoverage}
        traceabilityData={state.traceabilityData}
        unitSandboxResult={state.unitSandboxResult}
        integrationSandboxResult={state.integrationSandboxResult}
        isDemoMode={state.isDemoMode}
        pipelineGates={state.pipelineGates}
        onGoToStep={(s) => analysis.goToStep(s as Step)}
        userName={userName}
        userImage={userImage}
        onSignOut={handleSignOut}
        activePage="dashboard"
      />

      {/* Main content */}
      <div className="flex flex-1 flex-col min-w-0 h-screen overflow-hidden relative">

        {/* Watermark background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none z-10 flex items-center justify-center select-none">
          <div className="absolute w-full h-full border-2 border-slate-800/30 rounded-full" />
          <div className="absolute top-[10%] left-[10%] right-[10%] bottom-[10%] border border-dashed border-slate-800/20 rounded-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/EDGETEST_AI_LOGO.png"
            alt="Watermark"
            className="w-[400px] h-[400px] object-contain opacity-[0.03]"
          />
        </div>

        {/* Step header */}
        <header className="shrink-0 border-b border-slate-800 px-6 py-4 bg-[#0F172A] flex items-center justify-between">
          <div className="flex items-center gap-3">
            {state.currentStep > 1 && !state.isDemoMode && (
              <button
                onClick={analysis.goBack}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-300 transition-colors"
              >
                <ChevronLeft className="size-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-slate-600 uppercase tracking-widest">
                  Step {state.currentStep} of 9
                </span>
              </div>
              <h1 className="text-base font-semibold text-slate-100 leading-tight">{meta.title}</h1>
              <p className="text-xs text-slate-500 mt-0.5 ml-0">{meta.description}</p>
            </div>
          </div>
        </header>

        {/* Error banner */}
        {state.error && (
          <div className="shrink-0 flex items-center gap-2 border-b border-red-500/20 bg-red-500/10 px-5 py-2.5 text-sm text-red-400">
            <XCircle className="size-4 shrink-0" />
            <span className="flex-1">{state.error}</span>
            <button onClick={analysis.clearError} className="text-red-400/60 hover:text-red-400 text-xs">Dismiss</button>
          </div>
        )}

        {/* Scrollable step content */}
        <main className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <div className="h-full max-w-4xl mx-auto px-5 sm:px-8 py-6">

            {state.currentStep === 1 && (
              <Step1CodeInput
                code={state.code}
                language={state.language}
                repoUrl={state.repoUrl}
                branch={state.branch}
                inputTab={state.inputTab}
                userStory={state.userStory}
                generatingCode={state.generatingCode}
                loading={state.loading}
                loadingMessage={state.loadingMessage}
                isDemoMode={state.isDemoMode}
                githubFetching={state.githubFetching}
                githubFilesFound={state.githubFilesFound}
                onSetCode={analysis.setCode}
                onSetLanguage={analysis.setLanguage}
                onSetRepoUrl={analysis.setRepoUrl}
                onSetBranch={analysis.setBranch}
                onSetInputTab={analysis.setInputTab}
                onSetUserStory={analysis.setUserStory}
                onGenerateCode={analysis.generateCodeFromStory}
                onLoadExample={analysis.loadExample}
                onStartDemo={() => accessToken && analysis.startDemo(accessToken)}
                onAnalyze={() => {
                  if (!accessToken) { handleSignOut(); return; }
                  analysis.startAnalysis(accessToken, state.code, state.language, state.userStory);
                }}
                onFetchAndAnalyze={() => {
                  if (!accessToken) { handleSignOut(); return; }
                  analysis.fetchAndAnalyzeRepo(accessToken, state.repoUrl, state.branch, state.userStory);
                }}
              />
            )}

            {state.currentStep === 2 && (
              <div className="flex flex-col gap-6">
                {state.eligibility && !state.pseudocodeStreaming && (
                  <EligibilityBanner
                    eligibility={state.eligibility}
                    onContinue={analysis.approveCodeUnderstanding}
                  />
                )}
                <Step2CodeUnderstanding
                  code={state.code}
                  language={state.language}
                  sessionId={state.sessionId}
                  userStory={state.userStory || undefined}
                  completeness={state.completeness}
                  pseudocode={state.pseudocode}
                  pseudocodeStreaming={state.pseudocodeStreaming}
                  loading={state.loading}
                  loadingMessage={state.loadingMessage}
                  isDemoMode={state.isDemoMode}
                  selectedSuggestion={state.selectedSuggestion}
                  moduleGraph={state.moduleGraph ?? undefined}
                  onRunCompleteness={analysis.runCompleteness}
                  onStartStream={(code, sid, story) => analysis.startPseudocodeStream(code, sid, story)}
                  onSelectSuggestion={analysis.selectSuggestion}
                  onAcceptSuggestion={analysis.acceptSuggestion}
                  onApprove={analysis.approveCodeUnderstanding}
                  onEditCode={analysis.editCode}
                  onRegenerate={(code, sid, story) => analysis.regeneratePseudocode(code, sid, story)}
                />
              </div>
            )}

            {state.currentStep === 3 && (
              <Step3RiskAnalysis
                code={state.code}
                language={state.language}
                sessionId={state.sessionId}
                userStory={state.userStory || undefined}
                riskResult={state.riskResult}
                riskLoading={state.riskLoading}
                isDemoMode={state.isDemoMode}
                onRunRisk={analysis.runRiskAnalysis}
                onProceed={analysis.proceedWithRisk}
              />
            )}

            {state.currentStep === 4 && (
              <Step4GenerateUnitTests
                code={state.code}
                language={state.language}
                sessionId={state.sessionId}
                pseudocode={state.pseudocode}
                userStory={state.userStory || undefined}
                riskLevel={state.riskResult?.risk_level}
                highRiskFunctions={state.riskResult?.high_risk_functions}
                structuredFiles={state.structuredFiles.length > 0 ? state.structuredFiles : undefined}
                unitTestFiles={state.unitTestFiles}
                unitGenerating={state.unitGenerating}
                unitCoverage={state.unitCoverage}
                isDemoMode={state.isDemoMode}
                onGenerate={analysis.generateUnitTests}
                onProceed={analysis.proceedToIntegrationTests}
              />
            )}

            {state.currentStep === 5 && (
              <Step5GenerateIntegrationTests
                code={state.code}
                language={state.language}
                sessionId={state.sessionId}
                pseudocode={state.pseudocode}
                userStory={state.userStory || undefined}
                riskLevel={state.riskResult?.risk_level}
                highRiskFunctions={state.riskResult?.high_risk_functions}
                structuredFiles={state.structuredFiles.length > 0 ? state.structuredFiles : undefined}
                integrationTestFiles={state.integrationTestFiles}
                integrationGenerating={state.integrationGenerating}
                integrationCoverage={state.integrationCoverage}
                isDemoMode={state.isDemoMode}
                gates={state.pipelineGates}
                eligibility={state.eligibility}
                onGenerate={analysis.generateIntegrationTests}
                onProceed={analysis.proceedToTraceability}
              />
            )}

            {state.currentStep === 6 && (
              <Step5TraceabilityMap
                code={state.code}
                language={state.language}
                sessionId={state.sessionId}
                userStory={state.userStory || undefined}
                categories={state.categories}
                selectedCategoryNames={state.selectedCategoryNames}
                traceabilityData={state.traceabilityData}
                unitTraceabilityData={state.unitTraceabilityData}
                integrationTraceabilityData={state.integrationTraceabilityData}
                traceabilityLoading={state.traceabilityLoading}
                riskHighFunctions={state.riskResult?.high_risk_functions}
                isDemoMode={state.isDemoMode}
                onRunTraceability={analysis.runTraceability}
                onProceed={analysis.proceedToExecuteUnit}
              />
            )}

            {state.currentStep === 7 && (
              <Step7ExecuteUnitTests
                sessionId={state.sessionId}
                language={state.language}
                unitTestFiles={state.unitTestFiles}
                unitSandboxResult={state.unitSandboxResult}
                unitSandboxRunning={state.unitSandboxRunning}
                isDemoMode={state.isDemoMode}
                onRunUnitSandbox={analysis.runUnitSandbox}
                onUpdateFile={analysis.updateUnitFile}
                onProceed={analysis.proceedToExecuteIntegration}
              />
            )}

            {state.currentStep === 8 && (
              <Step8ExecuteIntegrationTests
                sessionId={state.sessionId}
                language={state.language}
                integrationTestFiles={state.integrationTestFiles}
                integrationSandboxResult={state.integrationSandboxResult}
                integrationSandboxRunning={state.integrationSandboxRunning}
                isDemoMode={state.isDemoMode}
                gates={state.pipelineGates}
                eligibility={state.eligibility}
                onRunIntegrationSandbox={analysis.runIntegrationSandbox}
                onUpdateFile={analysis.updateIntegrationFile}
                onProceed={analysis.proceedToReport}
              />
            )}

            {state.currentStep === 9 && (
              <Step7Export
                sessionId={state.sessionId}
                language={state.language}
                unitTestFiles={state.unitTestFiles}
                integrationTestFiles={state.integrationTestFiles}
                unitSandboxResult={state.unitSandboxResult}
                integrationSandboxResult={state.integrationSandboxResult}
                riskResult={state.riskResult}
                onReset={analysis.resetAll}
              />
            )}

          </div>
        </main>
      </div>

    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex h-screen items-center justify-center bg-[#0F172A]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    }>
      <DashboardInner />
    </Suspense>
  );
}
