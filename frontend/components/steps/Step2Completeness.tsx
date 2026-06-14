"use client";

import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, ChevronRight, Edit3, Zap } from "lucide-react";
import type { CompletenessResult } from "@/lib/backendApi";

interface Props {
  loading: boolean;
  loadingMessage: string;
  completeness: CompletenessResult | null;
  selectedSuggestion: number | null;
  isDemoMode?: boolean;
  onSelectSuggestion: (idx: number) => void;
  onAcceptSuggestion: (suggestion: string) => void;
  onContinueAnyway: () => void;
  onEditCode: () => void;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 70 ? "bg-green-500" : score >= 50 ? "bg-yellow-500" : "bg-red-500";
  const textColor = score >= 70 ? "text-green-400" : score >= 50 ? "text-yellow-400" : "text-red-400";
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-3">
        <span className={cn("text-6xl font-bold tabular-nums leading-none", textColor)}>{score}</span>
        <span className="text-zinc-500 text-sm mb-1">/100</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-zinc-800 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${score}%` }}
        />
      </div>
      <p className="text-xs text-zinc-500">
        {score >= 70 ? "✓ Code is ready for test generation" : score >= 50 ? "⚠ Code has some gaps — review suggestions" : "✗ Code is significantly incomplete"}
      </p>
    </div>
  );
}

export function Step2Completeness({
  loading, loadingMessage, completeness,
  selectedSuggestion, isDemoMode,
  onSelectSuggestion,
  onAcceptSuggestion, onContinueAnyway, onEditCode,
}: Props) {
  useEffect(() => {
    if (isDemoMode && completeness && !loading) {
      const t = setTimeout(() => onContinueAnyway(), 1500);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, completeness, loading]); // eslint-disable-line react-hooks/exhaustive-deps
  // Loading state
  if (loading || !completeness) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
          <div className="relative flex size-16 items-center justify-center rounded-full bg-blue-500/10 border border-blue-500/30">
            <Loader2 className="size-7 animate-spin text-blue-400" />
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-base font-medium text-zinc-200">{loadingMessage || "Analyzing code structure…"}</p>
          <p className="text-sm text-zinc-500">Checking completeness, missing elements, and code quality</p>
        </div>
        <div className="flex gap-1.5">
          {["Parsing", "Evaluating", "Scoring"].map((s, i) => (
            <span key={i} className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-500 animate-pulse" style={{ animationDelay: `${i * 200}ms` }}>
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  }

  const { completeness_score: score, is_complete, missing_elements, suggestions } = completeness;
  const needsSuggestions = score < 70 && suggestions && suggestions.length > 0;

  return (
    <div className="flex flex-col h-full gap-6 overflow-y-auto pr-1">
      {/* Header */}
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Code Completeness Analysis</h2>
        <p className="text-sm text-zinc-500">Review the analysis before proceeding to test generation.</p>
      </div>

      {/* Score */}
      <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
        <div className="flex items-start gap-4">
          <div className={cn("mt-1 flex size-9 shrink-0 items-center justify-center rounded-lg", is_complete ? "bg-green-500/15" : "bg-yellow-500/15")}>
            {is_complete
              ? <CheckCircle2 className="size-5 text-green-400" />
              : <AlertTriangle className="size-5 text-yellow-400" />
            }
          </div>
          <div className="flex-1 min-w-0">
            <ScoreBar score={score} />
          </div>
        </div>
      </div>

      {/* Missing elements */}
      {missing_elements.length > 0 && (
        <div className="shrink-0 rounded-xl border border-zinc-800 bg-zinc-900/30 p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Missing Elements</h3>
          <ul className="space-y-2">
            {missing_elements.map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-zinc-300">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-yellow-500/80" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {needsSuggestions && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="size-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-zinc-200">AI Completion Suggestions</h3>
            <span className="text-xs text-zinc-500">— select one to apply</span>
          </div>
          <div className="grid gap-3">
            {suggestions!.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelectSuggestion(i)}
                className={cn(
                  "w-full text-left rounded-xl border p-4 transition-all",
                  selectedSuggestion === i
                    ? "border-blue-500/60 bg-blue-500/10 ring-1 ring-blue-500/30"
                    : "border-zinc-800 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70",
                )}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={cn("size-2 rounded-full", selectedSuggestion === i ? "bg-blue-400" : "bg-zinc-600")} />
                  <span className="text-xs font-medium text-zinc-400">Suggestion {i + 1}</span>
                  {selectedSuggestion === i && <span className="ml-auto text-xs text-blue-400 font-medium">Selected</span>}
                </div>
                <pre className="text-xs text-zinc-300 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">{s}</pre>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="shrink-0 mt-auto pt-4 border-t border-zinc-800 flex flex-wrap gap-3">
        <Button
          variant="outline"
          onClick={onEditCode}
          className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Edit3 className="size-4 mr-1.5" /> Edit Code
        </Button>

        {needsSuggestions ? (
          <>
            <Button
              onClick={() => onAcceptSuggestion(suggestions![selectedSuggestion!])}
              disabled={selectedSuggestion === null}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 disabled:opacity-40"
            >
              <Zap className="size-4 mr-1.5" /> Accept Suggestion
            </Button>
            <Button
              variant="outline"
              onClick={onContinueAnyway}
              className="border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              Continue Anyway <ChevronRight className="size-4 ml-1" />
            </Button>
          </>
        ) : (
          <Button
            onClick={onContinueAnyway}
            className="bg-blue-600 hover:bg-blue-500 text-white border-0"
          >
            Continue to Pseudocode <ChevronRight className="size-4 ml-1" />
          </Button>
        )}
      </div>
    </div>
  );
}
