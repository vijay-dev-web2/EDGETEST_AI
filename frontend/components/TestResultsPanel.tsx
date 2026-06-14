/* eslint-disable @typescript-eslint/no-unused-expressions */
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  id: string;
  name: string;
  status: TestStatus;
  duration?: number; // milliseconds
  error?: string;
  traceback?: string;
}

export interface TestResultsPanelProps {
  results: TestResult[];
  onDownloadYaml: () => void;
  onDownloadPdf: () => void;
}

const STATUS_META: Record<
  TestStatus,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  passed: {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    label: "Passed",
  },
  failed: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/10",
    label: "Failed",
  },
  skipped: {
    icon: MinusCircle,
    color: "text-zinc-500",
    bg: "bg-zinc-700/30",
    label: "Skipped",
  },
};

export default function TestResultsPanel({
  results,
  onDownloadYaml,
  onDownloadPdf,
}: TestResultsPanelProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const total = results.length;
  const passed = results.filter((r) => r.status === "passed").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = total - passed - failed;

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <h2 className="text-sm font-semibold text-zinc-200">Test Results</h2>

      {/* Summary bar */}
      <div className="grid grid-cols-4 divide-x divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        <SummaryCell label="Total" value={total} valueClass="text-zinc-200" />
        <SummaryCell label="Passed" value={passed} valueClass="text-emerald-400" />
        <SummaryCell label="Failed" value={failed} valueClass="text-red-400" />
        <SummaryCell label="Skipped" value={skipped} valueClass="text-zinc-500" />
      </div>

      {/* Results table */}
      {results.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-600">No test results yet.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/80">
                <th className="py-2.5 pl-4 pr-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 w-10">
                  Status
                </th>
                <th className="py-2.5 px-3 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Test Name
                </th>
                <th className="py-2.5 px-3 text-right text-xs font-medium uppercase tracking-wider text-zinc-500 w-24">
                  Duration
                </th>
                <th className="py-2.5 pl-3 pr-4 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {results.map((result) => {
                const meta = STATUS_META[result.status];
                const Icon = meta.icon;
                const isExpanded = expandedIds.has(result.id);
                const hasDetails = result.status === "failed" && (result.error || result.traceback);

                return (
                  <>
                    <tr
                      key={result.id}
                      className={cn(
                        "group transition-colors",
                        hasDetails
                          ? "cursor-pointer hover:bg-zinc-800/40"
                          : "hover:bg-zinc-800/20"
                      )}
                      onClick={hasDetails ? () => toggleExpand(result.id) : undefined}
                    >
                      {/* Status icon */}
                      <td className="py-3 pl-4 pr-2">
                        <span className={cn("inline-flex rounded-full p-1", meta.bg)}>
                          <Icon className={cn("size-3.5", meta.color)} />
                        </span>
                      </td>

                      {/* Test name */}
                      <td className="py-3 px-3">
                        <span
                          className={cn(
                            "font-mono text-xs",
                            result.status === "failed"
                              ? "text-zinc-200"
                              : result.status === "passed"
                              ? "text-zinc-300"
                              : "text-zinc-600"
                          )}
                        >
                          {result.name}
                        </span>
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-3 text-right">
                        <span className="text-xs tabular-nums text-zinc-600">
                          {result.duration != null
                            ? result.duration < 1000
                              ? `${result.duration}ms`
                              : `${(result.duration / 1000).toFixed(2)}s`
                            : "—"}
                        </span>
                      </td>

                      {/* Expand toggle */}
                      <td className="py-3 pl-3 pr-4">
                        {hasDetails && (
                          <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">
                            {isExpanded ? (
                              <ChevronUp className="size-4" />
                            ) : (
                              <ChevronDown className="size-4" />
                            )}
                          </span>
                        )}
                      </td>
                    </tr>

                    {/* Expandable detail row */}
                    {isExpanded && hasDetails && (
                      <tr key={`${result.id}-detail`} className="bg-zinc-950/60">
                        <td colSpan={4} className="px-4 py-3">
                          <div className="space-y-2">
                            {result.error && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-red-400">
                                  Error
                                </p>
                                <p className="font-mono text-xs text-red-300 leading-relaxed">
                                  {result.error}
                                </p>
                              </div>
                            )}
                            {result.traceback && (
                              <div className="space-y-1">
                                <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                                  Traceback
                                </p>
                                <pre className="overflow-x-auto rounded-md bg-zinc-900 p-3 font-mono text-xs text-zinc-400 leading-relaxed whitespace-pre-wrap break-words border border-zinc-800">
                                  {result.traceback}
                                </pre>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Download buttons */}
      <div className="flex gap-3">
        <Button
          onClick={onDownloadYaml}
          variant="outline"
          size="lg"
          className="flex-1 border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <Download className="size-4" />
          GitHub Actions YAML
        </Button>
        <Button
          onClick={onDownloadPdf}
          variant="outline"
          size="lg"
          className="flex-1 border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <FileText className="size-4" />
          PDF Report
        </Button>
      </div>
    </div>
  );
}

function SummaryCell({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: number;
  valueClass: string;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 py-3">
      <span className={cn("text-xl font-bold tabular-nums", valueClass)}>{value}</span>
      <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-600">{label}</span>
    </div>
  );
}
