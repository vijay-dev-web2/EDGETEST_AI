"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle, ChevronDown, ChevronRight, RefreshCw, Wrench, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SandboxResult, SandboxFailure } from "@/lib/backendApi";
import type { TestScenario, TestFile } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";
import { EvaluationPanel } from "@/components/EvaluationPanel";

interface TerminalLine {
  text: string;
  status: "pass" | "fail" | "info";
}

function buildLines(result: SandboxResult): TerminalLine[] {
  const lines: TerminalLine[] = [{ text: "$ Running test suite…", status: "info" }];
  const passCount = result.passed;
  const failNames = result.failures.map((f) => f.test_name);

  for (let i = 0; i < passCount; i++) {
    lines.push({ text: `  PASSED  test_${String(i + 1).padStart(3, "0")}`, status: "pass" });
  }
  for (const name of failNames) {
    lines.push({ text: `  FAILED  ${name}`, status: "fail" });
  }
  lines.push({ text: `───────────────────────────────────`, status: "info" });
  lines.push({
    text: `  ${result.passed} passed, ${result.failed} failed, ${result.total} total`,
    status: result.failed === 0 ? "pass" : "fail",
  });
  return lines;
}

function FailureDetail({ failure }: { failure: SandboxFailure }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-red-500/20 bg-red-500/5 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-red-500/10 transition-colors"
      >
        <XCircle className="size-4 text-red-400 shrink-0" />
        <span className="flex-1 text-sm font-mono text-red-300 truncate">{failure.test_name}</span>
        <span className="text-xs text-red-400/70 shrink-0 mr-1">{failure.error_message.slice(0, 60)}{failure.error_message.length > 60 ? "…" : ""}</span>
        {open ? <ChevronDown className="size-4 text-zinc-500 shrink-0" /> : <ChevronRight className="size-4 text-zinc-500 shrink-0" />}
      </button>
      {open && failure.traceback && (
        <div className="border-t border-red-500/20 p-3">
          <pre className="text-xs text-red-300/80 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{failure.traceback}</pre>
        </div>
      )}
    </div>
  );
}

interface Props {
  sessionId: string | null;
  language: Language;
  sandboxRunning: boolean;
  sandboxResult: SandboxResult | null;
  selectedScenarioNames: string[];
  maxTests: number;
  code: string;
  userStory?: string;
  scenarios?: TestScenario[];
  generatedFiles?: TestFile[];
  isDemoMode?: boolean;
  onRerun: (sessionId: string, language: Language) => void;
  onFix: (code: string, language: Language, sessionId: string, failures: SandboxFailure[], selectedScenarioNames: string[], maxTests: number, userStory?: string) => void;
  onProceedToExport: () => void;
}

