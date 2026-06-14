"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Loader2, Play, XCircle, ChevronDown, ChevronRight, ArrowRight, Microscope, Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile, SandboxResult, SandboxFailure } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface AutofixedFailure extends SandboxFailure {
  was_autofixed?: boolean;
  autofix_attempts?: number;
  fix_history?: FixAttempt[];
  status?: string;
}

function FailureDetail({ failure }: { failure: AutofixedFailure }) {
  const [open, setOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const wasFixed = failure.was_autofixed && failure.status === "passed";
  const failedAllAttempts = !wasFixed && (failure.autofix_attempts ?? 0) > 0;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden",
      wasFixed ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5",
    )}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors",
          wasFixed ? "hover:bg-green-500/10" : "hover:bg-red-500/10",
        )}
      >
        <XCircle className={cn("size-4 shrink-0", wasFixed ? "text-green-400" : "text-red-400")} />
        <span className={cn("flex-1 text-xs font-mono truncate", wasFixed ? "text-green-300" : "text-red-300")}>
          {failure.test_name}
        </span>

        {wasFixed && (
          <span className="shrink-0 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
            Auto-fixed in {failure.autofix_attempts} attempt{failure.autofix_attempts !== 1 ? "s" : ""}
          </span>
        )}
        {failedAllAttempts && (
          <span className="shrink-0 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
            Could not fix after {MAX_ATTEMPTS} attempts
          </span>
        )}

        <span className="text-xs text-red-400/70 shrink-0 mr-1 truncate max-w-[160px]">
          {failure.error_message.slice(0, 50)}{failure.error_message.length > 50 ? "…" : ""}
        </span>
        {open ? <ChevronDown className="size-4 text-slate-500 shrink-0" /> : <ChevronRight className="size-4 text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className={cn("border-t p-3 space-y-2", wasFixed ? "border-green-500/20" : "border-red-500/20")}>
          {failure.traceback && (
            <pre className="text-xs text-red-300/80 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{failure.traceback}</pre>
          )}

          {failure.fix_history && failure.fix_history.length > 0 && (
            <div>
              <button
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              >
                {historyOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                Fix history ({failure.fix_history.length} attempt{failure.fix_history.length !== 1 ? "s" : ""})
              </button>
              {historyOpen && (
                <div className="mt-2 pl-3 border-l-2 border-slate-700 space-y-2">
                  {failure.fix_history.map((attempt, i) => (
                    <div key={i} className="text-xs">
                      <span className="font-semibold text-slate-300">Attempt {attempt.attempt}:</span>{" "}
                      {attempt.fault_location && (
                        <span className="text-slate-400">Fault in {attempt.fault_location.toUpperCase()} — </span>
                      )}
                      <span className="text-slate-400">{attempt.fix_explanation}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface TerminalLine { text: string; type: "pass" | "fail" | "info"; }

function buildTerminalLines(result: SandboxResult): TerminalLine[] {
  const lines: TerminalLine[] = [{ text: "$ Running unit test suite in Docker sandbox…", type: "info" }];
  for (let i = 0; i < result.passed; i++) {
    lines.push({ text: `  ✓  test_${String(i + 1).padStart(3, "0")}`, type: "pass" });
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

const MAX_ATTEMPTS = 3;

interface FixAttempt {
  attempt: number;
  fault_location?: string;
  fix_explanation?: string;
  error?: string;
}

interface Props {
  sessionId: string | null;
  language: Language;
  unitTestFiles: TestFile[];
  unitSandboxResult: SandboxResult | null;
  unitSandboxRunning: boolean;
  isDemoMode?: boolean;
  onRunUnitSandbox: (sessionId: string, lang: Language, autofixEnabled?: boolean) => void;
  onUpdateFile: (filename: string, code: string) => void;
  onProceed: () => void;
}

export function Step7ExecuteUnitTests({
  sessionId, language,
  unitTestFiles, unitSandboxResult, unitSandboxRunning,
  isDemoMode,
  onRunUnitSandbox, onUpdateFile, onProceed,
}: Props) {
  const [activeFile, setActiveFile] = useState(0);
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);
  const [autofixEnabled, setAutofixEnabled] = useState(true);

  useEffect(() => {
    if (!unitSandboxResult) { setVisibleLines([]); return; }
    const allLines = buildTerminalLines(unitSandboxResult);
    setVisibleLines([]);
    allLines.forEach((line, i) => {
      setTimeout(() => setVisibleLines((prev) => [...prev, line]), i * 40);
    });
  }, [unitSandboxResult]);

  useEffect(() => {
    if (isDemoMode && sessionId && !unitSandboxRunning && !unitSandboxResult) {
      onRunUnitSandbox(sessionId, language, autofixEnabled);
    }
  }, [isDemoMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && unitSandboxResult) {
      const t = setTimeout(() => onProceed(), 3000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, unitSandboxResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = unitSandboxResult ? computeGrade(unitSandboxResult.passed, unitSandboxResult.total) : null;
  const monacoLang = language === "csharp" ? "csharp" : language === "cpp" ? "cpp" : language === "java" ? "java" : language === "python" ? "python" : "typescript";
  const passRate = unitSandboxResult && unitSandboxResult.total > 0
    ? Math.round((unitSandboxResult.passed / unitSandboxResult.total) * 100)
    : 0;

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Microscope className="size-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Execute Unit Tests</h2>
        </div>
        <p className="text-sm text-slate-500">
          Run the generated unit test suite in an isolated Docker sandbox. Measures pass/fail rate and code coverage.
        </p>
      </div>

      {/* Generated unit test files */}
      {unitTestFiles.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 bg-slate-900/60">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
              Unit Test Files ({unitTestFiles.length})
            </span>
          </div>
          {unitTestFiles.length > 1 && (
            <div className="flex border-b border-slate-700 overflow-x-auto">
              {unitTestFiles.map((f, i) => (
                <button
                  key={f.filename}
                  onClick={() => setActiveFile(i)}
                  className={cn(
                    "shrink-0 px-3 py-2 text-xs font-mono transition-colors",
                    i === activeFile
                      ? "bg-slate-800 text-slate-100 border-b-2 border-blue-500"
                      : "text-slate-500 hover:text-slate-300",
                  )}
                >
                  {f.filename}
                </button>
              ))}
            </div>
          )}
          {unitTestFiles[activeFile] && (
            <div className="h-48">
              <MonacoEditor
                height="100%"
                language={monacoLang}
                value={unitTestFiles[activeFile].code}
                onChange={(v) => onUpdateFile(unitTestFiles[activeFile].filename, v ?? "")}
                options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, theme: "vs-dark" }}
              />
            </div>
          )}
        </div>
      )}

      {/* Autofix toggle */}
      <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          checked={autofixEnabled}
          onChange={(e) => setAutofixEnabled(e.target.checked)}
          className="size-4 rounded accent-blue-500 cursor-pointer"
        />
        <Wrench className="size-3.5 text-slate-400" />
        Auto-fix failing tests (up to {MAX_ATTEMPTS} attempts)
      </label>

      {/* Run button */}
      {!unitSandboxResult && (
        <div className="flex justify-center py-4">
          <Button
            onClick={() => sessionId && onRunUnitSandbox(sessionId, language, autofixEnabled)}
            disabled={!sessionId || unitSandboxRunning || unitTestFiles.length === 0}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2 px-8"
          >
            {unitSandboxRunning ? (
              <><Loader2 className="size-4 animate-spin" /> Running Unit Tests…</>
            ) : (
              <><Play className="size-4" /> Run Unit Tests in Sandbox</>
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
            <span className="text-[10px] text-slate-600 font-mono">Unit Test Runner</span>
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
      {unitSandboxResult && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {grade && (
              <div className={cn("rounded-xl border p-3 text-center", GRADE_COLORS[grade])}>
                <p className="text-2xl font-bold">{grade}</p>
                <p className="text-[10px] uppercase tracking-wider mt-0.5">Unit Grade</p>
              </div>
            )}
            {[
              { label: "Tests Run", value: String(unitSandboxResult.total), color: "text-slate-200" },
              { label: "Passed", value: String(unitSandboxResult.passed), color: "text-green-400" },
              { label: "Pass Rate", value: `${passRate}%`, color: passRate >= 80 ? "text-green-400" : passRate >= 60 ? "text-amber-400" : "text-red-400" },
            ].map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3 text-center">
                <p className={cn("text-xl font-bold", m.color)}>{m.value}</p>
                <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">{m.label}</p>
              </div>
            ))}
          </div>

          {unitSandboxResult.failures.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-300">
                Unit Test Failures ({unitSandboxResult.failures.length})
              </h3>
              {(unitSandboxResult.failures as AutofixedFailure[]).map((f, i) => (
                <FailureDetail key={i} failure={f} />
              ))}
            </div>
          )}

          <div className="flex gap-3 justify-end">
            <Button
              variant="outline"
              onClick={() => sessionId && onRunUnitSandbox(sessionId, language, autofixEnabled)}
              disabled={unitSandboxRunning}
              className="border-slate-600 text-slate-300 hover:bg-slate-800 gap-2"
            >
              <Play className="size-3.5" /> Re-run
            </Button>
            <Button
              onClick={onProceed}
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              Execute Integration Tests
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
