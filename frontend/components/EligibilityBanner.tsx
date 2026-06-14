"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  Ban,
  Network,
  Code2,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import type { EligibilityReport } from "@/lib/backendApi";

interface Props {
  eligibility: EligibilityReport;
  onContinue: () => void;
}

const BOUNDARY_LABELS: Record<string, string> = {
  database: "Database",
  http: "HTTP Client",
  filesystem: "File System",
  queue: "Message Queue",
  service_to_service: "Service-to-Service",
  api_route: "API Route",
  cache: "Cache Layer",
  auth: "Auth Service",
};

const CATEGORY_COLORS: Record<string, string> = {
  positive: "border-green-500/30 bg-green-500/10 text-green-400",
  negative: "border-red-500/30 bg-red-500/10 text-red-400",
  boundary: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  exception: "border-purple-500/30 bg-purple-500/10 text-purple-400",
  edge: "border-cyan-500/30 bg-cyan-500/10 text-cyan-400",
};

export default function EligibilityBanner({ eligibility, onContinue }: Props) {
  const [expanded, setExpanded] = useState(false);
  const plan = eligibility.recommended_test_plan;

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-900/60 backdrop-blur-sm overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-700 bg-slate-950/40">
        <ShieldCheck className="size-5 text-blue-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-slate-100">Pipeline Eligibility Analysis</h3>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {eligibility.architecture_summary || "Source code architecture and framework pattern analysis completed."}
          </p>
        </div>
      </div>

      {/* User message */}
      <div className="px-5 py-4 border-b border-slate-700 bg-slate-900/20">
        <p className="text-xs text-slate-300 leading-relaxed">
          {eligibility.user_message}
        </p>
      </div>

      {/* Grid of Eligibility Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-5 border-b border-slate-700">
        {/* Unit Tests Card */}
        <div className={cn(
          "rounded-xl border p-4 space-y-2",
          eligibility.unit_test_eligible ? "border-green-500/20 bg-green-950/10" : "border-slate-800 bg-slate-950/20"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {eligibility.unit_test_eligible ? (
                <CheckCircle2 className="size-4.5 text-green-400" />
              ) : (
                <XCircle className="size-4.5 text-slate-500" />
              )}
              <span className="text-xs font-semibold text-slate-200">Unit Tests</span>
            </div>
            <span className={cn(
              "text-[9px] font-bold px-2 py-0.5 rounded-full border",
              eligibility.unit_test_eligible
                ? "border-green-500/40 bg-green-500/10 text-green-400"
                : "border-slate-700 bg-slate-800 text-slate-500"
            )}>
              {eligibility.unit_test_eligible ? "ENABLED" : "DISABLED"}
            </span>
          </div>
          <p className="text-xs text-slate-400">{eligibility.unit_test_reason}</p>
          {eligibility.unit_test_eligible && (
            <p className="text-[11px] text-slate-500">
              Estimated <strong className="text-slate-300">{plan?.unit_tests_to_generate ?? 0}</strong> tests across <strong className="text-slate-300">{eligibility.unit_test_targets?.length ?? 0}</strong> targets.
            </p>
          )}
        </div>

        {/* Integration Tests Card */}
        <div className={cn(
          "rounded-xl border p-4 space-y-2",
          eligibility.integration_test_eligible ? "border-purple-500/20 bg-purple-950/10" : "border-slate-800 bg-slate-950/20"
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {eligibility.integration_test_eligible ? (
                <CheckCircle2 className="size-4.5 text-purple-400" />
              ) : (
                <Ban className="size-4.5 text-slate-500" />
              )}
              <span className="text-xs font-semibold text-slate-200">Integration Tests</span>
            </div>
            <span className={cn(
              "text-[9px] font-bold px-2 py-0.5 rounded-full border",
              eligibility.integration_test_eligible
                ? "border-purple-500/40 bg-purple-500/10 text-purple-400"
                : "border-slate-700 bg-slate-800 text-slate-500"
            )}>
              {eligibility.integration_test_eligible ? "ENABLED" : "DISABLED"}
            </span>
          </div>
          <p className="text-xs text-slate-400">{eligibility.integration_test_reason}</p>
          {eligibility.integration_test_eligible ? (
            <p className="text-[11px] text-slate-500">
              Estimated <strong className="text-slate-300">{plan?.integration_tests_to_generate ?? 0}</strong> tests across <strong className="text-slate-300">{eligibility.integration_boundaries?.length ?? 0}</strong> boundaries.
            </p>
          ) : (
            <p className="text-[11px] text-slate-500 italic">
              Steps 5 and 8 will be automatically skipped.
            </p>
          )}
        </div>
      </div>

      {/* Expand/Collapse Button */}
      <div className="px-5 py-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors py-1.5 font-medium cursor-pointer"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide Details" : "Show Test Targets & Boundaries"}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-700 bg-slate-950/20 space-y-4">
          {/* Unit Test Targets */}
          {eligibility.unit_test_targets && eligibility.unit_test_targets.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Unit Test Targets</span>
              <div className="rounded-xl border border-slate-800 bg-slate-900/30 divide-y divide-slate-800/60 overflow-hidden">
                {eligibility.unit_test_targets.map((target, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3.5 py-2.5">
                    <Code2 className="size-4 text-blue-400 shrink-0" />
                    <span className="font-mono text-xs text-slate-300 flex-1 truncate">{target.name}</span>
                    <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded capitalize shrink-0">{target.type}</span>
                    <div className="flex gap-1 flex-wrap shrink-0">
                      {target.test_categories?.map(cat => (
                        <span key={cat} className={cn(
                          "text-[9px] font-semibold px-2 py-0.5 rounded-full border shrink-0",
                          CATEGORY_COLORS[cat] || "border-slate-700 bg-slate-800 text-slate-400"
                        )}>
                          {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Integration Boundaries */}
          {eligibility.integration_boundaries && eligibility.integration_boundaries.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Integration Boundaries</span>
              <div className="space-y-2">
                {eligibility.integration_boundaries.map((boundary, idx) => (
                  <div key={idx} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Network className="size-4 text-purple-400 shrink-0" />
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-300">
                        {BOUNDARY_LABELS[boundary.boundary_type] || boundary.boundary_type}
                      </span>
                      <span className="text-xs text-slate-300 font-medium">{boundary.description}</span>
                    </div>
                    <p className="text-xs text-slate-500 italic pl-6">
                      → Scenario: {boundary.test_scenario}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Steps */}
          {plan?.skipped_steps && plan.skipped_steps.length > 0 && (
            <div className="space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Automatically Skipped Steps</span>
              <div className="rounded-xl border border-red-500/10 bg-red-500/5 divide-y divide-red-500/10 overflow-hidden">
                {plan.skipped_steps.map((skipped, idx) => (
                  <div key={idx} className="flex items-start gap-3 px-3.5 py-2.5">
                    <Ban className="size-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-slate-200">{skipped.step}</p>
                      <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{skipped.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer / Continue Row */}
      <div className="flex flex-col sm:flex-row items-center gap-4 justify-between px-5 py-4 border-t border-slate-700 bg-slate-950/40">
        <div className="text-xs text-slate-500 text-center sm:text-left">
          Est. coverage: <strong className="text-slate-300">{plan?.estimated_coverage || "85%"}</strong>
          {" · "}
          <strong className="text-slate-300">{plan?.unit_tests_to_generate || 0}</strong> unit tests
          {eligibility.integration_test_eligible ? (
            <>
              {" · "}<strong className="text-slate-300">{plan?.integration_tests_to_generate || 0}</strong> integration tests
            </>
          ) : (
            " · integration tests skipped"
          )}
        </div>
        <Button
          onClick={onContinue}
          className="bg-blue-600 hover:bg-blue-500 text-white gap-2 shadow-lg shadow-blue-600/10 active:scale-95 transition-all text-xs font-semibold"
        >
          Continue to Risk Scoring
          <ArrowRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
