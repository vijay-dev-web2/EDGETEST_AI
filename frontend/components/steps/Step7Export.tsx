"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, FileText, Loader2, CheckCircle2, RotateCcw, FlaskConical, Beaker, AlertTriangle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile, RiskResult, SandboxResult } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";
import {
  exportWorkflowYaml,
  pushToGitHub,
  downloadReportPdf,
  exportXlsx,
  exportJson,
  exportDocx,
} from "@/lib/backendApi";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.807 5.625-5.48 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const GRADE_COLORS: Record<string, string> = {
  A: "text-green-400 bg-green-500/15 border-green-500/30",
  B: "text-blue-400 bg-blue-500/15 border-blue-500/30",
  C: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  D: "text-red-400 bg-red-500/15 border-red-500/30",
};

const RISK_BADGE: Record<string, string> = {
  high:   "border-red-500/30 bg-red-500/10 text-red-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  low:    "border-green-500/30 bg-green-500/10 text-green-400",
};

function computeGrade(passed: number, total: number): "A" | "B" | "C" | "D" {
  if (total === 0) return "D";
  const pct = (passed / total) * 100;
  if (pct >= 90) return "A";
  if (pct >= 70) return "B";
  if (pct >= 50) return "C";
  return "D";
}

interface Props {
  sessionId: string | null;
  language: Language;
  unitTestFiles: TestFile[];
  integrationTestFiles: TestFile[];
  unitSandboxResult: SandboxResult | null;
  integrationSandboxResult: SandboxResult | null;
  riskResult?: RiskResult | null;
  onReset: () => void;
  // Legacy props (accepted but unit/integration used preferentially)
  generatedFiles?: TestFile[];
  sandboxPassed?: number;
  sandboxFailed?: number;
  sandboxTotal?: number;
  qualityGrade?: "A" | "B" | "C" | "D";
  coverageGate?: {
    passed: boolean;
    blocked: boolean;
    threshold_enabled: boolean;
    unit_coverage: number;
    integration_coverage?: number | null;
    threshold: number;
    reasons: string[];
    recommendation?: string | null;
  } | null;
}

