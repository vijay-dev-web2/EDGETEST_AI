"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import {
  Loader2, Play, RefreshCw, XCircle,
  ChevronDown, ChevronRight, ArrowRight,
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

interface TerminalLine {
  text: string;
  type: "pass" | "fail" | "info";
}

function buildTerminalLines(result: SandboxResult): TerminalLine[] {
  const lines: TerminalLine[] = [{ text: "$ Running test suite in Docker sandbox…", type: "info" }];
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

interface Props {
  sessionId: string | null;
  language: Language;
  generatedFiles: TestFile[];
  requestedTests: number;
  sandboxResult: SandboxResult | null;
  sandboxRunning: boolean;
  loading: boolean;
  loadingMessage: string;
  isDemoMode?: boolean;
  onRunSandbox: (sessionId: string, lang: Language) => void;
  onSetEditing: (editing: boolean) => void;
  onUpdateFile: (filename: string, code: string) => void;
  onProceedToReport: () => void;
}

export function Step6SandboxExecution({
  sessionId, language,
  generatedFiles, requestedTests, sandboxResult, sandboxRunning,
  loading, loadingMessage, isDemoMode,
  onRunSandbox, onUpdateFile, onProceedToReport,
}: Props) {
  const [activeFile, setActiveFile] = useState(0);
  const [visibleLines, setVisibleLines] = useState<TerminalLine[]>([]);

  // Stream terminal lines when result arrives
  useEffect(() => {
    if (!sandboxResult) { setVisibleLines([]); return; }
    const lines = buildTerminalLines(sandboxResult);
    setVisibleLines([]);
    lines.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLines((prev) => [...prev, line]);
      }, i * 80);
    });
  }, [sandboxResult]);

  // Demo: auto-run sandbox
  useEffect(() => {
    if (isDemoMode && !sandboxRunning && !sandboxResult && generatedFiles.length > 0 && sessionId) {
      const t = setTimeout(() => onRunSandbox(sessionId, language), 1500);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, generatedFiles.length, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo: auto-proceed to report
  useEffect(() => {
    if (isDemoMode && sandboxResult) {
      const t = setTimeout(() => onProceedToReport(), 3000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, sandboxResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const grade = sandboxResult ? computeGrade(sandboxResult.passed, sandboxResult.total) : null;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <div className="relative flex size-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/30">
            <Loader2 className="size-7 animate-spin text-blue-400" />
          </div>
        </div>
        <p className="text-sm text-slate-400">{loadingMessage || "Generating tests…"}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Sandbox Execution</h2>
        <p className="text-sm text-slate-500">Review generated tests, then run them in an isolated Docker container.</p>
      </div>

      {/* Generation Summary Banner */}
      <div className="shrink-0 rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-blue-400">Generation Summary</h3>
        </div>
        <div className="grid grid-cols-2 gap-4 text-center mt-2">
          <div className="bg-slate-900/50 rounded-md py-2 border border-slate-700">
            <div className="text-xs text-slate-500">Categories Requested</div>
            <div className="text-sm font-semibold text-slate-200">{requestedTests}</div>
          </div>
          <div className="bg-slate-900/50 rounded-md py-2 border border-slate-700">
            <div className="text-xs text-slate-500">Files Generated</div>
            <div className="text-sm font-semibold text-green-400">{generatedFiles.length > 0 ? generatedFiles.length : 0}</div>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3 italic">
          * The LLM determines the exact number of test methods needed to satisfy the selected categories.
        </p>
      </div>

      {/* File tabs + editor */}
      {generatedFiles.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-700 overflow-hidden" style={{ height: 280 }}>
          <div className="flex items-center gap-1 px-2 pt-2 bg-slate-800/80 border-b border-slate-700 flex-wrap">
            {generatedFiles.map((f, i) => (
              <button
                key={f.filename}
                onClick={() => setActiveFile(i)}
                className={cn(
                  "px-3 py-1.5 text-xs font-mono rounded-t-md transition-colors",
                  activeFile === i
                    ? "bg-slate-900 text-blue-400 border-t border-x border-slate-700"
                    : "text-slate-500 hover:text-slate-300",
                )}
              >
                {f.filename}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0">
            {generatedFiles[activeFile] && (
              <MonacoEditor
                height="100%"
                language={generatedFiles[activeFile].language}
                theme="vs-dark"
                value={generatedFiles[activeFile].code}
                onChange={(v) => onUpdateFile(generatedFiles[activeFile].filename, v ?? "")}
                options={{
                  fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  minimap: { enabled: false },
                  scrollBeyondLastLine: false,
                  padding: { top: 8 },
                  lineNumbers: "on",
                  wordWrap: "on",
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Run controls */}
      <div className="shrink-0 flex items-center gap-3 flex-wrap">
        <Button
          onClick={() => sessionId && onRunSandbox(sessionId, language)}
          disabled={!sessionId || sandboxRunning || generatedFiles.length === 0}
          className="bg-green-600 hover:bg-green-500 text-white border-0 shadow-md shadow-green-600/20 disabled:opacity-40"
        >
          {sandboxRunning
            ? <><Loader2 className="size-4 animate-spin mr-1.5" />Running…</>
            : <><Play className="size-4 mr-1.5" />{sandboxResult ? "Re-run Tests" : "Run Tests in Sandbox"}</>
          }
        </Button>
        {sandboxResult && (
          <button
            onClick={() => sessionId && onRunSandbox(sessionId, language)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="size-4" /> Re-run
          </button>
        )}
      </div>

      {/* Terminal output */}
      {(sandboxRunning || visibleLines.length > 0) && (
        <div className="shrink-0 rounded-xl border border-slate-700 bg-[#0D1117] overflow-hidden">
          <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-800">
            <div className="h-3 w-3 rounded-full bg-red-500/60" />
            <div className="h-3 w-3 rounded-full bg-amber-500/60" />
            <div className="h-3 w-3 rounded-full bg-green-500/60" />
            <span className="ml-2 text-xs text-slate-600">edgetest-sandbox</span>
          </div>
          <div className="p-4 space-y-1 font-mono text-xs max-h-48 overflow-y-auto">
            {visibleLines.map((line, i) => (
              <div key={i} className={cn(
                "animate-stagger-in",
                line.type === "pass" ? "text-green-400" : line.type === "fail" ? "text-red-400" : "text-slate-400",
              )}>
                {line.text}
              </div>
            ))}
            {sandboxRunning && (
              <div className="text-slate-500 animate-pulse">█</div>
            )}
          </div>
        </div>
      )}

      {/* Results summary */}
      {sandboxResult && (
        <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            {grade && (
              <div className={cn("flex size-14 flex-col items-center justify-center rounded-xl border text-sm font-black", GRADE_COLORS[grade])}>
                {grade}
                <span className="text-[10px] font-normal">Grade</span>
              </div>
            )}
            <div className="flex gap-4">
              {[
                { label: "Total", value: sandboxResult.total, color: "text-slate-200" },
                { label: "Passed", value: sandboxResult.passed, color: "text-green-400" },
                { label: "Failed", value: sandboxResult.failed, color: "text-red-400" },
              ].map((m) => (
                <div key={m.label} className="text-center">
                  <div className={cn("text-2xl font-bold tabular-nums", m.color)}>{m.value}</div>
                  <div className="text-xs text-slate-500">{m.label}</div>
                </div>
              ))}
            </div>
            {sandboxResult.total > 0 && (
              <div className="flex-1 min-w-[120px]">
                <div className="flex items-center justify-between mb-1 text-xs text-slate-500">
                  <span>Pass rate</span>
                  <span className="font-semibold text-slate-300">
                    {Math.round((sandboxResult.passed / sandboxResult.total) * 100)}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-500 transition-all duration-700"
                    style={{ width: `${Math.round((sandboxResult.passed / sandboxResult.total) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {sandboxResult.failures.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-red-400">Failures:</p>
              {sandboxResult.failures.map((f, i) => (
                <FailureDetail key={i} failure={f} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Continue to report */}
      {sandboxResult && (
        <div className="shrink-0 pt-2 flex justify-end">
          <Button
            onClick={onProceedToReport}
            className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20"
          >
            Continue to Report
            <ArrowRight className="size-4 ml-1.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
