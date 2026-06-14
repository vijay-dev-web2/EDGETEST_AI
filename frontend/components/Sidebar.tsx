"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import {
  Check, Lock, BarChart3, LogOut, ShieldAlert,
  Download, Map, FlaskConical, Microscope, FileSearch, Layers,
  Beaker, Play, TestTube2, Ban,
} from "lucide-react";
import type { Step, Language } from "@/hooks/useAnalysis";
import type {
  CompletenessResult, RiskResult, TraceabilityData, SandboxResult, TestFile,
} from "@/lib/backendApi";

// ── Step metadata ────────────────────────────────────────────────────────────

const STEPS: {
  label: string;
  description: string;
  Icon: React.ElementType;
}[] = [
  { label: "Ingest Code",              description: "Paste, GitHub, or user story",       Icon: Layers },
  { label: "Analyze & Understand",     description: "Completeness + pseudocode",          Icon: FileSearch },
  { label: "Risk Scoring",             description: "AI-powered risk assessment",         Icon: ShieldAlert },
  { label: "Generate Unit Tests",      description: "Isolated function-level tests",      Icon: FlaskConical },
  { label: "Generate Integration Tests", description: "Workflow & module-level tests",    Icon: Beaker },
  { label: "Traceability Map",         description: "Functions ↔ requirements",           Icon: Map },
  { label: "Execute Unit Tests",       description: "Docker-isolated unit test run",      Icon: Microscope },
  { label: "Execute Integration Tests", description: "Docker-isolated integration run",   Icon: Play },
  { label: "Report & Export",          description: "XLSX, DOCX, JSON, CI/CD",            Icon: Download },
];

// ── Step summary helpers ─────────────────────────────────────────────────────

function stepSummary(
  step: number,
  {
    code, language, completeness, riskResult,
    unitTestFiles, integrationTestFiles,
    unitCoverage, integrationCoverage,
    traceabilityData,
    unitSandboxResult, integrationSandboxResult,
  }: Partial<SidebarProps>,
): string | null {
  switch (step) {
    case 1: {
      if (!code) return null;
      const lines = code.split("\n").length;
      return `${language ?? "code"} · ${lines} lines`;
    }
    case 2: {
      if (!completeness) return null;
      return `Score: ${completeness.completeness_score}% · ${completeness.is_complete ? "Complete" : "Incomplete"}`;
    }
    case 3: {
      if (!riskResult) return null;
      return `${riskResult.risk_level.toUpperCase()} RISK · ${riskResult.risk_score}/100`;
    }
    case 4: {
      const n = unitTestFiles?.length ?? 0;
      if (!n) return null;
      return `${n} file${n !== 1 ? "s" : ""} · ~${unitCoverage ?? 0}% coverage`;
    }
    case 5: {
      const n = integrationTestFiles?.length ?? 0;
      if (!n) return null;
      return `${n} file${n !== 1 ? "s" : ""} · ~${integrationCoverage ?? 0}% coverage`;
    }
    case 6: {
      if (!traceabilityData) return null;
      return `${traceabilityData.function_coverage_pct}% function coverage`;
    }
    case 7: {
      if (!unitSandboxResult) return null;
      const pct = unitSandboxResult.total > 0
        ? Math.round((unitSandboxResult.passed / unitSandboxResult.total) * 100)
        : 0;
      return `${unitSandboxResult.passed}/${unitSandboxResult.total} passed · ${pct}%`;
    }
    case 8: {
      if (!integrationSandboxResult) return null;
      const pct = integrationSandboxResult.total > 0
        ? Math.round((integrationSandboxResult.passed / integrationSandboxResult.total) * 100)
        : 0;
      return `${integrationSandboxResult.passed}/${integrationSandboxResult.total} passed · ${pct}%`;
    }
    default:
      return null;
  }
}

// ── Risk badge ───────────────────────────────────────────────────────────────

const RISK_BADGE = {
  high:   { label: "HIGH RISK",   cls: "border-red-500/40 bg-red-500/10 text-red-400" },
  medium: { label: "MEDIUM RISK", cls: "border-amber-500/40 bg-amber-500/10 text-amber-400" },
  low:    { label: "LOW RISK",    cls: "border-green-500/40 bg-green-500/10 text-green-400" },
};

