"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, FlaskConical, CheckCircle2, Code2, BarChart3, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface AAABadgeProps { compliant: boolean; percent: number; issues: string[] }

function AAABadge({ compliant, percent, issues }: AAABadgeProps) {
  const [open, setOpen] = useState(false);
  if (compliant) {
    return (
      <span className="flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[10px] font-semibold text-green-400">
        <CheckCircle2 className="size-3" /> AAA ✓
      </span>
    );
  }
  return (
    <span className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400 hover:bg-amber-500/20 transition-colors"
      >
        <AlertTriangle className="size-3" /> AAA ⚠ {percent}%
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-20 w-72 rounded-xl border border-slate-700 bg-slate-900 p-3 shadow-xl text-xs">
          <p className="font-semibold text-slate-200 mb-2">AAA issues:</p>
          <ul className="space-y-1 list-disc pl-4 text-slate-400">
            {issues.map((issue, i) => <li key={i}>{issue}</li>)}
          </ul>
          <button onClick={() => setOpen(false)} className="mt-2 text-[10px] text-slate-500 hover:text-slate-300">Dismiss</button>
        </div>
      )}
    </span>
  );
}

interface Props {
  code: string;
  language: Language;
  sessionId: string | null;
  pseudocode: string;
  userStory?: string;
  riskLevel?: string;
  highRiskFunctions?: string[];
  structuredFiles?: { path: string; content: string }[];
  unitTestFiles: TestFile[];
  unitGenerating: boolean;
  unitCoverage: number;
  isDemoMode?: boolean;
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

export function Step4GenerateUnitTests({
  code, language, sessionId, pseudocode,
  userStory, riskLevel, highRiskFunctions, structuredFiles,
  unitTestFiles, unitGenerating, unitCoverage,
  isDemoMode,
  onGenerate, onProceed,
}: Props) {
  const started = useRef(false);
  const [activeFile, setActiveFile] = useState(0);

  useEffect(() => {
    if (!started.current && unitTestFiles.length === 0 && !unitGenerating && sessionId) {
      started.current = true;
      onGenerate(code, language, sessionId, pseudocode, userStory, riskLevel, highRiskFunctions, structuredFiles);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && unitTestFiles.length > 0) {
      const t = setTimeout(() => onProceed(), 2000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, unitTestFiles.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const monacoLang = language === "csharp" ? "csharp" : language === "cpp" ? "cpp" : language === "java" ? "java" : language === "python" ? "python" : "typescript";

  return (
    <div className="flex flex-col gap-5">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Generate Unit Tests</h2>
        </div>
        <p className="text-sm text-slate-500">
          Isolated test cases for individual functions, methods, and classes — covering positive,
          negative, boundary, exception, and edge scenarios.
        </p>
      </div>

      {unitGenerating && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 rounded-xl border border-slate-700 bg-slate-900/40">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <div className="relative flex size-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/30">
              <Loader2 className="size-7 animate-spin text-blue-400" />
            </div>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-300">Generating unit tests…</p>
            <p className="text-xs text-slate-500 mt-1">AI is writing isolated test cases for each function</p>
          </div>
        </div>
      )}

      {!unitGenerating && unitTestFiles.length > 0 && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Test Files", value: String(unitTestFiles.length), color: "text-blue-400" },
              { label: "Unit Coverage", value: `~${unitCoverage}%`, color: "text-green-400" },
              { label: "Test Type", value: "Unit", color: "text-slate-200" },
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
              <BarChart3 className="size-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Unit Test Coverage Areas</h3>
            </div>
            {[
              { label: "Positive Scenarios", desc: "Happy path and valid inputs" },
              { label: "Negative Scenarios", desc: "Invalid inputs and rejection cases" },
              { label: "Boundary Conditions", desc: "N-1, N, N+1 boundary value analysis" },
              { label: "Exception Handling", desc: "Error conditions and exception types" },
              { label: "Edge Cases", desc: "Null, empty, overflow, underflow" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5 text-green-400 shrink-0" />
                <span className="text-xs font-medium text-slate-300">{item.label}</span>
                <span className="text-xs text-slate-500">— {item.desc}</span>
              </div>
            ))}
          </div>

          {/* AAA compliance summary for single-file case */}
          {unitTestFiles.length === 1 && unitTestFiles[0].language === "python" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">AAA compliance:</span>
              <AAABadge
                compliant={unitTestFiles[0].aaa_compliant ?? true}
                percent={unitTestFiles[0].aaa_compliance_percent ?? 100}
                issues={unitTestFiles[0].aaa_issues ?? []}
              />
            </div>
          )}

          {/* File tabs + editor */}
          <div className="rounded-xl border border-slate-700 bg-slate-950 overflow-hidden">
            {unitTestFiles.length > 1 && (
              <div className="flex border-b border-slate-700 overflow-x-auto">
                {unitTestFiles.map((f, i) => (
                  <button
                    key={f.filename}
                    onClick={() => setActiveFile(i)}
                    className={cn(
                      "shrink-0 flex items-center gap-2 px-3 py-2 text-xs font-mono transition-colors",
                      i === activeFile
                        ? "bg-slate-800 text-slate-100 border-b-2 border-blue-500"
                        : "text-slate-500 hover:text-slate-300",
                    )}
                  >
                    <Code2 className="size-3" />
                    {f.filename}
                    {f.language === "python" && (
                      <AAABadge
                        compliant={f.aaa_compliant ?? true}
                        percent={f.aaa_compliance_percent ?? 100}
                        issues={f.aaa_issues ?? []}
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
            {unitTestFiles[activeFile] && (
              <div className="h-64">
                <MonacoEditor
                  height="100%"
                  language={monacoLang}
                  value={unitTestFiles[activeFile].code}
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
              className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
            >
              Generate Integration Tests
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </>
      )}

      {!unitGenerating && unitTestFiles.length === 0 && !sessionId && (
        <div className="text-center py-12 text-slate-500 text-sm">
          Complete the previous steps to generate unit tests.
        </div>
      )}
    </div>
  );
}
