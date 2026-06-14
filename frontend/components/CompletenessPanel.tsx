"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ChevronRight, Loader2, Plus } from "lucide-react";

export interface Suggestion {
  id: string;
  title: string;
  description: string;
}

export interface CompletenessPanelProps {
  score: number; // 0–100
  suggestions?: Suggestion[];
  onSuggestionApply?: (suggestion: Suggestion) => void;
  onApprove: () => void;
  isApproving?: boolean;
}

function scoreLabel(score: number) {
  if (score >= 85) return { text: "Excellent", color: "text-emerald-400" };
  if (score >= 70) return { text: "Good", color: "text-lime-400" };
  if (score >= 40) return { text: "Needs Work", color: "text-amber-400" };
  return { text: "Incomplete", color: "text-red-400" };
}

function scoreBarColor(score: number) {
  if (score >= 70) return "bg-emerald-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-red-500";
}

export default function CompletenessPanel({
  score,
  suggestions = [],
  onSuggestionApply,
  onApprove,
  isApproving = false,
}: CompletenessPanelProps) {
  const clamped = Math.min(100, Math.max(0, score));
  const label = scoreLabel(clamped);
  const showSuggestions = clamped < 70 && suggestions.length > 0;

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Code Completeness</h2>
        <span className={cn("text-2xl font-bold tabular-nums", label.color)}>
          {clamped}
          <span className="ml-0.5 text-sm font-normal text-zinc-500">/100</span>
        </span>
      </div>

      {/* Score bar */}
      <div className="space-y-2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-700 ease-out",
              scoreBarColor(clamped)
            )}
            style={{ width: `${clamped}%` }}
          />
        </div>
        <p className={cn("text-xs font-medium", label.color)}>{label.text}</p>
      </div>

      {/* Suggestion cards */}
      {showSuggestions && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            Suggestions to improve score
          </p>
          <div className="flex flex-col gap-2">
            {suggestions.slice(0, 3).map((s) => (
              <button
                key={s.id}
                onClick={() => onSuggestionApply?.(s)}
                className={cn(
                  "group flex items-start gap-3 rounded-lg border border-zinc-700/60 bg-zinc-800/60 p-3 text-left",
                  "transition-colors hover:border-blue-500/50 hover:bg-zinc-800"
                )}
              >
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border border-zinc-600 bg-zinc-700 transition-colors group-hover:border-blue-500 group-hover:bg-blue-500/20">
                  <Plus className="size-3 text-zinc-400 group-hover:text-blue-400" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-zinc-200">{s.title}</p>
                  <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{s.description}</p>
                </div>
                <ChevronRight className="mt-0.5 size-4 shrink-0 text-zinc-600 transition-colors group-hover:text-blue-400" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Approve button */}
      <Button
        onClick={onApprove}
        disabled={isApproving}
        className="mt-1 w-full bg-emerald-600 text-white hover:bg-emerald-500 border-0 shadow-md shadow-emerald-600/20 transition-colors disabled:opacity-50"
        size="lg"
      >
        {isApproving ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <CheckCircle2 className="size-4" />
        )}
        Approve &amp; Continue
      </Button>
    </div>
  );
}
