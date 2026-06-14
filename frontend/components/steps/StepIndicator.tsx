"use client";

import { cn } from "@/lib/utils";
import type { Step } from "@/hooks/useAnalysis";
import { Check } from "lucide-react";

const STEPS: { label: string; short: string; emoji: string }[] = [
  { label: "Input Ingestion",        short: "Ingest",   emoji: "📥" },
  { label: "Code Understanding",     short: "Analyze",  emoji: "🔍" },
  { label: "Risk Analysis",          short: "Risk",     emoji: "⚠️" },
  { label: "Test Scenarios",         short: "Generate", emoji: "🧪" },
  { label: "Traceability Map",       short: "Trace",    emoji: "🔗" },
  { label: "Sandbox Execution",      short: "Execute",  emoji: "🐳" },
  { label: "Validation & Export",    short: "Report",   emoji: "📊" },
];

interface Props {
  currentStep: Step;
  onGoToStep: (step: Step) => void;
}

export function StepIndicator({ currentStep, onGoToStep }: Props) {
  return (
    <nav className="w-full px-4 py-3 border-b border-slate-700/60 bg-[#0F172A]/80 backdrop-blur">
      <ol className="flex items-center justify-between max-w-5xl mx-auto">
        {STEPS.map((s, i) => {
          const stepNum = (i + 1) as Step;
          const done = stepNum < currentStep;
          const active = stepNum === currentStep;
          const clickable = stepNum < currentStep;

          return (
            <li key={i} className="flex items-center flex-1">
              <button
                onClick={() => clickable && onGoToStep(stepNum)}
                disabled={!clickable}
                className={cn(
                  "flex flex-col items-center gap-1 group transition-opacity",
                  clickable ? "cursor-pointer hover:opacity-80" : "cursor-default",
                )}
              >
                <div
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full text-xs font-semibold border-2 transition-all",
                    done   && "bg-blue-600 border-blue-600 text-white",
                    active && "bg-transparent border-blue-500 text-blue-400 ring-2 ring-blue-500/30",
                    !done && !active && "bg-transparent border-slate-700 text-slate-600",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : <span className="hidden sm:block">{s.emoji}</span>}
                  <span className="block sm:hidden text-[10px]">{stepNum}</span>
                </div>
                <span className={cn(
                  "hidden sm:block text-[10px] font-medium leading-none",
                  active ? "text-blue-400" : done ? "text-slate-400" : "text-slate-600",
                )}>
                  {s.short}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <div className="flex-1 mx-1 h-px">
                  <div className={cn(
                    "h-full transition-colors",
                    stepNum < currentStep
                      ? "bg-gradient-to-r from-blue-600 to-blue-500"
                      : "bg-slate-700",
                  )} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
