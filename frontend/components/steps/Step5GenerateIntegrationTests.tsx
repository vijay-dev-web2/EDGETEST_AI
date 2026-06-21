"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, Beaker, CheckCircle2, Code2, Network, AlertTriangle, Ban } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile, RejectedIntegrationTest } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Props {
  code: string;
  language: Language;
  sessionId: string | null;
  pseudocode: string;
  userStory?: string;
  riskLevel?: string;
  highRiskFunctions?: string[];
  structuredFiles?: { path: string; content: string }[];
  integrationTestFiles: TestFile[];
  integrationGenerating: boolean;
  integrationCoverage: number;
  integrationRejections?: RejectedIntegrationTest[];
  isDemoMode?: boolean;
  gates?: Record<string, boolean> | null;
  eligibility?: any;
  onGenerate: (
    code: string,
    language: Language,
    sessionId: string,
    pseudocode: string,
    userStory?: string,
    riskLevel?: string,
    highRiskFunctions?: string[],
    structuredFiles?: { path: string; content: string }[],
  ) => void;
  onProceed: () => void;
}

export function Step5GenerateIntegrationTests({
  code, language, sessionId, pseudocode,
  userStory, riskLevel, highRiskFunctions, structuredFiles,
  integrationTestFiles, integrationGenerating, integrationCoverage,
  integrationRejections,
  isDemoMode,
  gates, eligibility,
  onGenerate, onProceed,
}: Props) {
  const started = useRef(false);
  const [activeFile, setActiveFile] = useState(0);

  // Skipped state — show informative screen
  if (gates && gates.generate_integration_tests === false) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in-up">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Ban className="size-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-100">Generate Integration Tests</h2>
          </div>
          <p className="text-sm text-slate-500">
            Workflow-based test scenarios validating module interactions.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center space-y-4 max-w-2xl mx-auto w-full">
          <div className="flex size-14 items-center justify-center rounded-full bg-slate-800 text-slate-400 mx-auto">
            <Ban className="size-6" />
          </div>

          <h3 className="text-base font-semibold text-slate-200">
            Integration Tests Not Applicable
          </h3>

          <p className="text-xs text-slate-400 leading-relaxed max-w-lg mx-auto">
            {eligibility?.integration_test_reason ||
              "No integration boundaries were detected in the source code."}
          </p>

          {/* What would enable integration tests */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left max-w-md mx-auto space-y-3">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
              What would enable integration tests
            </p>
            {[
              "A database layer (SQLite, PostgreSQL, MongoDB)",
              "An HTTP client calling an external API",
              "Two distinct service classes interacting",
              "A repository pattern with real data access",
              "File system read/write operations",
              "A message queue (Redis, RabbitMQ, SQS)",
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-center gap-2 text-xs text-slate-400 border-b border-slate-800/40 pb-2 last:border-0 last:pb-0"
              >
                <ChevronRight className="size-3 text-slate-500 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="pt-2">
            <Button
              onClick={onProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              Continue to Traceability Map
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!started.current && integrationTestFiles.length === 0 && !integrationGenerating && sessionId) {
      started.current = true;
      onGenerate(code, language, sessionId, pseudocode, userStory, riskLevel, highRiskFunctions, structuredFiles);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && integrationTestFiles.length > 0) {
      const t = setTimeout(() => onProceed(), 2000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, integrationTestFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const monacoLang = language === "csharp" ? "csharp" : language === "cpp" ? "cpp" : language === "java" ? "java" : language === "python" ? "python" : "typescript";

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Beaker className="size-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-slate-100">Generate Integration Tests</h2>
        </div>
        <p className="text-sm text-slate-500">
          Workflow-based test scenarios validating module interactions, API contracts,
          service communication, database operations, and end-to-end business processes.
        </p>
      </div>

      {integrationGenerating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-slate-700 bg-slate-900/40">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-purple-500/20 animate-ping" />
            <div className="relative flex size-16 items-center justify-center rounded-full bg-purple-500/10 border border-purple-500/30">
              <Loader2 className="size-7 animate-spin text-purple-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Generating integration tests…</p>
            <p className="text-xs text-slate-500 mt-1">AI is writing workflow and module interaction tests</p>
          </div>
        </div>
      )}

      {!integrationGenerating && integrationTestFiles.length > 0 && (
        <>
          {/* Misclassification warning */}
          {integrationTestFiles.some((f) => f.misclassified) && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
              <AlertTriangle className="size-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-amber-300 mb-1">Misclassification Warning</p>
                <p className="text-xs text-amber-400/80">
                  Some generated tests appear to be <strong>unit tests</strong> placed in the integration pipeline.
                  Integration tests must span multiple objects, services, or workflow steps — not test a single function in isolation.
                  These tests are <strong>kept and flagged</strong> — they are not regenerated automatically. You can edit them
                  in the Execute Integration Tests step, or move single-function tests like{" "}
                  <code className="font-mono bg-amber-500/10 px-1 rounded">test_deposit_positive_amount</code> to the unit test pipeline.
                </p>
              </div>
            </div>
          )}

          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Test Files", value: String(integrationTestFiles.length), color: "text-purple-400" },
              { label: "Integration Coverage", value: `~${integrationCoverage}%`, color: "text-green-400" },
              { label: "Test Type", value: "Integration", color: "text-slate-200" },
              { label: "Status", value: "Ready", color: "text-emerald-400" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-center">
                <p className={cn("text-xl font-bold", m.color)}>{m.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Coverage breakdown */}
          <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4 space-y-2">
            <div className="flex items-center gap-2 mb-3">
              <Network className="size-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">Integration Test Validation Areas</h3>
            </div>
            {[
              { label: "API Interactions", desc: "Request/response contracts and status codes" },
              { label: "Service Communication", desc: "Service-to-service data flow validation" },
              { label: "Database Interactions", desc: "CRUD operations and data integrity" },
              { label: "Event / Message Flows", desc: "Async messaging and event-driven patterns" },
              { label: "End-to-End Business Processes", desc: "Full workflow validation across modules" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-green-400 shrink-0" />
                <span className="text-xs font-medium text-slate-300">{item.label}</span>
                <span className="text-xs text-slate-500">— {item.desc}</span>
              </div>
            ))}
          </div>

          {/* File tabs + editor */}
          <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
            {integrationTestFiles.length > 1 && (
              <div className="flex border-b border-slate-700 overflow-x-auto">
                {integrationTestFiles.map((f, i) => (
                  <button
                    key={f.filename}
                    onClick={() => setActiveFile(i)}
                    className={cn(
                      "shrink-0 px-3 py-2 text-xs font-mono transition-colors",
                      i === activeFile
                        ? "bg-slate-800 text-slate-100 border-b-2 border-purple-500"
                        : "text-slate-500 hover:text-slate-300",
                    )}
                  >
                    <Code2 className="inline size-3 mr-1.5" />
                    {f.filename}
                  </button>
                ))}
              </div>
            )}
            {integrationTestFiles[activeFile] && (
              <div className="h-64">
                <MonacoEditor
                  height="100%"
                  language={monacoLang}
                  value={integrationTestFiles[activeFile].code}
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 12,
                    scrollBeyondLastLine: false,
                    theme: "vs-dark",
                  }}
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={onProceed}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              Build Traceability Map
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      )}

      {!integrationGenerating && integrationTestFiles.length === 0 && sessionId && started.current && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 space-y-4">
          <div className="text-center space-y-3">
            <p className="text-sm font-semibold text-slate-300">No integration boundaries detected</p>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              The source code has no external dependencies (database, HTTP, file system, queue, or
              distinct service classes) that would constitute a real integration boundary.
              All behavior is fully covered by the unit tests generated in Step 4.
            </p>
          </div>

          {/* Actual rejection reasons from the AI, when present */}
          {integrationRejections && integrationRejections.length > 0 && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left max-w-lg mx-auto space-y-2">
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Why the AI rejected integration tests
              </p>
              {integrationRejections.map((r, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 text-xs text-slate-400 border-b border-slate-800/40 pb-2 last:border-0 last:pb-0"
                >
                  <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    {(r.proposed_name || r.rejection_rule) && (
                      <p className="text-slate-300 font-medium">
                        {r.proposed_name || "Boundary check"}
                        {r.rejection_rule ? ` — ${r.rejection_rule}` : ""}
                      </p>
                    )}
                    <p>{r.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-amber-400/70 text-center">
            Tip: Integration tests require at least two distinct components crossing an architectural boundary.
            A Python list or dict does not qualify as a database.
          </p>
        </div>
      )}

      {!integrationGenerating && integrationTestFiles.length === 0 && !sessionId && (
        <div className="text-center py-12 text-slate-500 text-sm">
          Complete unit test generation to continue.
        </div>
      )}
    </div>
  );
}
