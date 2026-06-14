"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Loader2, Play, XCircle, ChevronDown, ChevronRight, ArrowRight, Beaker, Ban
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile, SandboxResult, SandboxFailure } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

function FailureDetail({ failure }: { failure: SandboxFailure }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-red-500/10 transition-colors"
      >
        <XCircle className="size-4 text-red-400 shrink-0" />
        <span className="flex-1 text-xs font-mono text-red-300 truncate">{failure.test_name}</span>
        <span className="text-xs text-red-400/70 shrink-0 mr-1 truncate max-w-[200px]">
          {failure.error_message.slice(0, 60)}{failure.error_message.length > 60 ? "…" : ""}
        </span>
        {open ? <ChevronDown className="size-4 text-slate-500 shrink-0" /> : <ChevronRight className="size-4 text-slate-500 shrink-0" />}
      </button>
      {open && failure.traceback && (
        <div className="border-t border-red-500/20 p-3">
          <pre className="text-xs text-red-300/80 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{failure.traceback}</pre>
        </div>
      )}
    </div>
  );
}

interface TerminalLine { text: string; type: "pass" | "fail" | "info"; }

function buildTerminalLines(result: SandboxResult): TerminalLine[] {
  const lines: TerminalLine[] = [{ text: "$ Running integration test suite in Docker sandbox…", type: "info" }];
  for (let i = 0; i < result.passed; i++) {
    lines.push({ text: `  ✓  integration_test_${String(i + 1).padStart(3, "0")}`, type: "pass" });
  }
  for (const f of result.failures) {
    lines.push({ text: `  ✗  ${f.test_name}`, type: "fail" });
  }
  lines.push({ text: "──────────────────────────────────", type: "info" });
  lines.push({
    text: `  ${result.passed} passed · ${result.failed} failed · ${result.total} total`,
    type: result.failed === 0 ? "pass" : "fail",
  });
  return lines;
}

function computeGrade(passed: number, total: number): "A" | "B" | "C" | "D" {
  if (total === 0) return "D";
  const pct = (passed / total) * 100;
  if (pct >= 90) return "A";
  if (pct >= 70) return "B";
  if (pct >= 50) return "C";
  return "D";
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-400 bg-green-500/15 border-green-500/30",
  B: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  C: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  D: "text-red-400 bg-red-500/15 border-red-500/30",
};

interface Props {
  sessionId: string | null;
  language: Language;
  integrationTestFiles: TestFile[];
  integrationSandboxResult: SandboxResult | null;
  integrationSandboxRunning: boolean;
  isDemoMode?: boolean;
  gates?: Record<string, boolean> | null;
  eligibility?: any;
  onRunIntegrationSandbox: (sessionId: string, lang: Language) => void;
  onUpdateFile: (filename: string, code: string) => void;
  onProceed: () => void;
}

