/* eslint-disable @typescript-eslint/no-unused-expressions */
"use client";

import { useState } from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Button } from "@/components/ui/button";
import { Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type TestType = "unit" | "integration";
export type Priority = "high" | "medium" | "low";

export interface TestScenario {
  id: string;
  name: string;
  type: TestType;
  priority: Priority;
  description: string;
}

export interface ScenarioSelectorProps {
  scenarios: TestScenario[];
  onGenerate: (selectedIds: string[], maxTests: number) => void;
  isGenerating?: boolean;
}

const TYPE_STYLES: Record<TestType, string> = {
  unit: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  integration: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
};

const PRIORITY_STYLES: Record<Priority, string> = {
  high: "border-red-500/30 bg-red-500/10 text-red-400",
  medium: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  low: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

export default function ScenarioSelector({
  scenarios,
  onGenerate,
  isGenerating = false,
}: ScenarioSelectorProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(scenarios.map((s) => s.id))
  );
  const [maxTests, setMaxTests] = useState(10);

  const allSelected = selectedIds.size === scenarios.length;
  const noneSelected = selectedIds.size === 0;

  function toggleScenario(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(scenarios.map((s) => s.id)));
    }
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-200">Test Scenarios</h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {selectedIds.size} of {scenarios.length} selected
          </p>
        </div>
        <button
          onClick={toggleAll}
          className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      {/* Scenario cards */}
      {scenarios.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-600">No scenarios available.</p>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {scenarios.map((scenario) => {
            const isSelected = selectedIds.has(scenario.id);
            return (
              <button
                key={scenario.id}
                onClick={() => toggleScenario(scenario.id)}
                className={cn(
                  "group flex flex-col gap-2.5 rounded-lg border p-3.5 text-left transition-all",
                  isSelected
                    ? "border-blue-500/50 bg-blue-500/5 ring-1 ring-blue-500/20"
                    : "border-zinc-700/60 bg-zinc-800/40 hover:border-zinc-600 hover:bg-zinc-800/70"
                )}
              >
                {/* Top row: checkbox + badges */}
                <div className="flex items-center justify-between gap-2">
                  {/* Custom checkbox */}
                  <span
                    className={cn(
                      "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
                      isSelected
                        ? "border-blue-500 bg-blue-500"
                        : "border-zinc-600 bg-zinc-800"
                    )}
                    aria-hidden
                  >
                    {isSelected && (
                      <svg className="size-2.5 text-white" viewBox="0 0 10 8" fill="none">
                        <path
                          d="M1 4L3.5 6.5L9 1"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <Badge className={TYPE_STYLES[scenario.type]}>
                      {scenario.type}
                    </Badge>
                    <Badge className={PRIORITY_STYLES[scenario.priority]}>
                      {scenario.priority}
                    </Badge>
                  </div>
                </div>

                {/* Name + description */}
                <div>
                  <p className="text-sm font-medium text-zinc-200 leading-snug">{scenario.name}</p>
                  <p className="mt-1 text-xs text-zinc-500 leading-relaxed line-clamp-2">
                    {scenario.description}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Max test count slider */}
      <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-zinc-400">Max test count</label>
          <span className="tabular-nums text-sm font-semibold text-zinc-200">{maxTests}</span>
        </div>
        <SliderPrimitive.Root
          className="relative flex h-5 w-full touch-none select-none items-center"
          value={[maxTests]}
          onValueChange={([v]) => setMaxTests(v)}
          min={1}
          max={50}
          step={1}
          aria-label="Max test count"
        >
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-zinc-700">
            <SliderPrimitive.Range className="absolute h-full rounded-full bg-blue-500" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block size-4 rounded-full border-2 border-blue-500 bg-zinc-900 shadow-md ring-offset-zinc-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2" />
        </SliderPrimitive.Root>
        <div className="flex justify-between text-[10px] text-zinc-600">
          <span>1</span>
          <span>50</span>
        </div>
      </div>

      {/* Generate Tests button */}
      <Button
        onClick={() => onGenerate(Array.from(selectedIds), maxTests)}
        disabled={isGenerating || noneSelected}
        size="lg"
        className="w-full bg-blue-600 text-white hover:bg-blue-500 border-0 shadow-md shadow-blue-600/20 transition-colors disabled:opacity-40"
      >
        {isGenerating ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Play className="size-4" />
        )}
        Generate Tests
      </Button>
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        className
      )}
    >
      {children}
    </span>
  );
}