// Helper to map step numbers to pipeline gates keys
function getGateKeyForStep(step: number): string | null {
  switch (step) {
    case 1: return "ingest";
    case 2: return "analyze";
    case 3: return "risk_score";
    case 4: return "generate_unit_tests";
    case 5: return "generate_integration_tests";
    case 6: return "traceability";
    case 7: return "execute_unit_tests";
    case 8: return "execute_integration_tests";
    case 9: return "report";
    default: return null;
  }
}

// ── Props ────────────────────────────────────────────────────────────────────

export interface SidebarProps {
  currentStep?: Step;
  code?: string;
  language?: Language;
  completeness?: CompletenessResult | null;
  riskResult?: RiskResult | null;
  unitTestFiles?: TestFile[];
  integrationTestFiles?: TestFile[];
  unitCoverage?: number;
  integrationCoverage?: number;
  traceabilityData?: TraceabilityData | null;
  unitSandboxResult?: SandboxResult | null;
  integrationSandboxResult?: SandboxResult | null;
  // Legacy (still accepted for backward compat)
  selectedCategoryNames?: string[];
  sandboxResult?: SandboxResult | null;
  isDemoMode?: boolean;
  pipelineGates?: Record<string, boolean> | null;
  onGoToStep?: (step: Step) => void;
  userName?: string | null;
  userImage?: string | null;
  onSignOut: () => void;
  activePage?: "dashboard" | "analytics";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({
  currentStep,
  code, language, completeness, riskResult,
  unitTestFiles, integrationTestFiles,
  unitCoverage, integrationCoverage,
  traceabilityData, unitSandboxResult, integrationSandboxResult,
  isDemoMode,
  pipelineGates,
  onGoToStep,
  userName, userImage,
  onSignOut,
  activePage = "dashboard",
}: SidebarProps) {
  const riskCfg = riskResult ? RISK_BADGE[riskResult.risk_level as keyof typeof RISK_BADGE] : null;

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "hidden md:flex flex-col shrink-0 h-screen sticky top-0",
          "w-[220px] border-r border-slate-800 bg-[#080F1A]",
          "overflow-y-auto",
        )}
      >
        {/* Logo */}
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/EDGETEST_AI_LOGO.png"
              alt="EdgeTest AI"
              className="size-8 shrink-0 object-contain"
            />
            <div>
              <span className="font-bold text-sm bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                EdgeTest AI
              </span>
              {isDemoMode && (
                <span className="ml-2 rounded-full border border-yellow-500/40 bg-yellow-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-400">
                  DEMO
                </span>
              )}
              <p className="text-[10px] text-slate-600 leading-tight">Risk-Aware Testing Agent</p>
            </div>
          </div>
          <div className="mt-4 h-px bg-slate-800" />
        </div>

        {/* Steps */}
        {currentStep !== undefined && onGoToStep && (
          <nav className="flex-1 px-3 pb-3 space-y-0.5">
            {STEPS.map((s, i) => {
              const stepNum = (i + 1) as Step;
              const gateKey = getGateKeyForStep(stepNum);
              const isSkipped = pipelineGates && gateKey ? pipelineGates[gateKey] === false : false;
              const done    = stepNum < currentStep;
              const active  = stepNum === currentStep;
              const clickable = done && !isDemoMode && !isSkipped;
              const summary = (done && !isSkipped) ? stepSummary(stepNum, {
                code, language, completeness, riskResult,
                unitTestFiles, integrationTestFiles,
                unitCoverage, integrationCoverage,
                traceabilityData, unitSandboxResult, integrationSandboxResult,
              }) : null;
              const Icon = s.Icon;

              return (
                <button
                  key={stepNum}
                  onClick={() => clickable && onGoToStep(stepNum)}
                  disabled={isSkipped || (!clickable && !active)}
                  className={cn(
                    "group w-full text-left rounded-lg px-3 py-2.5 transition-all duration-150",
                    isSkipped && "opacity-40 cursor-not-allowed border-l-2 border-transparent hover:bg-transparent",
                    !isSkipped && active && "bg-blue-600/15 border-l-2 border-blue-500",
                    !isSkipped && done && !active && "hover:bg-slate-800/60 border-l-2 border-green-500/60",
                    !isSkipped && !done && !active && "opacity-50 cursor-default border-l-2 border-transparent",
                  )}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Icon / state indicator */}
                    <div className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-md",
                      isSkipped && "bg-slate-900 border border-slate-800 text-slate-500",
                      !isSkipped && active && "bg-blue-600/30 text-blue-400",
                      !isSkipped && done && !active && "bg-green-600/20 text-green-400",
                      !isSkipped && !done && !active && "bg-slate-800 text-slate-600",
                    )}>
                      {isSkipped
                        ? <Ban className="size-3.5 text-slate-500" />
                        : done
                        ? <Check className="size-3.5" />
                        : active
                        ? <Icon className="size-3.5" />
                        : <Lock className="size-3" />
                      }
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={cn(
                            "text-[10px] font-semibold uppercase tracking-wider",
                            isSkipped && "text-slate-600 line-through",
                            !isSkipped && active && "text-slate-500",
                            !isSkipped && done && !active && "text-slate-600",
                            !isSkipped && !done && !active && "text-slate-700",
                          )}>
                            {String(stepNum).padStart(2, "0")}
                          </span>
                          <span className={cn(
                            "text-sm font-medium leading-tight truncate",
                            isSkipped && "text-slate-500 line-through",
                            !isSkipped && active && "text-white",
                            !isSkipped && done && !active && "text-slate-400",
                            !isSkipped && !done && !active && "text-slate-600",
                          )}>
                            {s.label}
                          </span>
                        </div>
                        {isSkipped && (
                          <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[8px] font-semibold text-slate-500 shrink-0">
                            Skipped
                          </span>
                        )}
                      </div>
                      {active && (
                        <p className="text-[10px] text-slate-600 mt-0.5 truncate">{s.description}</p>
                      )}
                      {summary && (
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{summary}</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </nav>
        )}

        {/* Spacer when no step nav */}
        {currentStep === undefined && <div className="flex-1" />}

        {/* Bottom section */}
        <div className="shrink-0 border-t border-slate-800 px-4 py-3 space-y-2">
          {/* Risk badge */}
          {riskCfg && (
            <div className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-semibold text-center",
              riskCfg.cls,
            )}>
              {riskCfg.label} · {riskResult!.risk_score}/100
            </div>
          )}

          {/* Analytics link */}
          <Link
            href="/dashboard/metrics"
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
              activePage === "analytics"
                ? "bg-slate-800 text-slate-200"
                : "text-slate-500 hover:bg-slate-800/60 hover:text-slate-300",
            )}
          >
            <BarChart3 className="size-4 shrink-0" />
            Analytics
          </Link>

          {/* User row */}
          <div className="flex items-center gap-2 rounded-lg px-3 py-2">
            {userImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={userImage} alt={userName ?? ""} className="size-6 rounded-full ring-1 ring-slate-700 shrink-0" />
            ) : (
              <div className="size-6 rounded-full bg-slate-700 shrink-0" />
            )}
            <span className="flex-1 text-xs text-slate-400 truncate">{userName ?? "User"}</span>
            <button
              onClick={onSignOut}
              title="Sign out"
              className="text-slate-600 hover:text-slate-400 transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────── */}
      {currentStep !== undefined && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-slate-800 bg-[#080F1A] px-2 pb-2">
          {STEPS.map((s, i) => {
            const stepNum = (i + 1) as Step;
            const gateKey = getGateKeyForStep(stepNum);
            const isSkipped = pipelineGates && gateKey ? pipelineGates[gateKey] === false : false;
            const done    = stepNum < (currentStep ?? 1);
            const active  = stepNum === (currentStep ?? 1);
            const Icon = s.Icon;
            return (
              <button
                key={stepNum}
                onClick={() => done && !isDemoMode && !isSkipped && onGoToStep?.(stepNum)}
                disabled={isSkipped}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 px-1.5 rounded-lg transition-colors min-w-0",
                  isSkipped && "text-slate-600 opacity-40 cursor-not-allowed pointer-events-none",
                  !isSkipped && active && "text-blue-400",
                  !isSkipped && done && !active && "text-green-500",
                  !isSkipped && !done && !active && "text-slate-700",
                )}
              >
                {isSkipped
                  ? <Ban className="size-4" />
                  : done
                  ? <Check className="size-4" />
                  : <Icon className="size-4" />
                }
                <span className="text-[8px] font-medium">{stepNum}</span>
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