export function Step8ExecuteIntegrationTests({
  sessionId, language,
  integrationTestFiles, integrationSandboxResult, integrationSandboxRunning,
  isDemoMode,
  gates, eligibility,
  onRunIntegrationSandbox, onUpdateFile, onProceed,
}: Props) {
  const [activeFile, setActiveFile] = useState(0);
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);

  // Skipped state — show informative screen
  if (gates && gates.execute_integration_tests === false) {
    return (
      <div className="flex flex-col gap-5 animate-fade-in-up">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Ban className="size-5 text-slate-500" />
            <h2 className="text-lg font-semibold text-slate-100">Execute Integration Tests</h2>
          </div>
          <p className="text-sm text-slate-500">
            Run multi-step workflow tests in an isolated Docker sandbox.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center space-y-4 max-w-2xl mx-auto w-full">
          <div className="flex size-14 items-center justify-center rounded-full bg-slate-800 text-slate-400 mx-auto">
            <Ban className="size-6" />
          </div>

          <h3 className="text-base font-semibold text-slate-200">
            Execution Skipped
          </h3>

          <p className="text-xs text-slate-400 leading-relaxed max-w-lg mx-auto">
            {eligibility?.integration_test_reason ||
              "No integration tests were generated because the code does not possess integration boundaries."}
          </p>

          <div className="pt-2">
            <Button
              onClick={onProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              Continue to Report & Export
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  useEffect(() => {
    if (!integrationSandboxResult) { setVisibleLines([]); return; }
    const allLines = buildTerminalLines(integrationSandboxResult);
    setVisibleLines([]);
    allLines.forEach((line, i) => {
      setTimeout(() => setVisibleLines((prev) => [...prev, line]), i * 40);
    });
  }, [integrationSandboxResult]);

  useEffect(() => {
    if (isDemoMode && sessionId && !integrationSandboxRunning && !integrationSandboxResult) {
      onRunIntegrationSandbox(sessionId, language);
    }
  }, [isDemoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && integrationSandboxResult) {
      const t = setTimeout(() => onProceed(), 3000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, integrationSandboxResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = integrationSandboxResult ? computeGrade(integrationSandboxResult.passed, integrationSandboxResult.total) : null;
  const monacoLang = language === "csharp" ? "csharp" : language === "cpp" ? "cpp" : language === "java" ? "java" : language === "python" ? "python" : "typescript";
  const passRate = integrationSandboxResult && integrationSandboxResult.total > 0
    ? Math.round((integrationSandboxResult.passed / integrationSandboxResult.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Beaker className="size-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-slate-100">Execute Integration Tests</h2>
        </div>
        <p className="text-sm text-slate-500">
          Run multi-step workflow tests in an isolated Docker sandbox. Integration tests verify cross-object state,
          service interactions, and end-to-end business flows — not individual function behavior.
          Single-function tests belong in Step 7 (Unit Tests).
        </p>
      </div>

      {/* Generated integration test files */}
      {integrationTestFiles.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900/60">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Integration Test Files ({integrationTestFiles.length})
            </span>
          </div>
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
                  {f.filename}
                </button>
              ))}
            </div>
          )}
          {integrationTestFiles[activeFile] && (
            <div className="h-48">
              <MonacoEditor
                height="100%"
                language={monacoLang}
                value={integrationTestFiles[activeFile].code}
                onChange={(v) => onUpdateFile(integrationTestFiles[activeFile].filename, v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, theme: "vs-dark" }}
              />
            </div>
          )}
        </div>
      )}

      {/* No integration tests available */}
      {integrationTestFiles.length === 0 && !integrationSandboxResult && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-300">No integration tests to execute</p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            The AI determined that the source code has no real integration boundaries (database, HTTP,
            file system, queue, or distinct service classes). All testing is covered by unit tests.
          </p>
          <Button onClick={onProceed} className="bg-purple-600 hover:bg-purple-700 text-white gap-2 mt-2">
            View Report & Export
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Run button */}
      {integrationTestFiles.length > 0 && !integrationSandboxResult && (
        <div className="flex justify-center py-4">
          <Button
            onClick={() => sessionId && onRunIntegrationSandbox(sessionId, language)}
            disabled={!sessionId || integrationSandboxRunning}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2 px-8"
          >
            {integrationSandboxRunning ? (
              <><Loader2 className="size-4 animate-spin" /> Running Integration Tests…</>
            ) : (
              <><Play className="size-4" /> Run Integration Tests in Sandbox</>
            )}
          </Button>
        </div>
      )}

      {/* Terminal output */}
      {visibleLines.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-[#0a0f1a] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 bg-slate-900/50">
            <div className="flex gap-1.5">
              <div className="size-2.5 rounded-full bg-red-500/60" />
              <div className="size-2.5 rounded-full bg-yellow-500/60" />
              <div className="size-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[10px] text-slate-600 font-mono">Integration Test Runner</span>
          </div>
          <div className="p-3 font-mono text-xs space-y-0.5 max-h-48 overflow-y-auto">
            {visibleLines.map((line, i) => (
              <div key={i} className={cn(
                line.type === "pass" && "text-green-400",
                line.type === "fail" && "text-red-400",
                line.type === "info" && "text-slate-500",
              )}>{line.text}</div>
            ))}
          </div>
        </div>
      )}

      {/* Results */}
      {integrationSandboxResult && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {grade && (
              <div className={cn("rounded-xl border p-3 text-center", GRADE_COLORS[grade])}>
                <p className="text-2xl font-bold">{grade}</p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">Integration Grade</p>
              </div>
            )}
            {[
              { label: "Tests Run", value: String(integrationSandboxResult.total), color: "text-slate-200" },
              { label: "Passed", value: String(integrationSandboxResult.passed), color: "text-green-400" },
              { label: "Pass Rate", value: `${passRate}%`, color: passRate >= 80 ? "text-green-400" : passRate >= 60 ? "text-amber-400" : "text-red-400" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-center">
                <p className={cn("text-xl font-bold", m.color)}>{m.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>

          {integrationSandboxResult.failures.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">Integration Test Failures ({integrationSandboxResult.failures.length})</h3>
              {integrationSandboxResult.failures.map((f, i) => (
                <FailureDetail key={i} failure={f} />
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => sessionId && onRunIntegrationSandbox(sessionId, language)}
              disabled={integrationSandboxRunning}
              className="border-slate-600 text-slate-300 hover:bg-slate-800 gap-2"
            >
              <Play className="size-3.5" /> Re-run
            </Button>
            <Button
              onClick={onProceed}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
            >
              View Report & Export
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
