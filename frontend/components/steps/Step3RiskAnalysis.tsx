"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight, AlertTriangle, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskResult } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

interface Props {
  code: string;
  language: Language;
  sessionId: string | null;
  userStory?: string;
  riskResult: RiskResult | null;
  riskLoading: boolean;
  isDemoMode?: boolean;
  onRunRisk: (code: string, lang: Language, sessionId: string | null, story?: string) => void;
  onProceed: () => void;
}

function RiskGauge({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 70 ? "#EF4444" : score >= 40 ? "#F59E0B" : "#10B981";

  return (
    <div className="flex items-center justify-center">
      <div className="relative flex items-center justify-center">
        <svg width="120" height="120" viewBox="0 0 100 100" className="-rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#1E293B" strokeWidth="8" />
          <circle
            cx="50" cy="50" r="40"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1.2s ease-out, stroke 0.3s" }}
          />
        </svg>
        <div className="absolute text-center">
          <div className="text-2xl font-bold text-white tabular-nums">{score}</div>
          <div className="text-[10px] text-slate-500 uppercase tracking-wide">/ 100</div>
        </div>
      </div>
    </div>
  );
}

const RISK_CONFIG = {
  high:   { label: "HIGH RISK",   className: "bg-red-500/10 border-red-500/30 text-red-400",    strategy: "Unit + Integration + Edge + Negative + Security + Mutation + Business Rules" },
  medium: { label: "MEDIUM RISK", className: "bg-amber-500/10 border-amber-500/30 text-amber-400", strategy: "Unit + Integration + Edge Cases" },
  low:    { label: "LOW RISK",    className: "bg-green-500/10 border-green-500/30 text-green-400", strategy: "Unit + Smoke Tests" },
};

const SCORE_FACTORS = [
  { key: "complexity_score" as keyof RiskResult,            label: "Complexity",            weight: "×0.20", color: "bg-blue-500" },
  { key: "business_impact_score" as keyof RiskResult,       label: "Business Impact",       weight: "×0.25", color: "bg-orange-500" },
  { key: "dependency_depth_score" as keyof RiskResult,      label: "Dependency Depth",      weight: "×0.15", color: "bg-purple-500" },
  { key: "coverage_gap_score" as keyof RiskResult,          label: "Coverage Gap",          weight: "×0.20", color: "bg-red-500" },
  { key: "security_sensitivity_score" as keyof RiskResult,  label: "Security Sensitivity",  weight: "×0.20", color: "bg-rose-500" },
];

export function Step3RiskAnalysis({
  code, language, sessionId, userStory,
  riskResult, riskLoading, isDemoMode,
  onRunRisk, onProceed,
}: Props) {
  useEffect(() => {
    if (!riskResult && !riskLoading) {
      onRunRisk(code, language, sessionId, userStory);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && riskResult) {
      const t = setTimeout(() => onProceed(), 2000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, riskResult]); // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = riskResult ? RISK_CONFIG[riskResult.risk_level as keyof typeof RISK_CONFIG] ?? RISK_CONFIG.medium : null;

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto pr-1 animate-fade-in-up">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Risk Analysis & Scoring</h2>
        <p className="text-sm text-slate-500">
          Score = (Complexity × 0.20) + (Business Impact × 0.25) + (Dependency Depth × 0.15) + (Coverage Gap × 0.20) + (Security × 0.20)
        </p>
      </div>

      {riskLoading && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-orange-500/20 animate-ping" />
            <div className="relative flex size-16 items-center justify-center rounded-full bg-orange-500/10 border border-orange-500/30">
              <ShieldAlert className="size-7 text-orange-400 animate-pulse" />
            </div>
          </div>
          <p className="text-sm text-slate-400">Calculating risk score…</p>
        </div>
      )}

      {riskResult && cfg && (
        <>
          {/* Main risk display */}
          <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <RiskGauge score={riskResult.risk_score} />
              <div className="flex-1 space-y-3 text-center sm:text-left">
                <span className={cn("inline-block rounded-full border px-4 py-1.5 text-sm font-bold tracking-wide", cfg.className)}>
                  {cfg.label}
                </span>
                <p className="text-sm text-slate-300 leading-relaxed">{riskResult.human_readable_reason}</p>
                <div className={cn("rounded-lg border px-3 py-2", cfg.className)}>
                  <p className="text-xs font-semibold mb-1">Recommended Testing Strategy:</p>
                  <p className="text-xs">{cfg.strategy}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Score factors */}
          <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Risk Factor Breakdown</h3>
            <div className="space-y-3">
              {SCORE_FACTORS.map(({ key, label, weight, color }) => {
                const val = riskResult[key] as number;
                return (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">
                        {label}
                        <span className="ml-1.5 text-slate-600">{weight}</span>
                      </span>
                      <span className="font-semibold tabular-nums text-slate-200">{val}/100</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-700">
                      <div
                        className={cn("h-full rounded-full transition-all duration-700", color)}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Risk factors list */}
          {riskResult.risk_factors.length > 0 && (
            <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-200">Risk Factors</h3>
              <ul className="space-y-2">
                {riskResult.risk_factors.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-400">
                    <AlertTriangle className="size-3.5 text-amber-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* High-risk functions */}
          {riskResult.high_risk_functions.length > 0 && (
            <div className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
              <h3 className="text-sm font-semibold text-red-400">High-Risk Functions</h3>
              <div className="flex flex-wrap gap-2">
                {riskResult.high_risk_functions.map((fn) => (
                  <span key={fn} className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs font-mono text-red-300">
                    {fn}()
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Actions */}
      {riskResult && cfg && (
        <div className="shrink-0 pt-2 flex justify-end">
          <Button
            onClick={onProceed}
            className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20"
          >
            Proceed with {cfg.label} Strategy
            <ChevronRight className="size-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
