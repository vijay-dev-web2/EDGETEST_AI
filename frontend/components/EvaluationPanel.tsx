"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { TestFile, TestScenario, SandboxResult } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

// ── Counting helpers ──────────────────────────────────────────────────────────

function countTestFunctions(code: string, lang: Language): number {
  if (lang === "python") return (code.match(/\bdef test_/g) ?? []).length;
  return (code.match(/\b(?:it|test)\s*\(/g) ?? []).length;
}

function countSourceFunctions(code: string, lang: Language): number {
  if (lang === "python") return (code.match(/\bdef \w+/g) ?? []).length;
  return (
    (code.match(/\bfunction\s+\w+\s*\(/g) ?? []).length +
    (code.match(/\b(?:const|let|var)\s+\w+\s*=\s*(?:async\s*)?\(/g) ?? []).length +
    (code.match(/\b\w+\s*\([^)]*\)\s*(?::\s*\w+)?\s*\{/g) ?? []).length
  );
}

function countAssertions(code: string, lang: Language): number {
  if (lang === "python")
    return (
      (code.match(/\bassert\b/g) ?? []).length +
      (code.match(/\.assert[A-Z]/g) ?? []).length
    );
  return (code.match(/\bexpect\s*\(/g) ?? []).length;
}

// ── Grade helpers ─────────────────────────────────────────────────────────────

type Grade = "A" | "B" | "C" | "D";

function scoreToGrade(score: number): Grade {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

const GRADE_STYLES: Record<Grade, { ring: string; bg: string; text: string; label: string }> = {
  A: { ring: "ring-green-500/40",  bg: "bg-green-500/10",  text: "text-green-400",  label: "Excellent" },
  B: { ring: "ring-blue-500/40",   bg: "bg-blue-500/10",   text: "text-blue-400",   label: "Good" },
  C: { ring: "ring-yellow-500/40", bg: "bg-yellow-500/10", text: "text-yellow-400", label: "Fair" },
  D: { ring: "ring-red-500/40",    bg: "bg-red-500/10",    text: "text-red-400",    label: "Needs Work" },
};

// ── Sub-metric bar ────────────────────────────────────────────────────────────

function MetricBar({
  label, score, suffix = "%", description,
}: { label: string; score: number; suffix?: string; description: string }) {
  const color =
    score >= 80 ? "bg-green-500" : score >= 60 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <span className="text-xs font-mono font-bold text-zinc-200">
          {score}{suffix}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-800">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      <p className="text-[11px] text-zinc-600">{description}</p>
    </div>
  );
}

// ── Props & computation ───────────────────────────────────────────────────────

interface Props {
  code: string;
  language: Language;
  generatedFiles: TestFile[];
  scenarios: TestScenario[];
  selectedScenarioNames: string[];
  sandboxResult: SandboxResult | null;
}

export function EvaluationPanel({
  code, language, generatedFiles, scenarios, selectedScenarioNames, sandboxResult,
}: Props) {
  const metrics = useMemo(() => {
    const allTestCode = generatedFiles.map((f) => f.code).join("\n");

    const testFnCount = countTestFunctions(allTestCode, language);
    const sourceFnCount = countSourceFunctions(code, language);
    const coverageScore = sourceFnCount > 0
      ? Math.min(100, Math.round((testFnCount / sourceFnCount) * 100))
      : testFnCount > 0 ? 85 : 0;

    const totalEdge = scenarios.filter((s) => s.edge_case).length;
    const selectedEdge = scenarios.filter(
      (s) => s.edge_case && selectedScenarioNames.includes(s.name)
    ).length;
    const edgeCoverage = totalEdge > 0 ? Math.round((selectedEdge / totalEdge) * 100) : 100;

    const assertCount = countAssertions(allTestCode, language);
    const assertDensity = testFnCount > 0 ? Math.round((assertCount / testFnCount) * 10) / 10 : 0;
    const assertScore = Math.min(100, Math.round((Math.min(assertDensity, 5) / 5) * 100));

    const passScore =
      sandboxResult && sandboxResult.total > 0
        ? Math.round((sandboxResult.passed / sandboxResult.total) * 100)
        : 0;

    const overall = Math.round(
      coverageScore * 0.30 +
      edgeCoverage * 0.25 +
      assertScore * 0.25 +
      passScore * 0.20
    );
    const grade = scoreToGrade(overall);

    return { coverageScore, edgeCoverage, assertDensity, assertScore, passScore, overall, grade, testFnCount, assertCount };
  }, [code, language, generatedFiles, scenarios, selectedScenarioNames, sandboxResult]);

  const g = GRADE_STYLES[metrics.grade];

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-zinc-200">Test Quality Score</h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {metrics.testFnCount} test functions · {metrics.assertCount} assertions
          </p>
        </div>

        {/* Grade badge */}
        <div className={cn(
          "flex flex-col items-center justify-center size-16 rounded-xl ring-2 shrink-0",
          g.ring, g.bg,
        )}>
          <span className={cn("text-2xl font-black", g.text)}>{metrics.grade}</span>
          <span className={cn("text-[10px] font-medium", g.text)}>{g.label}</span>
        </div>
      </div>

      {/* Overall score bar */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Overall</span>
          <span className="text-sm font-bold text-zinc-200">{metrics.overall}/100</span>
        </div>
        <div className="h-2 w-full rounded-full bg-zinc-800">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-1000",
              metrics.overall >= 80 ? "bg-green-500" : metrics.overall >= 60 ? "bg-yellow-500" : "bg-red-500"
            )}
            style={{ width: `${metrics.overall}%` }}
          />
        </div>
      </div>

      <div className="border-t border-zinc-800" />

      {/* Sub-metrics */}
      <div className="grid gap-4 sm:grid-cols-2">
        <MetricBar
          label="Function Coverage"
          score={metrics.coverageScore}
          description={`${metrics.testFnCount} test functions for estimated ${Math.round(metrics.coverageScore === 0 ? 0 : metrics.testFnCount / Math.max(0.01, metrics.coverageScore / 100))} source functions`}
        />
        <MetricBar
          label="Edge Case Coverage"
          score={metrics.edgeCoverage}
          description={`${scenarios.filter(s => s.edge_case && selectedScenarioNames.includes(s.name)).length} / ${scenarios.filter(s => s.edge_case).length} edge scenarios selected`}
        />
        <MetricBar
          label="Assertion Density"
          score={metrics.assertScore}
          description={`${metrics.assertDensity.toFixed(1)} assertions per test (target: 3–5)`}
        />
        <MetricBar
          label="Sandbox Pass Rate"
          score={metrics.passScore}
          description={
            sandboxResult && sandboxResult.total > 0
              ? `${sandboxResult.passed} / ${sandboxResult.total} tests passing`
              : "Run the sandbox to include pass rate"
          }
        />
      </div>
    </div>
  );
}