export function Step6SandboxResults({
  sessionId, language, sandboxRunning, sandboxResult,
  selectedScenarioNames, maxTests, code, userStory,
  scenarios = [], generatedFiles = [], isDemoMode,
  onRerun, onFix, onProceedToExport,
}: Props) {
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);
  const [animDone, setAnimDone] = useState(false);

  useEffect(() => {
    if (!sandboxResult) { setVisibleLines([]); setAnimDone(false); return; }
    const lines = buildLines(sandboxResult);
    let i = 0;
    setVisibleLines([]);
    setAnimDone(false);
    const timer = setInterval(() => {
      i++;
      setVisibleLines(lines.slice(0, i));
      if (i >= lines.length) { clearInterval(timer); setAnimDone(true); }
    }, 80);
    return () => clearInterval(timer);
  }, [sandboxResult]);

  // Demo auto-proceed to export
  useEffect(() => {
    if (isDemoMode && sandboxResult && !sandboxRunning && animDone) {
      const timer = setTimeout(() => onProceedToExport(), 2500);
      return () => clearTimeout(timer);
    }
  }, [isDemoMode, sandboxResult, sandboxRunning, animDone]); // eslint-disable-line react-hooks/exhaustive-deps

  if (sandboxRunning && !sandboxResult) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping" />
          <div className="relative flex size-16 items-center justify-center rounded-full bg-green-500/10 border border-green-500/30">
            <Loader2 className="size-7 animate-spin text-green-400" />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-medium text-zinc-200">Running tests in sandbox…</p>
          <p className="text-sm text-zinc-500">Executing inside an isolated Docker container</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4 overflow-y-auto pr-1">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Sandbox Results</h2>
        <p className="text-sm text-zinc-500">Tests executed in an isolated Docker sandbox.</p>
      </div>

      {/* Summary bar */}
      {sandboxResult && (
        <div className="shrink-0 grid grid-cols-3 gap-3">
          {[
            { label: "Total",  value: sandboxResult.total,  color: "text-zinc-300", bg: "bg-zinc-800/60" },
            { label: "Passed", value: sandboxResult.passed, color: "text-green-400", bg: "bg-green-500/10 border border-green-500/20" },
            { label: "Failed", value: sandboxResult.failed, color: "text-red-400",   bg: "bg-red-500/10 border border-red-500/20" },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={cn("rounded-xl p-3 text-center", bg)}>
              <div className={cn("text-3xl font-bold tabular-nums", color)}>{value}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Terminal output */}
      <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-950 overflow-hidden font-mono" style={{ minHeight: 160 }}>
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800 bg-zinc-900/60">
          {["bg-red-500/80", "bg-yellow-500/80", "bg-green-500/80"].map((c, i) => (
            <div key={i} className={cn("size-2.5 rounded-full", c)} />
          ))}
          <span className="ml-2 text-xs text-zinc-600">sandbox — docker run</span>
        </div>
        <div className="overflow-y-auto p-4 space-y-0.5 max-h-48">
          {visibleLines.map((line, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 text-xs leading-5",
                line.status === "pass" && "text-green-400",
                line.status === "fail" && "text-red-400",
                line.status === "info" && "text-zinc-500",
              )}
            >
              {line.status === "pass" && <CheckCircle2 className="size-3 shrink-0" />}
              {line.status === "fail" && <XCircle className="size-3 shrink-0" />}
              {line.status === "info" && <span className="size-3 shrink-0" />}
              <span className="font-mono">{line.text}</span>
            </div>
          ))}
          {(sandboxRunning || !sandboxResult) && (
            <div className="flex items-center gap-2 text-xs text-zinc-600">
              <Loader2 className="size-3 animate-spin" /> running…
            </div>
          )}
        </div>
      </div>

      {/* Failure details */}
      {animDone && sandboxResult && sandboxResult.failures.length > 0 && (
        <div className="shrink-0 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Failure Details ({sandboxResult.failures.length})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {sandboxResult.failures.map((f, i) => (
              <FailureDetail key={i} failure={f} />
            ))}
          </div>
        </div>
      )}

      {/* Evaluation Panel */}
      {animDone && sandboxResult && generatedFiles.length > 0 && (
        <EvaluationPanel
          code={code}
          language={language}
          generatedFiles={generatedFiles}
          scenarios={scenarios}
          selectedScenarioNames={selectedScenarioNames}
          sandboxResult={sandboxResult}
        />
      )}

      {/* Actions */}
      {animDone && sandboxResult && (
        <div className="shrink-0 pt-4 border-t border-zinc-800 flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => sessionId && onRerun(sessionId, language)}
            disabled={!sessionId}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RefreshCw className="size-4 mr-1.5" /> Re-run Tests
          </Button>

          {sandboxResult.failures.length > 0 && (
            <Button
              variant="outline"
              onClick={() => sessionId && onFix(code, language, sessionId, sandboxResult.failures, selectedScenarioNames, maxTests, userStory)}
              disabled={!sessionId}
              className="border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10"
            >
              <Wrench className="size-4 mr-1.5" /> Fix Failed Tests
            </Button>
          )}

          <Button
            onClick={onProceedToExport}
            className="bg-blue-600 hover:bg-blue-500 text-white border-0 ml-auto"
          >
            Export Results <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
