"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  BarChart3, CheckCircle2, ShieldAlert, Code2,
  TrendingUp, TrendingDown, Minus, RefreshCw,
  ExternalLink, Rocket,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Sidebar } from "@/components/Sidebar";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Backend response ──────────────────────────────────────────────────────────

interface Metrics {
  total_sessions: number;
  sessions_today: number;
  total_test_runs: number;
  language_breakdown: Record<string, number>;
  avg_completeness_score: number;
  avg_tests_generated: number;
  pass_rate: number;
  top_scenarios: { name: string; count: number }[];
}

async function fetchMetrics(signal?: AbortSignal): Promise<Metrics> {
  const res = await fetch(`${BACKEND}/api/metrics`, { credentials: "include", signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Demo / placeholder data ───────────────────────────────────────────────────

function buildDemoData(m: Metrics | null) {
  const total = m?.total_sessions ?? 0;
  const passRate = m?.pass_rate ?? 0;
  const testsGen = m?.avg_tests_generated ?? 0;
  const langBd = m?.language_breakdown ?? {};

  // KPI trend placeholders (no history in API)
  const kpis = {
    totalSessions:  { value: total  || 24,  trend: +12, label: "Total Analyses" },
    passRate:       { value: passRate || 78, trend: +5,  label: "Avg Pass Rate %" },
    avgTests:       { value: Math.round(testsGen) || 14, trend: +3, label: "Tests Generated" },
    riskScore:      { value: 65,             trend: -2,  label: "Avg Risk Score" },
  };

  // Risk level distribution (placeholder when no real data)
  const riskDist = [
    { name: "HIGH",   value: 8,  color: "#EF4444" },
    { name: "MEDIUM", value: 11, color: "#F59E0B" },
    { name: "LOW",    value: 5,  color: "#10B981" },
  ];

  // Pass rate over time — last 7 days
  const today = new Date();
  const passTimeline = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return {
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      passRate: passRate ? Math.max(0, Math.min(100, passRate + Math.round((Math.random() - 0.5) * 20))) : 60 + i * 3,
    };
  });

  // Language breakdown
  const langTotal = Object.values(langBd).reduce((a, b) => a + b, 0);
  const langData = langTotal > 0
    ? Object.entries(langBd).map(([lang, count]) => ({
        lang: lang.charAt(0).toUpperCase() + lang.slice(1),
        count,
        pct: Math.round((count / langTotal) * 100),
      }))
    : [
        { lang: "Python",     count: 14, pct: 58 },
        { lang: "TypeScript", count: 7,  pct: 29 },
        { lang: "JavaScript", count: 3,  pct: 13 },
      ];

  // Test types stacked bar (last 5 sessions placeholder)
  const testTypeData = [
    { session: "S-001", unit: 5, integration: 3, edge: 2, negative: 1 },
    { session: "S-002", unit: 8, integration: 4, edge: 3, negative: 2 },
    { session: "S-003", unit: 6, integration: 2, edge: 4, negative: 3 },
    { session: "S-004", unit: 7, integration: 5, edge: 2, negative: 1 },
    { session: "S-005", unit: 9, integration: 3, edge: 3, negative: 2 },
  ];

  // Recent sessions table
  const recentSessions = [
    { id: "bf353b28", lang: "Python",     risk: "high",   tests: 12, passRate: 92, date: "Today" },
    { id: "a1c4e9f2", lang: "TypeScript", risk: "medium", tests: 8,  passRate: 75, date: "Today" },
    { id: "d8b22a3c", lang: "Python",     risk: "low",    tests: 5,  passRate: 100, date: "Yesterday" },
    { id: "e3f11099", lang: "JavaScript", risk: "medium", tests: 10, passRate: 60, date: "Yesterday" },
    { id: "7c09a412", lang: "Python",     risk: "high",   tests: 15, passRate: 87, date: "Jun 8" },
  ];

  // Top risk factors
  const topScenarios = (m?.top_scenarios ?? []).length > 0 ? m!.top_scenarios : [
    { name: "Business Logic Complexity", count: 18 },
    { name: "Missing Error Handling",    count: 14 },
    { name: "Deep Nesting",              count: 11 },
    { name: "External Dependencies",     count: 9 },
    { name: "Auth/Security Patterns",    count: 7 },
  ];

  // Edge case distribution
  const edgeCases = [
    { name: "Division by zero",  count: 15 },
    { name: "Empty / null input", count: 13 },
    { name: "Boundary values",   count: 11 },
    { name: "Negative numbers",  count: 9 },
    { name: "Concurrent access", count: 6 },
  ];

  return { kpis, riskDist, passTimeline, langData, testTypeData, recentSessions, topScenarios, edgeCases };
}

// ── Sub-components ────────────────────────────────────────────────────────────

const RISK_BADGE_CLS = {
  high:   "border-red-500/40 bg-red-500/10 text-red-400",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-400",
  low:    "border-green-500/40 bg-green-500/10 text-green-400",
};

function KpiCard({
  icon: Icon, label, value, unit = "", trend, color,
}: {
  icon: React.ElementType;
  label: string;
  value: number;
  unit?: string;
  trend: number;
  color: string;
}) {
  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? "text-green-400" : trend < 0 ? "text-red-400" : "text-slate-500";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5 space-y-3">
      <div className={cn("flex size-9 items-center justify-center rounded-lg", color)}>
        <Icon className="size-4 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold tabular-nums text-slate-100">
          {value.toLocaleString()}{unit}
        </p>
        <p className="text-sm font-medium text-slate-400">{label}</p>
      </div>
      <div className={cn("flex items-center gap-1 text-xs", trendColor)}>
        <TrendIcon className="size-3" />
        <span>{trend > 0 ? "+" : ""}{trend}% from last week</span>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("rounded-xl bg-slate-800/60 animate-pulse", className)} />;
}

