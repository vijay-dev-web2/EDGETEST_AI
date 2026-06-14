"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Shield, Network, Rocket, ChevronRight, CheckCircle2, Zap } from "lucide-react";
import { supabase } from "@/lib/supabase";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23A11.51 11.51 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.807 5.625-5.48 5.92.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 21.795 24 17.295 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export default function LandingPage() {
  const [session, setSession] = useState<any>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    // Show any error from the callback redirect
    const params = new URLSearchParams(window.location.search);
    const err = params.get("auth_error");
    if (err) setAuthError(decodeURIComponent(err));

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) router.push("/dashboard");
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) router.push("/dashboard");
      }
    );
    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSignIn = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback`,
      },
    });
  };

  const handleDemoSignIn = async () => {
    try {
      localStorage.setItem("dev_bypass", "true");
      document.cookie = "dev_bypass=true; path=/; max-age=3600;";
      document.cookie = "sb-access-token=dev-mock-token; path=/; max-age=3600;";
      window.location.href = "/dashboard?demo=1";
    } catch (err: any) {
      console.error("Error in demo sign-in:", err);
      setAuthError(err.message || "Demo sign-in failed");
    }
  };


  return (
    <main className="min-h-screen bg-[#0A0F1E] overflow-x-hidden">
      {/* Fixed background orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute top-[-100px] left-[15%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl" />
        <div className="absolute top-[-80px] right-[15%] w-[400px] h-[400px] bg-purple-600/8 rounded-full blur-3xl" />
        <div className="absolute bottom-[20%] left-[45%] w-[350px] h-[350px] bg-cyan-600/6 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10">

        {/* Competition badge */}
        <div className="flex justify-center pt-12 pb-6 px-4">
          <div className="px-5 py-2 rounded-full border border-yellow-500/40 bg-yellow-500/8">
            <span className="text-yellow-400 text-sm font-semibold tracking-wide">
              ✦ Capgemini Exceller AgentifAI Buildathon · Problem #38
            </span>
          </div>
        </div>

        {/* Hero */}
        <section className="px-4 pb-16">
          <div className="max-w-7xl mx-auto">

            {/* Hero */}
            <div className="flex flex-col items-center text-center max-w-4xl mx-auto gap-8 xl:gap-14">
              <div className="w-full">
                <h1 className="text-6xl md:text-7xl xl:text-8xl font-extrabold tracking-tight mb-4">
                  <span className="bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                    EdgeTest AI
                  </span>
                </h1>

                <p className="text-slate-300 text-xl md:text-2xl font-serif italic mb-2">
                  by Team Trident Tech
                </p>

                <div className="flex flex-wrap justify-center gap-2 mb-8 mt-4">
                  {["Problem #38", "Automated Test Case Generator", "Sona College of Technology"].map((chip) => (
                    <span
                      key={chip}
                      className="px-4 py-1.5 rounded-full border border-slate-700 bg-slate-800/60 text-slate-300 text-xs font-medium"
                    >
                      {chip}
                    </span>
                  ))}
                </div>

                <p className="text-slate-300 text-base md:text-lg leading-relaxed mb-10 max-w-xl mx-auto">
                  <span className="text-amber-400 font-semibold">→</span> Upload any codebase and watch AI generate risk-scored, traced test suites in seconds.{" "}
                  <span className="text-amber-400 font-semibold">→</span> 5-factor risk formula ensures your highest-risk code is always tested first.{" "}
                  <span className="text-amber-400 font-semibold">→</span> Every test maps to a function and user story — zero ambiguity, full traceability.
                </p>

                {/* Auth error display */}
                {authError && (
                  <div className="mb-4 px-4 py-3 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 text-sm text-center">
                    Sign in failed: {authError}
                  </div>
                )}

                {/* CTA buttons */}
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <button
                    onClick={handleSignIn}
                    className="flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-base font-semibold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200 hover:scale-105 active:scale-95"
                  >
                    <GithubIcon className="w-5 h-5" />
                    Sign in with GitHub to Start
                    <ChevronRight className="w-4 h-4 opacity-80" />
                  </button>
                  <button
                    onClick={handleDemoSignIn}
                    className="flex items-center gap-2 px-6 py-4 rounded-2xl border border-slate-600 bg-slate-800/50 text-slate-300 hover:text-white hover:border-slate-500 hover:bg-slate-700/60 text-sm font-medium transition-all duration-200"
                  >
                    Watch Demo →
                  </button>
                </div>
              </div>
            </div>

            {/* Stats — full width below the grid */}
            <div className="flex flex-wrap justify-center gap-10 md:gap-16 mt-20 pt-8 border-t border-slate-800/40">
              {[
                { value: "9",   suffix: "",  label: "Pipeline Steps"      },
                { value: "5",   suffix: "",  label: "Risk Factors"        },
                { value: "6",   suffix: "",  label: "Test Categories"     },
                { value: "<60", suffix: "s", label: "Seconds to Generate" },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center">
                  <span className="text-4xl font-black bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent leading-none">
                    {s.value}{s.suffix}
                  </span>
                  <span className="mt-1.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Feature cards */}
        <section className="px-4 pb-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white">Built for Real-World Reliability</h2>
              <p className="mt-2 text-slate-400 text-sm md:text-base">
                Three pillars that set EdgeTest AI apart from generic test generators
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card 1 */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm p-6 hover:border-red-500/40 hover:shadow-lg hover:shadow-red-500/5 transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex w-12 h-12 items-center justify-center rounded-xl bg-red-500/10">
                    <Shield className="w-6 h-6 text-red-400" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-red-400 bg-red-500/10 border border-red-500/20">
                    5-Factor AI Scoring
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Risk-Based Testing</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Every function scored 0–100 across Complexity, Business Impact, Dependency Depth, Coverage Gap, and Security Sensitivity. HIGH risk code gets 7 test categories automatically.
                </p>
                <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950/60 p-3 font-mono text-[10px] leading-relaxed">
                  <div className="text-slate-500 mb-1">{"// 5-factor formula"}</div>
                  <div className="text-slate-300">
                    <span className="text-red-400">Score</span> = C×0.20 + BI×0.25 + DD×0.15
                  </div>
                  <div className="pl-14 text-slate-300">+ CG×0.20 + Sec×0.20</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded bg-red-500/15 px-2 py-0.5 text-red-400 border border-red-500/20">≥70 HIGH</span>
                    <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-400 border border-amber-500/20">40–69 MED</span>
                    <span className="rounded bg-green-500/15 px-2 py-0.5 text-green-400 border border-green-500/20">&lt;40 LOW</span>
                  </div>
                </div>
              </div>

              {/* Card 2 */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm p-6 hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex w-12 h-12 items-center justify-center rounded-xl bg-blue-500/10">
                    <Network className="w-6 h-6 text-blue-400" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-blue-400 bg-blue-500/10 border border-blue-500/20">
                    Function ↔ Requirement
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">Full Traceability</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Every test maps back to a code function and user story requirement. See which requirements are covered, which have gaps, and your overall coverage percentage at a glance.
                </p>
                <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950/60 p-3 text-[10px]">
                  <div className="font-mono text-slate-500 mb-2">{"// coverage matrix"}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {["withdraw", "deposit", "transfer", "balance"].map((fn) => (
                      <div key={fn} className="rounded-lg bg-slate-800/70 p-1.5 text-center">
                        <div className="truncate text-[8px] text-slate-400">{fn}</div>
                        <CheckCircle2 className="mx-auto mt-0.5 w-3 h-3 text-green-400" />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between font-mono">
                    <span className="text-slate-400">Function coverage</span>
                    <span className="font-bold text-blue-400">100%</span>
                  </div>
                </div>
              </div>

              {/* Card 3 */}
              <div className="rounded-2xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm p-6 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300 hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex w-12 h-12 items-center justify-center rounded-xl bg-emerald-500/10">
                    <Rocket className="w-6 h-6 text-emerald-400" />
                  </div>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide text-emerald-400 bg-emerald-500/10 border border-emerald-500/20">
                    Ship Confidence
                  </span>
                </div>
                <h3 className="text-lg font-bold text-white mb-2">CI/CD Integration</h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  Generated tests export as ready-to-run pytest or Jest files. Download XLSX reports, YAML configs, or push directly into your GitHub Actions pipeline — zero manual wiring.
                </p>
                <div className="mt-4 rounded-xl border border-slate-700/50 bg-slate-950/60 p-3 text-[10px]">
                  <div className="font-mono flex items-center gap-1.5 text-slate-300 mb-2">
                    <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                    <span className="text-emerald-400">8/10</span>
                    <span className="text-slate-400">tests passed · 80% pass rate</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 font-mono">
                    {["XLSX", "DOCX", "JSON", "YAML", "pytest", "jest"].map((fmt) => (
                      <span
                        key={fmt}
                        className="rounded px-2 py-0.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                      >
                        {fmt}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 7-step pipeline */}
        <section className="px-4 pb-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-2xl md:text-3xl font-bold text-white">How It Works</h2>
              <p className="mt-2 text-slate-400 text-sm md:text-base">
                A guided 9-step wizard — from raw code to production-ready tests
              </p>
            </div>

            <div className="hidden md:flex items-stretch gap-0">
              {[
                { n: 1, emoji: "📥", name: "Ingest Code",           desc: "Paste, GitHub, or story" },
                { n: 2, emoji: "🔍", name: "Code Understanding",    desc: "Completeness + pseudocode" },
                { n: 3, emoji: "⚡", name: "Risk Scoring",           desc: "5-factor AI analysis" },
                { n: 4, emoji: "🧪", name: "Unit Tests",             desc: "Generate unit test suite" },
                { n: 5, emoji: "🔗", name: "Integration Tests",     desc: "Generate integration suite" },
                { n: 6, emoji: "🗺️", name: "Traceability Map",      desc: "Function ↔ requirement" },
                { n: 7, emoji: "🏃", name: "Execute Unit Tests",    desc: "Docker-isolated run" },
                { n: 8, emoji: "🔬", name: "Execute Integration",   desc: "Docker-isolated run" },
                { n: 9, emoji: "📊", name: "Report & Export",        desc: "XLSX, DOCX, YAML, CI/CD" },
              ].map((step, i) => (
                <div key={step.n} className="flex flex-1 items-center min-w-0">
                  <div className="flex flex-1 flex-col items-center rounded-xl bg-slate-900/50 border border-slate-700/40 px-2 py-5 text-center">
                    <div className="flex w-8 h-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white text-xs font-black mb-2">
                      {step.n}
                    </div>
                    <span className="text-xl mb-1">{step.emoji}</span>
                    <span className="text-[11px] font-semibold text-white leading-tight">{step.name}</span>
                    <span className="mt-0.5 text-[9px] text-slate-400 leading-snug">{step.desc}</span>
                  </div>
                  {i < 8 && (
                    <div className="w-4 h-px bg-gradient-to-r from-yellow-500/50 to-yellow-500/10 shrink-0 mx-0.5" />
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2.5 md:hidden">
              {[
                { n: 1, emoji: "📥", name: "Ingest Code",           desc: "Paste, GitHub, or user story" },
                { n: 2, emoji: "🔍", name: "Code Understanding",    desc: "Completeness + pseudocode generation" },
                { n: 3, emoji: "⚡", name: "Risk Scoring",           desc: "5-factor AI risk analysis" },
                { n: 4, emoji: "🧪", name: "Generate Unit Tests",   desc: "Isolated function-level test suite" },
                { n: 5, emoji: "🔗", name: "Generate Integration",  desc: "Workflow & module interaction tests" },
                { n: 6, emoji: "🗺️", name: "Traceability Map",      desc: "Function ↔ requirement links" },
                { n: 7, emoji: "🏃", name: "Execute Unit Tests",    desc: "Docker-isolated unit test run" },
                { n: 8, emoji: "🔬", name: "Execute Integration",   desc: "Docker-isolated integration run" },
                { n: 9, emoji: "📊", name: "Report & Export",        desc: "XLSX, DOCX, YAML, CI/CD" },
              ].map((step) => (
                <div
                  key={step.n}
                  className="flex items-center gap-4 rounded-xl px-4 py-3 bg-slate-900/50 border border-slate-700/40"
                >
                  <div className="flex w-9 h-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white text-sm font-black">
                    {step.n}
                  </div>
                  <span className="text-2xl shrink-0">{step.emoji}</span>
                  <div>
                    <div className="text-sm font-semibold text-white">{step.name}</div>
                    <div className="text-xs text-slate-400">{step.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Tech stack */}
        <section className="px-4 pb-20">
          <div className="max-w-4xl mx-auto text-center">
            <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Powered By
            </p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {[
                { name: "Next.js 14",   color: "#E2E8F0" },
                { name: "FastAPI",      color: "#22D3EE" },
                { name: "LangChain",    color: "#A78BFA" },
                { name: "GPT-4o",       color: "#60A5FA" },
                { name: "Supabase",     color: "#3ECF8E" },
                { name: "Redis",        color: "#FCA5A5" },
                { name: "Docker",       color: "#93C5FD" },
                { name: "Python AST",   color: "#FDE68A" },
              ].map((t) => (
                <span
                  key={t.name}
                  className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition-colors"
                  style={{ color: t.color }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="px-4 pb-24">
          <div className="max-w-2xl mx-auto">
            <div className="rounded-3xl border border-slate-700/50 bg-slate-900/60 backdrop-blur-sm p-10 text-center">
              <h2 className="text-2xl md:text-3xl font-bold text-white">
                Ready to test with confidence?
              </h2>
              <p className="mt-3 text-slate-300 text-sm md:text-base leading-relaxed">
                Sign in with GitHub and run your first risk-aware test suite in under 60 seconds.
                No configuration needed.
              </p>
              <button
                onClick={handleSignIn}
                className="mt-8 inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-base font-semibold shadow-lg shadow-blue-600/25 hover:shadow-blue-600/40 transition-all duration-200 hover:scale-105 active:scale-95"
              >
                <GithubIcon className="w-5 h-5" />
                Get Started — It&apos;s Free
                <ChevronRight className="w-4 h-4 opacity-80" />
              </button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-800/60 px-6 py-8">
          <div className="max-w-5xl mx-auto flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/EDGETEST_AI_LOGO.png"
                alt="EdgeTest AI"
                className="w-7 h-7 object-contain"
              />
              <span className="text-sm font-semibold text-slate-300">EdgeTest AI</span>
              <span className="text-slate-600">·</span>
              <span className="text-xs text-slate-500">Team Trident Tech</span>
            </div>
            <p className="text-center text-[11px] text-slate-600">
              Capgemini Exceller AgentifAI Buildathon · Problem #38 · Sona College of Technology
            </p>
            <span className="text-xs text-slate-600">2025</span>
          </div>
        </footer>

      </div>
    </main>
  );
}
