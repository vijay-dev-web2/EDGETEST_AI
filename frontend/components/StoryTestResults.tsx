"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Download, Plus, CheckCircle2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StoryTestCase {
  name: string;
  category: string;
  given: string;
  when: string;
  then: string;
  test_code: string;
}

export interface StoryTestData {
  test_file_name: string;
  story_summary: string;
  test_cases: StoryTestCase[];
  suggested_mocks: string[];
  implementation_notes: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Positive:  "bg-green-500/10 text-green-400 border-green-500/30",
  Negative:  "bg-red-500/10 text-red-400 border-red-500/30",
  Boundary:  "bg-amber-500/10 text-amber-400 border-amber-500/30",
  Exception: "bg-orange-500/10 text-orange-400 border-orange-500/30",
  Edge:      "bg-purple-500/10 text-purple-400 border-purple-500/30",
};

function GwtRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="shrink-0 w-12 font-bold text-slate-500 uppercase tracking-wider pt-0.5">{label}</span>
      <span className="text-slate-300 leading-relaxed">{text}</span>
    </div>
  );
}

function TestCaseCard({ tc, index }: { tc: StoryTestCase; index: number }) {
  const [open, setOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const colorClass = CATEGORY_COLORS[tc.category] ?? "bg-slate-500/10 text-slate-400 border-slate-500/30";

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-800/50 transition-colors"
      >
        <span className="shrink-0 w-6 text-xs font-mono text-slate-600">{String(index + 1).padStart(2, "0")}</span>
        <span className="flex-1 text-sm font-mono text-slate-200 truncate">{tc.name}</span>
        <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold", colorClass)}>
          {tc.category}
        </span>
        {open
          ? <ChevronDown className="size-4 text-slate-500 shrink-0" />
          : <ChevronRight className="size-4 text-slate-500 shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-slate-700 p-4 space-y-3">
          <div className="space-y-2 rounded-lg bg-slate-800/40 p-3 border border-slate-700/50">
            <GwtRow label="Given" text={tc.given} />
            <GwtRow label="When" text={tc.when} />
            <GwtRow label="Then" text={tc.then} />
          </div>

          <button
            onClick={() => setShowCode((v) => !v)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            {showCode ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            {showCode ? "Hide" : "Show"} test code
          </button>

          {showCode && (
            <pre className="rounded-lg bg-[#0a0f1a] border border-slate-700 p-3 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap leading-relaxed">
              {tc.test_code}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

interface Props {
  data: StoryTestData;
  onAddToPipeline: (combinedCode: string, filename: string) => void;
}

export function StoryTestResults({ data, onAddToPipeline }: Props) {
  const combinedCode = data.test_cases.map((tc) => tc.test_code).join("\n\n");

  const handleDownload = () => {
    const blob = new Blob([combinedCode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = data.test_file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categoryCount = data.test_cases.reduce<Record<string, number>>((acc, tc) => {
    acc[tc.category] = (acc[tc.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Header */}
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-blue-400" />
          <h3 className="text-sm font-semibold text-slate-200">{data.test_file_name}</h3>
          <span className="ml-auto text-xs text-slate-500">{data.test_cases.length} test cases</span>
        </div>
        <p className="text-xs text-slate-400">{data.story_summary}</p>

        {/* Category breakdown */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {Object.entries(categoryCount).map(([cat, count]) => (
            <span
              key={cat}
              className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", CATEGORY_COLORS[cat] ?? "bg-slate-500/10 text-slate-400 border-slate-500/30")}
            >
              {cat} × {count}
            </span>
          ))}
        </div>
      </div>

      {/* Test cases */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
        {data.test_cases.map((tc, i) => (
          <TestCaseCard key={tc.name} tc={tc} index={i} />
        ))}
      </div>

      {/* Mocks */}
      {data.suggested_mocks.length > 0 && (
        <div className="rounded-lg border border-slate-700/60 bg-slate-800/30 px-4 py-3 space-y-1.5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Suggested Mocks</p>
          <div className="flex flex-wrap gap-1.5">
            {data.suggested_mocks.map((m) => (
              <span key={m} className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-mono text-slate-300">{m}</span>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {data.implementation_notes && (
        <p className="text-xs text-slate-500 italic border-l-2 border-slate-700 pl-3">{data.implementation_notes}</p>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="outline"
          size="sm"
          onClick={handleDownload}
          className="border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
        >
          <Download className="size-3.5" />
          Download {data.test_file_name}
        </Button>
        <Button
          size="sm"
          onClick={() => onAddToPipeline(combinedCode, data.test_file_name)}
          className="bg-blue-600 hover:bg-blue-500 text-white border-0 gap-1.5"
        >
          <Plus className="size-3.5" />
          Add to Pipeline
        </Button>
      </div>
    </div>
  );
}