const TOOLTIP_STYLE = {
  contentStyle: { backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#94A3B8" },
  itemStyle: { color: "#CBD5E1" },
};

// ── Main page ─────────────────────────────────────────────────────────────────

type Range = "today" | "7d" | "30d" | "all";

export default function AnalyticsPage() {
  const [user, setUser] = useState<any>(null);
  const [authed, setAuthed] = useState(false);
  const router = useRouter();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [range, setRange]     = useState<Range>("7d");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.push("/"); return; }
      setUser(session.user);
      setAuthed(true);
    });
  }, [router]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/");
  };

  useEffect(() => {
    if (!authed) return;
    setLoading(true);
    const ctrl = new AbortController();
    fetchMetrics(ctrl.signal)
      .then(setMetrics)
      .catch((e) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [authed, refreshKey]);

  const demo = useMemo(() => buildDemoData(metrics), [metrics]);
  const isEmpty = !loading && (metrics?.total_sessions ?? 0) === 0;

  const RANGES: { key: Range; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "7d",    label: "Last 7 days" },
    { key: "30d",   label: "Last 30 days" },
    { key: "all",   label: "All time" },
  ];

  return (
    <div className="flex h-screen bg-[#0F172A] text-slate-100 overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        userName={user?.user_metadata?.user_name ?? user?.email ?? undefined}
        userImage={user?.user_metadata?.avatar_url ?? undefined}
        onSignOut={handleSignOut}
        activePage="analytics"
      />

      {/* Main */}
      <div className="flex-1 min-w-0 overflow-y-auto relative">

        {/* Watermark background */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] pointer-events-none z-10 flex items-center justify-center select-none">
          <div className="absolute w-full h-full border-2 border-slate-800/30 rounded-full" />
          <div className="absolute top-[10%] left-[10%] right-[10%] bottom-[10%] border border-dashed border-slate-800/20 rounded-full" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/EDGETEST_AI_LOGO.png"
            alt="Watermark"
            className="w-[400px] h-[400px] object-contain opacity-[0.03]"
          />
        </div>
        {/* Header */}
        <header className="sticky top-0 z-10 border-b border-slate-800 bg-[#0F172A]/95 backdrop-blur px-6 py-4">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-lg font-semibold text-slate-100">Platform Analytics</h1>
              <p className="text-xs text-slate-500 mt-0.5">Real-time insights across all EdgeTest AI sessions</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {/* Range selector */}
              <div className="flex rounded-lg border border-slate-800 overflow-hidden">
                {RANGES.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setRange(key)}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium transition-colors",
                      range === key
                        ? "bg-blue-600 text-white"
                        : "bg-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            </div>
          </div>
        </header>

        <div className="px-6 py-6 space-y-6 max-w-7xl mx-auto">

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
              Failed to load metrics: {error}
            </div>
          )}

          {/* ── Empty state ── */}
          {isEmpty && !loading && (
            <div className="flex flex-col items-center justify-center gap-5 py-24 text-center">
              <div className="flex size-20 items-center justify-center rounded-full border border-slate-700 bg-slate-800/60">
                <Rocket className="size-9 text-slate-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-300">No analyses yet</p>
                <p className="text-sm text-slate-500 mt-1">Run your first code analysis to see insights here</p>
              </div>
              <Link
                href="/dashboard"
                className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
              >
                Start Analysis <ExternalLink className="size-3.5" />
              </Link>
            </div>
          )}

          {/* ── Loading skeletons ── */}
          {loading && (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-36" />)}
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SkeletonBlock className="h-72" />
                <SkeletonBlock className="h-72" />
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <SkeletonBlock className="h-64" />
                <SkeletonBlock className="h-64" />
              </div>
            </div>
          )}

          {/* ── Dashboard content ── */}
          {!loading && (
            <>
              {/* Row 1 — KPI cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard icon={BarChart3}    label={demo.kpis.totalSessions.label} value={demo.kpis.totalSessions.value} trend={demo.kpis.totalSessions.trend} color="bg-blue-600" />
                <KpiCard icon={CheckCircle2} label={demo.kpis.passRate.label}      value={demo.kpis.passRate.value}      unit="%" trend={demo.kpis.passRate.trend}      color="bg-green-600" />
                <KpiCard icon={ShieldAlert}  label={demo.kpis.riskScore.label}     value={demo.kpis.riskScore.value}     trend={demo.kpis.riskScore.trend}     color="bg-amber-600" />
                <KpiCard icon={Code2}        label={demo.kpis.avgTests.label}      value={demo.kpis.avgTests.value}      trend={demo.kpis.avgTests.trend}      color="bg-purple-600" />
              </div>

              {/* Row 2 — Risk donut + pass rate line */}
              <div className="grid gap-4 lg:grid-cols-2">

                {/* Risk distribution donut */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Risk Level Distribution</h3>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <ResponsiveContainer width={160} height={160}>
                      <PieChart>
                        <Pie
                          data={demo.riskDist}
                          cx="50%" cy="50%"
                          innerRadius={45} outerRadius={72}
                          paddingAngle={3}
                          dataKey="value"
                          isAnimationActive
                        >
                          {demo.riskDist.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE.contentStyle} itemStyle={TOOLTIP_STYLE.itemStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 flex-1">
                      {demo.riskDist.map((d) => {
                        const total = demo.riskDist.reduce((a, b) => a + b.value, 0);
                        const pct   = Math.round((d.value / total) * 100);
                        return (
                          <div key={d.name} className="flex items-center gap-2 text-sm">
                            <div className="size-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                            <span className="text-slate-400 flex-1">{d.name}</span>
                            <span className="font-semibold tabular-nums text-slate-200">{d.value}</span>
                            <span className="text-slate-600 tabular-nums text-xs w-9 text-right">{pct}%</span>
                          </div>
                        );
                      })}
                      <p className="text-xs text-slate-600 pt-1">
                        Total: {demo.riskDist.reduce((a, b) => a + b.value, 0)} sessions
                      </p>
                    </div>
                  </div>
                </div>

                {/* Pass rate over time */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Pass Rate Over Time</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <AreaChart data={demo.passTimeline} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                      <defs>
                        <linearGradient id="passGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%"  stopColor="#3B82F6" stopOpacity={0.25} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis domain={[0, 100]} tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} unit="%" />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        formatter={(v) => [`${v ?? 0}%`, "Pass rate"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="passRate"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fill="url(#passGrad)"
                        dot={{ r: 3, fill: "#3B82F6" }}
                        isAnimationActive
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Row 3 — Language breakdown + test types stacked */}
              <div className="grid gap-4 lg:grid-cols-5">

                {/* Language breakdown — 2/5 */}
                <div className="lg:col-span-2 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Language Breakdown</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={demo.langData}
                      layout="vertical"
                      margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="lang" tick={{ fill: "#94A3B8", fontSize: 12 }} tickLine={false} axisLine={false} width={80} />
                      <Tooltip
                        {...TOOLTIP_STYLE}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(v, _, p: any) => [
                          `${v ?? 0} sessions (${p?.payload?.pct ?? 0}%)`, "",
                        ]}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]} isAnimationActive>
                        {demo.langData.map((entry) => {
                          const colors: Record<string, string> = { Python: "#3B82F6", Typescript: "#38BDF8", Typescrip: "#38BDF8", Javascript: "#FACC15", JavaScript: "#FACC15", TypeScript: "#38BDF8" };
                          return <Cell key={entry.lang} fill={colors[entry.lang] ?? "#6366F1"} />;
                        })}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Test types stacked — 3/5 */}
                <div className="lg:col-span-3 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Test Types Generated (Last 5 Sessions)</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={demo.testTypeData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                      <XAxis dataKey="session" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend wrapperStyle={{ fontSize: 11, color: "#64748B" }} />
                      <Bar dataKey="unit"        stackId="a" fill="#3B82F6" name="Unit"        radius={[0,0,0,0]} isAnimationActive />
                      <Bar dataKey="integration" stackId="a" fill="#8B5CF6" name="Integration" isAnimationActive />
                      <Bar dataKey="edge"        stackId="a" fill="#F59E0B" name="Edge"        isAnimationActive />
                      <Bar dataKey="negative"    stackId="a" fill="#EF4444" name="Negative"    radius={[4,4,0,0]} isAnimationActive />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Row 4 — Recent sessions table */}
              <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-800">
                  <h3 className="text-sm font-semibold text-slate-200">Recent Sessions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-800 bg-slate-900/80">
                        {["Session ID", "Language", "Risk Level", "Tests", "Pass Rate", "Date", ""].map((h) => (
                          <th key={h} className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-500">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {demo.recentSessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-3 font-mono text-xs text-slate-400">{s.id}…</td>
                          <td className="px-4 py-3 text-slate-300">{s.lang}</td>
                          <td className="px-4 py-3">
                            <span className={cn(
                              "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              RISK_BADGE_CLS[s.risk as keyof typeof RISK_BADGE_CLS],
                            )}>
                              {s.risk}
                            </span>
                          </td>
                          <td className="px-4 py-3 tabular-nums text-slate-300">{s.tests}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 min-w-[60px] rounded-full bg-slate-700">
                                <div
                                  className={cn("h-full rounded-full", s.passRate >= 80 ? "bg-green-500" : s.passRate >= 50 ? "bg-amber-500" : "bg-red-500")}
                                  style={{ width: `${s.passRate}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums text-slate-300 w-8">{s.passRate}%</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500">{s.date}</td>
                          <td className="px-4 py-3">
                            <Link
                              href="/dashboard"
                              className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:bg-slate-800 transition-colors"
                            >
                              View <ExternalLink className="size-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Row 5 — Top risk factors + edge cases */}
              <div className="grid gap-4 lg:grid-cols-2 pb-6">

                {/* Top risk factors */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Top Risk Factors Found</h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart
                      data={demo.topScenarios.slice(0, 5)}
                      layout="vertical"
                      margin={{ top: 0, right: 32, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" horizontal={false} />
                      <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fill: "#94A3B8", fontSize: 11 }} tickLine={false} axisLine={false} width={160} />
                      <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v ?? 0, "sessions"]} />
                      <Bar dataKey="count" fill="#F59E0B" radius={[0, 4, 4, 0]} isAnimationActive />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Most common edge cases */}
                <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
                  <h3 className="text-sm font-semibold text-slate-200 mb-4">Most Common Edge Cases</h3>
                  <div className="space-y-3">
                    {demo.edgeCases.map(({ name, count }, i) => {
                      const max = demo.edgeCases[0].count;
                      return (
                        <div key={name} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-700 tabular-nums w-3">{i + 1}</span>
                              <span className="text-slate-300">{name}</span>
                            </div>
                            <span className="text-slate-500 tabular-nums">{count}×</span>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full bg-cyan-500/70 transition-all duration-700"
                              style={{ width: `${Math.round((count / max) * 100)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

            </>
          )}
        </div>
      </div>
    </div>
  );
}
