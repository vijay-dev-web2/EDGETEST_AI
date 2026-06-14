"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, ChevronRight, CheckCircle2, Map, FlaskConical, Beaker } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TraceabilityData, TestCategory } from "@/lib/backendApi";

import type { Language } from "@/hooks/useAnalysis";

interface Props {
  code: string;
  language: Language;
  sessionId: string | null;
  userStory?: string;
  categories: TestCategory[];
  selectedCategoryNames: string[];
  traceabilityData: TraceabilityData | null;
  unitTraceabilityData?: TraceabilityData | null;
  integrationTraceabilityData?: TraceabilityData | null;
  traceabilityLoading: boolean;
  riskHighFunctions?: string[];
  isDemoMode?: boolean;
  onRunTraceability: (
    code: string,
    lang: Language,
    categories: TestCategory[],
    sessionId: string | null,
    story?: string,
    hrfs?: string[],
  ) => void;
  onProceed: () => void;
}

const RISK_BADGE: Record<string, string> = {
  high:   "bg-red-500/10 text-red-400 border-red-500/30",
  medium: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  low:    "bg-green-500/10 text-green-400 border-green-500/30",
};

function TraceabilitySection({
  title, icon: Icon, iconClass, data,
}: {
  title: string;
  icon: React.ElementType;
  iconClass: string;
  data: TraceabilityData;
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 overflow-hidden">
      <div className="p-4 border-b border-slate-700 flex items-center gap-2">
        <Icon className={cn("size-4", iconClass)} />
        <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
        <span className="ml-auto text-xs text-slate-500">{data.matrix.length} entries</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 border-b border-slate-700/50">
        {[
          { label: "Function Coverage", value: `${data.function_coverage_pct}%`, color: "text-blue-400" },
          { label: "Req. Coverage", value: `${data.requirement_coverage_pct}%`, color: "text-green-400" },
          { label: "High-Risk Covered", value: `${data.high_risk_covered}/${data.high_risk_total}`, color: "text-amber-400" },
          { label: "Tests Mapped", value: String(data.matrix.length), color: "text-slate-200" },
        ].map((m) => (
          <div key={m.label} className="text-center">
            <p className={cn("text-lg font-bold tabular-nums", m.color)}>{m.value}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{m.label}</p>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto max-h-64 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-900">
            <tr>
              <th className="text-left px-4 py-2.5 text-slate-400 font-medium min-w-[180px]">Test Category</th>
              <th className="text-left px-4 py-2.5 text-slate-400 font-medium">Risk</th>
              <th className="text-left px-4 py-2.5 text-slate-400 font-medium min-w-[180px]">Covers Functions / Modules</th>
              <th className="text-left px-4 py-2.5 text-slate-400 font-medium min-w-[180px]">Requirements</th>
            </tr>
          </thead>
          <tbody>
            {data.matrix.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-slate-800/30" : "bg-transparent"}>
                <td className="px-4 py-2.5 font-mono text-slate-300">{row.category_name}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold", RISK_BADGE[row.risk_level] ?? RISK_BADGE.low)}>
                    {row.risk_level}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.covers_functions.map((fn) => (
                      <span key={fn} className="rounded border border-slate-700 bg-slate-900/60 px-1.5 py-0.5 font-mono text-slate-300">
                        {fn}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {row.covers_requirements.length > 0
                      ? row.covers_requirements.map((r) => (
                          <span key={r} className="rounded border border-blue-500/30 bg-blue-500/10 px-1.5 py-0.5 text-blue-300">
                            {r}
                          </span>
                        ))
                      : <span className="text-slate-600">—</span>
                    }
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Step5TraceabilityMap({
  code, language, sessionId, userStory,
  categories, selectedCategoryNames,
  traceabilityData, unitTraceabilityData, integrationTraceabilityData,
  traceabilityLoading,
  riskHighFunctions, isDemoMode,
  onRunTraceability, onProceed,
}: Props) {
  const selectedCategories = categories.filter((c) => selectedCategoryNames.includes(c.name));

  useEffect(() => {
    if (!traceabilityData && !traceabilityLoading) {
      const cats = selectedCategories.length > 0 ? selectedCategories : categories;
      if (cats.length > 0) {
        onRunTraceability(code, language, cats, sessionId, userStory, riskHighFunctions);
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && traceabilityData) {
      const t = setTimeout(() => onProceed(), 2000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, traceabilityData]); // eslint-disable-line react-hooks/exhaustive-deps

  const canProceed = traceabilityData !== null;

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto pr-1">
      <div className="shrink-0 space-y-1">
        <div className="flex items-center gap-2">
          <Map className="size-5 text-blue-400" />
          <h2 className="text-lg font-semibold text-slate-100">Traceability Map</h2>
        </div>
        <p className="text-sm text-slate-500">
          Unit tests mapped to functions/methods. Integration tests mapped to workflows/modules.
        </p>
      </div>

      {traceabilityLoading && (
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
            <div className="relative flex size-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/30">
              <Loader2 className="size-7 animate-spin text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-slate-400">Building traceability matrix…</p>
        </div>
      )}

      {traceabilityData && (
        <>
          {/* Unit traceability */}
          {unitTraceabilityData && unitTraceabilityData.matrix.length > 0 && (
            <TraceabilitySection
              title="Unit Test Traceability — Functions & Methods"
              icon={FlaskConical}
              iconClass="text-blue-400"
              data={unitTraceabilityData}
            />
          )}

          {/* Integration traceability */}
          {integrationTraceabilityData && integrationTraceabilityData.matrix.length > 0 && (
            <TraceabilitySection
              title="Integration Test Traceability — Workflows & Modules"
              icon={Beaker}
              iconClass="text-purple-400"
              data={integrationTraceabilityData}
            />
          )}

          {/* Fallback: combined traceability if no split data */}
          {(!unitTraceabilityData && !integrationTraceabilityData) && (
            <TraceabilitySection
              title="Traceability Matrix"
              icon={Map}
              iconClass="text-blue-400"
              data={traceabilityData}
            />
          )}
        </>
      )}

      <div className="shrink-0 pt-2 flex items-center justify-end gap-4">
        <Button
          onClick={onProceed}
          disabled={!canProceed}
          className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20 disabled:opacity-40"
        >
          <CheckCircle2 className="size-4 mr-1.5" />
          Execute Unit Tests
          <ChevronRight className="size-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
