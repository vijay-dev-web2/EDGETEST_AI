"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckSquare, Square, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestCategory } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const TYPE_BADGE: Record<string, string> = {
  unit:          "bg-blue-500/15 text-blue-400 border-blue-500/30",
  integration:   "bg-purple-500/15 text-purple-400 border-purple-500/30",
  edge:          "bg-orange-500/15 text-orange-400 border-orange-500/30",
  negative:      "bg-red-500/15 text-red-400 border-red-500/30",
  business_rule: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  smoke:         "bg-green-500/15 text-green-400 border-green-500/30",
  security:      "bg-rose-500/15 text-rose-400 border-rose-500/30",
  mutation:      "bg-violet-500/15 text-violet-400 border-violet-500/30",
};

function CategoryCard({ category, selected, onToggle }: {
  category: TestCategory;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "w-full text-left rounded-xl border transition-all",
        selected
          ? "border-blue-500/50 bg-blue-500/8 ring-1 ring-blue-500/20"
          : "border-slate-700 bg-slate-900/40 hover:border-slate-600",
      )}
    >
      <button onClick={onToggle} className="w-full text-left p-3.5 group">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 shrink-0">
            {selected
              ? <CheckSquare className="size-4 text-blue-400" />
              : <Square className="size-4 text-slate-600 group-hover:text-slate-400" />
            }
          </div>
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-sm font-mono text-slate-200 font-medium truncate">{category.name}</span>
              <span className={cn("rounded-full border px-1.5 py-0.5 text-[10px] font-semibold shrink-0", TYPE_BADGE[category.type] ?? TYPE_BADGE.unit)}>
                {category.type.replace("_", " ")}
              </span>
              <span className="rounded-full border border-slate-600 bg-slate-800 text-[10px] px-1.5 py-0.5 text-slate-300 shrink-0">
                ~{category.estimated_count} test{category.estimated_count !== 1 ? "s" : ""}
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">{category.description}</p>
            {category.relevant_functions && category.relevant_functions.length > 0 && (
              <p className="text-[10px] text-slate-500 mt-1">
                <span className="font-semibold text-slate-400">Functions:</span> {category.relevant_functions.join(", ")}
              </p>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

interface Props {
  code: string;
  pseudocode: string;
  categories: TestCategory[];
  selectedCategoryNames: string[];
  categoriesLoading: boolean;
  loading: boolean;
  loadingMessage: string;
  language: Language;
  sessionId: string | null;
  userStory?: string;
  riskLevel?: string;
  highRiskFunctions?: string[];
  isDemoMode?: boolean;
  onStartDiscovery: (code: string, pseudocode: string, story?: string, riskLevel?: string, hrfs?: string[]) => void;
  onToggle: (name: string) => void;
  onProceedToTraceability: () => void;
}

export function Step4ScenarioSelection({
  code, pseudocode, categories, selectedCategoryNames,
  categoriesLoading, loading, loadingMessage,
  userStory, riskLevel, highRiskFunctions, isDemoMode,
  onStartDiscovery, onToggle,
  onProceedToTraceability,
}: Props) {
  const started = useRef(false);

  useEffect(() => {
    if (!started.current && categories.length === 0 && !categoriesLoading) {
      started.current = true;
      onStartDiscovery(code, pseudocode, userStory, riskLevel, highRiskFunctions);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isDemoMode && categories.length > 0 && !categoriesLoading && !loading && selectedCategoryNames.length > 0) {
      const t = setTimeout(() => onProceedToTraceability(), 1500);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, categories.length, categoriesLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = new Set(selectedCategoryNames);

  if (categoriesLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-indigo-500/20 animate-ping" />
          <div className="relative flex size-16 items-center justify-center rounded-full bg-indigo-500/10 border border-indigo-500/30">
            <Loader2 className="size-7 animate-spin text-indigo-400" />
          </div>
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-base font-medium text-slate-200">Analyzing Code for Test Categories…</p>
          {riskLevel && (
            <p className="text-sm text-slate-500">Optimizing for {riskLevel.toUpperCase()} RISK strategy</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-100">Possible Test Cases</h2>
          <p className="text-sm text-slate-500">
            {categories.length} categories found ·{" "}
            <span className="text-blue-400 font-medium">{selected.size} selected</span>
            {riskLevel && (
              <span className={cn(
                "ml-2 rounded-full border px-2 py-0.5 text-xs font-semibold",
                riskLevel === "high" ? "border-red-500/30 bg-red-500/10 text-red-400" :
                riskLevel === "medium" ? "border-amber-500/30 bg-amber-500/10 text-amber-400" :
                "border-green-500/30 bg-green-500/10 text-green-400",
              )}>
                {riskLevel.toUpperCase()} RISK
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((c) => (
            <CategoryCard
              key={c.name}
              category={c}
              selected={selected.has(c.name)}
              onToggle={() => onToggle(c.name)}
            />
          ))}
        </div>
      </div>

      <div className="shrink-0 pt-4 border-t border-slate-700 flex items-center justify-between gap-4">
        <p className="text-xs text-slate-500">
          Selected categories will be dynamically expanded into individual test cases during generation.
        </p>
        <Button
          onClick={onProceedToTraceability}
          disabled={loading || selectedCategoryNames.length === 0}
          className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20 disabled:opacity-40"
        >
          {loading
            ? <><Loader2 className="size-4 animate-spin mr-1.5" />{loadingMessage}</>
            : <>Build Traceability Map <ChevronRight className="size-4 ml-1" /></>
          }
        </Button>
      </div>
    </div>
  );
}