export function Step7Export({
  sessionId, language,
  unitTestFiles, integrationTestFiles,
  unitSandboxResult, integrationSandboxResult,
  riskResult, coverageGate, onReset,
}: Props) {
  const [repoInput, setRepoInput] = useState("");
  const [pushStatus, setPushStatus] = useState<"idle" | "loading" | "ok" | "error">("idle");
  const [pushMsg, setPushMsg] = useState("");
  const [downloading, setDownloading] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [overrideGate, setOverrideGate] = useState(false);
  const [showOverrideConfirm, setShowOverrideConfirm] = useState(false);

  const gateBlocked = coverageGate?.blocked && !overrideGate;

  async function dl(key: string, fn: () => Promise<Blob>, filename: string) {
    setDownloading((p) => ({ ...p, [key]: true }));
    setErrors((p) => ({ ...p, [key]: "" }));
    try {
      const blob = await fn();
      downloadBlob(blob, filename);
    } catch (e) {
      setErrors((p) => ({ ...p, [key]: e instanceof Error ? e.message : "Download failed" }));
    } finally {
      setDownloading((p) => ({ ...p, [key]: false }));
    }
  }

  async function handlePushToGitHub() {
    if (!sessionId || !repoInput.trim()) return;
    setPushStatus("loading");
    try {
      const result = await pushToGitHub(sessionId, repoInput.trim());
      setPushStatus("ok");
      setPushMsg(result.path);
    } catch (e) {
      setPushStatus("error");
      setPushMsg(e instanceof Error ? e.message : "Push failed");
    }
  }

  const unitPassed = unitSandboxResult?.passed ?? 0;
  const unitTotal = unitSandboxResult?.total ?? 0;
  const unitPassRate = unitTotal > 0 ? Math.round((unitPassed / unitTotal) * 100) : null;
  const unitGrade = unitSandboxResult ? computeGrade(unitPassed, unitTotal) : null;

  const integPassed = integrationSandboxResult?.passed ?? 0;
  const integTotal = integrationSandboxResult?.total ?? 0;
  const integPassRate = integTotal > 0 ? Math.round((integPassed / integTotal) * 100) : null;
  const integGrade = integrationSandboxResult ? computeGrade(integPassed, integTotal) : null;

  const allFiles = [...unitTestFiles, ...integrationTestFiles];
  const sid8 = sessionId?.slice(0, 8) ?? "unknown";
  const sandboxTotal = unitTotal + integTotal;

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto pr-1">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Report & Export</h2>
        <p className="text-sm text-slate-500">Complete test results with separate unit and integration summaries.</p>
      </div>

      {/* Coverage gate banner */}
      {coverageGate && !coverageGate.passed && (
        <div className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/5 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-red-400 shrink-0" />
            <span className="text-sm font-semibold text-red-300">Coverage gate failed</span>
          </div>
          {coverageGate.reasons.map((r, i) => (
            <p key={i} className="text-xs text-red-400">{r}</p>
          ))}
          {coverageGate.recommendation && (
            <p className="text-xs text-red-400/70 italic">{coverageGate.recommendation}</p>
          )}
          {!overrideGate && (
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowOverrideConfirm(true)}
                className="border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs"
              >
                Download Anyway
              </Button>
            </div>
          )}
          {showOverrideConfirm && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
              <p className="text-xs text-amber-300">
                Exporting with coverage below threshold. This will fail your CI pipeline. Continue?
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => { setOverrideGate(true); setShowOverrideConfirm(false); }}
                  className="bg-amber-600 hover:bg-amber-500 text-white border-0 text-xs">
                  Yes, export anyway
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowOverrideConfirm(false)}
                  className="border-slate-700 text-slate-300 hover:bg-slate-800 text-xs">
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Coverage gate passed banner */}
      {coverageGate?.passed && (
        <div className="shrink-0 rounded-xl border border-green-500/20 bg-green-500/5 p-3 flex items-center gap-2">
          <ShieldCheck className="size-4 text-green-400" />
          <span className="text-sm text-green-300">
            Coverage gate passed — {coverageGate.unit_coverage}% ≥ {coverageGate.threshold}% threshold
          </span>
        </div>
      )}

      {/* Coverage metric card */}
      {coverageGate && (
        <div className={cn(
          "shrink-0 rounded-xl border p-4",
          coverageGate.passed ? "border-green-500/20 bg-green-500/5" : "border-red-500/20 bg-red-500/5",
        )}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="text-center">
              <p className={cn("text-2xl font-bold", coverageGate.passed ? "text-green-400" : "text-red-400")}>
                {coverageGate.unit_coverage.toFixed(1)}%
              </p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Unit Coverage</p>
              <p className="text-[10px] text-slate-600 mt-0.5">threshold: {coverageGate.threshold}%</p>
            </div>
            {coverageGate.integration_coverage != null && (
              <div className="text-center">
                <p className={cn("text-2xl font-bold", coverageGate.integration_coverage >= coverageGate.threshold ? "text-green-400" : "text-red-400")}>
                  {coverageGate.integration_coverage.toFixed(1)}%
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Integration Coverage</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Risk summary */}
      {riskResult && (
        <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-4 flex items-center gap-4">
          <div className="text-center">
            <p className="text-2xl font-bold text-white">{riskResult.risk_score}</p>
            <p className="text-xs text-slate-500">Risk Score</p>
          </div>
          <div className="h-10 w-px bg-slate-700" />
          <span className={cn("rounded-full border px-3 py-1 text-sm font-semibold", RISK_BADGE[riskResult.risk_level] ?? RISK_BADGE.low)}>
            {riskResult.risk_level.toUpperCase()} RISK
          </span>
          <div className="ml-auto text-xs text-slate-500">{riskResult.human_readable_reason?.slice(0, 80)}{riskResult.human_readable_reason && riskResult.human_readable_reason.length > 80 ? "…" : ""}</div>
        </div>
      )}

      {/* Unit Test Summary */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">Unit Test Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
            <p className="text-xl font-bold text-blue-400">{unitTestFiles.length}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Unit Files Generated</p>
          </div>
          {unitGrade && (
            <div className={cn("rounded-xl border p-3 text-center", GRADE_COLORS[unitGrade])}>
              <p className="text-xl font-bold">{unitGrade}</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5">Unit Grade</p>
            </div>
          )}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
            <p className="text-xl font-bold text-green-400">{unitPassed}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Unit Tests Passed</p>
          </div>
          {unitPassRate !== null && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className={cn("text-xl font-bold", unitPassRate === 100 ? "text-green-400" : unitPassRate >= 70 ? "text-amber-400" : "text-red-400")}>
                {unitPassRate}%
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Unit Pass Rate</p>
            </div>
          )}
          {unitTotal === 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center col-span-2">
              <p className="text-xs text-slate-500">Unit tests not yet executed</p>
            </div>
          )}
        </div>
      </div>

      {/* Integration Test Summary */}
      <div className="shrink-0 space-y-2">
        <div className="flex items-center gap-2">
          <Beaker className="size-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-slate-200">Integration Test Summary</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
            <p className="text-xl font-bold text-purple-400">{integrationTestFiles.length}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Integration Files Generated</p>
          </div>
          {integGrade && (
            <div className={cn("rounded-xl border p-3 text-center", GRADE_COLORS[integGrade])}>
              <p className="text-xl font-bold">{integGrade}</p>
              <p className="text-[10px] uppercase tracking-wider mt-0.5">Integration Grade</p>
            </div>
          )}
          <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
            <p className="text-xl font-bold text-green-400">{integPassed}</p>
            <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Integration Tests Passed</p>
          </div>
          {integPassRate !== null && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center">
              <p className={cn("text-xl font-bold", integPassRate === 100 ? "text-green-400" : integPassRate >= 70 ? "text-amber-400" : "text-red-400")}>
                {integPassRate}%
              </p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Integration Pass Rate</p>
            </div>
          )}
          {integTotal === 0 && (
            <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-3 text-center col-span-2">
              <p className="text-xs text-slate-500">Integration tests not yet executed</p>
            </div>
          )}
        </div>
      </div>

      {/* Export grid */}
      <div className="shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* PDF Report */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <FileText className="size-4 text-slate-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">PDF Report</h3>
              <p className="text-xs text-slate-500">Unit + Integration results with traceability</p>
            </div>
          </div>
          <Button
            onClick={() => dl("pdf", () => downloadReportPdf(sessionId!), `edgetest-report-${sid8}.pdf`)}
            disabled={!sessionId || downloading.pdf || sandboxTotal === 0 || !!gateBlocked}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 disabled:opacity-40"
          >
            {downloading.pdf ? <><Loader2 className="size-4 animate-spin mr-1.5" />Generating…</> : <><FileText className="size-4 mr-1.5" />Download PDF{gateBlocked ? " (threshold not met)" : ""}</>}
          </Button>
          {sandboxTotal === 0 && !gateBlocked && <p className="text-xs text-slate-600">Run tests first to enable PDF.</p>}
          {gateBlocked && <p className="text-xs text-red-400">Coverage gate blocked — use "Download Anyway" above to override.</p>}
          {errors.pdf && <p className="text-xs text-red-400">{errors.pdf}</p>}
        </div>

        {/* XLSX Spreadsheet */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <span className="text-xs font-bold text-green-400">XLS</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">XLSX Spreadsheet</h3>
              <p className="text-xs text-slate-500">Unit & Integration results in Excel</p>
            </div>
          </div>
          <Button
            onClick={() => dl("xlsx", () => exportXlsx(sessionId!), `edgetest-results-${sid8}.xlsx`)}
            disabled={!sessionId || downloading.xlsx}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border-0 disabled:opacity-40"
          >
            {downloading.xlsx ? <><Loader2 className="size-4 animate-spin mr-1.5" />Downloading…</> : <><Download className="size-4 mr-1.5" />Download XLSX</>}
          </Button>
          {errors.xlsx && <p className="text-xs text-red-400">{errors.xlsx}</p>}
        </div>

        {/* JSON Export */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <span className="text-xs font-bold text-yellow-400">{"{}"}</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">JSON Export</h3>
              <p className="text-xs text-slate-500">Unit + Integration results with traceability</p>
            </div>
          </div>
          <Button
            onClick={() => dl("json", () => exportJson(sessionId!), `edgetest-results-${sid8}.json`)}
            disabled={!sessionId || downloading.json}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border-0 disabled:opacity-40"
          >
            {downloading.json ? <><Loader2 className="size-4 animate-spin mr-1.5" />Downloading…</> : <><Download className="size-4 mr-1.5" />Download JSON</>}
          </Button>
          {errors.json && <p className="text-xs text-red-400">{errors.json}</p>}
        </div>

        {/* DOCX Documentation */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <span className="text-xs font-bold text-blue-300">DOC</span>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">DOCX Documentation</h3>
              <p className="text-xs text-slate-500">Full test documentation in Word format</p>
            </div>
          </div>
          <Button
            onClick={() => dl("docx", () => exportDocx(sessionId!), `edgetest-docs-${sid8}.docx`)}
            disabled={!sessionId || downloading.docx}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border-0 disabled:opacity-40"
          >
            {downloading.docx ? <><Loader2 className="size-4 animate-spin mr-1.5" />Downloading…</> : <><Download className="size-4 mr-1.5" />Download DOCX</>}
          </Button>
          {errors.docx && <p className="text-xs text-red-400">{errors.docx}</p>}
        </div>

        {/* GitHub Actions YAML */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <Download className="size-4 text-slate-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">GitHub Actions YAML</h3>
              <p className="text-xs text-slate-500">CI/CD workflow for automated runs</p>
            </div>
          </div>
          <Button
            onClick={() => dl("yaml", () => exportWorkflowYaml(sessionId!, language, allFiles.map((f) => f.filename)), `edgetest-workflow-${sid8}.yml`)}
            disabled={!sessionId || downloading.yaml || allFiles.length === 0}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border-0 disabled:opacity-40"
          >
            {downloading.yaml ? <><Loader2 className="size-4 animate-spin mr-1.5" />Downloading…</> : <><Download className="size-4 mr-1.5" />Download YAML</>}
          </Button>
          {errors.yaml && <p className="text-xs text-red-400">{errors.yaml}</p>}
        </div>

        {/* Push to GitHub */}
        <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-5 space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-slate-700">
              <GithubIcon className="size-4 text-slate-300" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Push to GitHub</h3>
              <p className="text-xs text-slate-500">Commit workflow directly to repo</p>
            </div>
          </div>
          <input
            type="text"
            placeholder="owner/repository"
            value={repoInput}
            onChange={(e) => { setRepoInput(e.target.value); setPushStatus("idle"); }}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
          <Button
            onClick={handlePushToGitHub}
            disabled={!sessionId || !repoInput.trim() || pushStatus === "loading"}
            className="w-full bg-slate-700 hover:bg-slate-600 text-slate-100 border-0 disabled:opacity-40"
          >
            {pushStatus === "loading" ? <Loader2 className="size-4 animate-spin mr-1.5" /> : <GithubIcon className="size-4 mr-1.5" />}
            Push Workflow
          </Button>
          {pushStatus === "ok" && <p className="flex items-center gap-1 text-xs text-green-400"><CheckCircle2 className="size-3" />Pushed to {pushMsg}</p>}
          {pushStatus === "error" && <p className="text-xs text-red-400">{pushMsg}</p>}
        </div>
      </div>

      {/* Start new analysis */}
      <div className="shrink-0 pt-2 flex justify-center">
        <Button
          variant="outline"
          onClick={onReset}
          className="border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-100 gap-2"
        >
          <RotateCcw className="size-4" />
          Start New Analysis
        </Button>
      </div>
    </div>
  );
}
