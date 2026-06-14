"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import * as Tabs from "@radix-ui/react-tabs";
import * as Collapsible from "@radix-ui/react-collapsible";
import { Button } from "@/components/ui/button";
import {
  Code2, GitBranch, Link2, Loader2, FileCode2, Wand2, Sparkles,
  Zap, CheckCircle2, AlertTriangle, ChevronDown, ChevronRight,
  ChevronUp, BookOpen, FlaskConical,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Language, InputTab } from "@/hooks/useAnalysis";
import { CODE_EXAMPLES } from "@/lib/examples";
import { StoryTestResults, type StoryTestData } from "@/components/StoryTestResults";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ── Syntax validation ──────────────────────────────────────────────────────

type SyntaxState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "valid" }
  | { status: "invalid"; error: string }
  | { status: "fixed" };

function useSyntaxValidation(code: string, language: Language, onFixed: (c: string) => void) {
  const [state, setState] = useState<SyntaxState>({ status: "idle" });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const validate = useCallback(async (src: string, lang: Language) => {
    if (lang !== "python" || src.trim().length < 10) { setState({ status: "idle" }); return; }
    setState({ status: "checking" });
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch(`${BACKEND}/api/analyze/validate`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: src, language: lang }),
        signal: ctrl.signal,
      });
      if (!res.ok) { setState({ status: "idle" }); return; }
      const data = await res.json();
      if (data.valid && data.fixed_code) { setState({ status: "fixed" }); onFixed(data.fixed_code); }
      else if (data.valid) setState({ status: "valid" });
      else setState({ status: "invalid", error: data.error ?? "Syntax error" });
    } catch { setState({ status: "idle" }); }
  }, [onFixed]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => validate(code, language), 600);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [code, language, validate]);

  return state;
}

function SyntaxBadge({ state }: { state: SyntaxState }) {
  if (state.status === "idle") return null;
  if (state.status === "checking")
    return <span className="flex items-center gap-1 text-xs text-slate-400"><Loader2 className="size-3 animate-spin" />checking…</span>;
  if (state.status === "valid" || state.status === "fixed")
    return <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="size-3.5" />{state.status === "fixed" ? "Auto-fixed" : "Valid"}</span>;
  return (
    <span className="flex items-center gap-1.5 text-xs text-red-400" title={(state as { error: string }).error}>
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="truncate max-w-[200px]">{(state as { error: string }).error}</span>
    </span>
  );
}

// ── Language detection + badge ─────────────────────────────────────────────

const LANG_META: Record<Language, { icon: string; label: string }> = {
  python:     { icon: "🐍", label: "Python" },
  typescript: { icon: "🔷", label: "TypeScript" },
  javascript: { icon: "🟨", label: "JavaScript" },
  java:       { icon: "☕", label: "Java" },
  csharp:     { icon: "💠", label: "C# (.NET)" },
  cpp:        { icon: "⚙️", label: "C++" },
};

function detectLanguage(code: string): Language {
  if (/^\s*(def |class |import |from .+ import|async def )/m.test(code)) return "python";
  if (/:\s*(string|number|boolean|void|any|never)\b/.test(code) || /\binterface \w+/.test(code) || /\btype \w+ =/.test(code)) return "typescript";
  if (/^\s*(public|private|protected)\s+(class|static|void|int|String|List|Map)\b/m.test(code) || /@(RestController|Service|Repository|SpringBootApplication|Test)\b/.test(code) || /\bSystem\.out\.print/.test(code)) return "java";
  if (/^\s*using\s+[\w.]+;/m.test(code) || /\[ApiController\]|\[HttpGet\]|\[Fact\]|\[Theory\]/.test(code) || /\bnamespace\s+\w+/.test(code)) return "csharp";
  if (/^#include\s+[<"]/m.test(code) || /\bTEST\s*\(|TEST_F\s*\(|EXPECT_EQ\s*\(|ASSERT_EQ\s*\(/.test(code) || /\bstd::\w+/.test(code)) return "cpp";
  return "javascript";
}

function LanguageBadge({ language, onChange }: { language: Language; onChange: (l: Language) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { icon, label } = LANG_META[language];

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Language detected automatically from syntax. Click to override if incorrect."
        className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/60 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-slate-500 hover:bg-slate-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <span>{icon}</span>
        <span>{label}</span>
        <span className="text-slate-500">· Auto-detected</span>
        <ChevronDown className={cn("size-3 text-slate-500 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-48 rounded-xl border border-slate-700 bg-slate-900 shadow-xl p-1">
          <p className="px-2.5 py-1.5 text-[10px] text-slate-500 font-medium uppercase tracking-wider">Override language</p>
          {(["python", "typescript", "javascript", "java", "csharp", "cpp"] as Language[]).map((l) => (
            <button
              key={l}
              onClick={() => { onChange(l); setOpen(false); }}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                l === language ? "bg-blue-600/20 text-blue-300" : "text-slate-300 hover:bg-slate-800",
              )}
            >
              <span>{LANG_META[l].icon}</span>
              <span>{LANG_META[l].label}</span>
              {l === language && <CheckCircle2 className="ml-auto size-3.5 text-blue-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Example cards ──────────────────────────────────────────────────────────

function ExamplesDrawer({ onLoad }: { onLoad: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
      >
        <BookOpen className="size-3.5" />
        Try an example
        <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2">
          {CODE_EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              onClick={() => { onLoad(ex.id); setOpen(false); }}
              className="group flex flex-col gap-1 rounded-xl border border-slate-700/60 bg-slate-800/40 p-3 text-left hover:border-slate-500 hover:bg-slate-800/80 transition-all active:scale-[.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-slate-200 group-hover:text-white">{ex.title}</span>
                <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] font-semibold shrink-0", ex.tagColor)}>{ex.tag}</span>
              </div>
              <p className="text-[10px] text-slate-500 leading-snug">{ex.description}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  code: string;
  language: Language;
  repoUrl: string;
  branch: string;
  inputTab: InputTab;
  userStory: string;
  generatingCode: boolean;
  loading: boolean;
  loadingMessage: string;
  isDemoMode: boolean;
  githubFetching: boolean;
  githubFilesFound: string[];
  onSetCode: (c: string) => void;
  onSetLanguage: (l: Language) => void;
  onSetRepoUrl: (u: string) => void;
  onSetBranch: (b: string) => void;
  onSetInputTab: (t: InputTab) => void;
  onSetUserStory: (s: string) => void;
  onGenerateCode: (story: string, language: Language) => void;
  onLoadExample: (id: string) => void;
  onAnalyze: () => void;
  onFetchAndAnalyze: () => void;
  onStartDemo: () => void;
}

const STORY_MAX = 500;

// ── Component ──────────────────────────────────────────────────────────────

export function Step1CodeInput({
  code, language, repoUrl, branch, inputTab, userStory, generatingCode,
  loading, loadingMessage, isDemoMode, githubFetching, githubFilesFound,
  onSetCode, onSetLanguage, onSetRepoUrl, onSetBranch, onSetInputTab,
  onSetUserStory, onGenerateCode, onLoadExample, onAnalyze, onFetchAndAnalyze, onStartDemo,
}: Props) {
  const [storyOpen, setStoryOpen] = useState(false);
  const prevCodeRef = useRef(code);

  // Story-mode state
  const [storyModeText, setStoryModeText] = useState("");
  const [storyModeAC, setStoryModeAC] = useState("");
  const [storyModeLang, setStoryModeLang] = useState<string>("python");
  const [storyModeResults, setStoryModeResults] = useState<StoryTestData | null>(null);
  const [storyModeLoading, setStoryModeLoading] = useState(false);
  const [storyModeError, setStoryModeError] = useState<string | null>(null);

  const handleGenerateFromStory = useCallback(async () => {
    setStoryModeLoading(true);
    setStoryModeError(null);
    setStoryModeResults(null);
    try {
      const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
      const res = await fetch(`${BACKEND}/api/story/generate-tests`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_story: storyModeText,
          acceptance_criteria: storyModeAC,
          language: storyModeLang,
        }),
      });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data = await res.json();
      setStoryModeResults(data);
    } catch (err: unknown) {
      setStoryModeError(err instanceof Error ? err.message : "Failed to generate tests from story");
    } finally {
      setStoryModeLoading(false);
    }
  }, [storyModeText, storyModeAC, storyModeLang]);

  // Auto-detect language when code changes
  useEffect(() => {
    if (code.length > 30 && code !== prevCodeRef.current) {
      const detected = detectLanguage(code);
      if (detected !== language) onSetLanguage(detected);
    }
    prevCodeRef.current = code;
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  const syntaxState = useSyntaxValidation(code, language, onSetCode);
  const hasCode = code.trim().length > 0;
  const storyLen = userStory.length;

  // GitHub tab: show editor only after a successful fetch
  const showGithubEditor = inputTab === "github" && githubFilesFound.length > 0 && hasCode;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Step context header ──────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-700/50 bg-slate-900/50 px-5 py-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-bold text-slate-200 tracking-wide">Step 1 of 7 — Input Ingestion</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Paste code, import from GitHub, or start from a user story. This step prepares the AI for analysis.
            </p>
          </div>
          <button
            onClick={onStartDemo}
            disabled={loading}
            className="shrink-0 flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 px-3 py-1.5 text-xs font-semibold text-white shadow-md shadow-blue-600/20 disabled:opacity-50 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {isDemoMode ? <><Loader2 className="size-3 animate-spin" />Running…</> : <><Zap className="size-3" />Try Demo</>}
          </button>
        </div>
        {/* Progress bar */}
        <div className="h-1.5 w-full rounded-full bg-slate-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all" style={{ width: "14%" }} />
        </div>
        <p className="text-[10px] text-slate-600 mt-1">14% — 1 of 7 steps</p>
      </div>

      {/* ── Numbered hints ───────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3">
        {[
          { n: "①", text: "Paste your code or import from GitHub", required: true },
          { n: "②", text: "Add a user story for context", required: false },
          { n: "③", text: "Click Analyze Code", required: true },
        ].map((h) => (
          <div key={h.n} className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="font-semibold text-blue-400">{h.n}</span>
            <span>{h.text}</span>
            {!h.required && <span className="text-slate-600">(optional)</span>}
          </div>
        ))}
      </div>

      {/* ── Input tabs ───────────────────────────────────────────────── */}
      <Tabs.Root
        value={inputTab}
        onValueChange={(v) => onSetInputTab(v as InputTab)}
        className="flex flex-col gap-4"
      >
        <Tabs.List className="flex w-fit gap-1 rounded-xl border border-slate-700/60 bg-slate-900/60 p-1">
          <Tabs.Trigger
            value="paste"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              "text-slate-500 hover:text-slate-200",
              "data-[state=active]:bg-slate-700/80 data-[state=active]:text-slate-100",
            )}
          >
            <Code2 className="size-3.5" /> Paste Code
          </Tabs.Trigger>
          <Tabs.Trigger
            value="github"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              "text-slate-500 hover:text-slate-200",
              "data-[state=active]:bg-slate-700/80 data-[state=active]:text-slate-100",
            )}
          >
            <GitBranch className="size-3.5" /> Connect GitHub Repo
          </Tabs.Trigger>
          <Tabs.Trigger
            value="story"
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
              "text-slate-500 hover:text-slate-200",
              "data-[state=active]:bg-slate-700/80 data-[state=active]:text-slate-100",
            )}
          >
            <FlaskConical className="size-3.5" /> From User Story
          </Tabs.Trigger>
        </Tabs.List>

        {/* ── Paste Code tab ─────────────────────────────────────────── */}
        <Tabs.Content value="paste" className="flex flex-col gap-4 data-[state=inactive]:hidden">

          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap">
            <p className="text-xs font-semibold text-slate-200 uppercase tracking-wider">Source Code <span className="text-red-400">*</span></p>
            <div className="flex-1" />
            <LanguageBadge language={language} onChange={onSetLanguage} />
            {hasCode && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <FileCode2 className="size-3.5" />
                {code.split("\n").length} lines
              </span>
            )}
            <SyntaxBadge state={syntaxState} />
            <ExamplesDrawer onLoad={onLoadExample} />
          </div>

          {/* Editor */}
          <div className="relative rounded-xl border border-slate-700 shadow-xl overflow-hidden" style={{ height: 360 }}>
            {!hasCode && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                <p className="text-sm text-slate-600 italic">Paste at least one function or class to continue</p>
              </div>
            )}
            <MonacoEditor
              height="360px"
              language={language}
              theme="vs-dark"
              value={code}
              onChange={(v) => onSetCode(v ?? "")}
              options={{
                fontSize: 14,
                fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
                minimap: { enabled: false },
                scrollBeyondLastLine: false,
                padding: { top: 16, bottom: 16 },
                lineNumbers: "on",
                renderLineHighlight: "line",
                wordWrap: "on",
                bracketPairColorization: { enabled: true },
                smoothScrolling: true,
              }}
            />
          </div>

          {/* Analyze button */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <p className="text-xs text-slate-500">
              {!hasCode ? "← Paste your code above to enable analysis" : `${code.split("\n").length} lines ready for analysis`}
            </p>
            <Button
              onClick={onAnalyze}
              disabled={loading || generatingCode || !hasCode}
              className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900"
            >
              {loading
                ? <><Loader2 className="size-4 animate-spin mr-1.5" />{loadingMessage}</>
                : "Analyze Code →"}
            </Button>
          </div>
        </Tabs.Content>

        {/* ── GitHub tab ─────────────────────────────────────────────── */}
        <Tabs.Content value="github" className="flex flex-col gap-4 data-[state=inactive]:hidden">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Connect a GitHub Repository</h3>
              <p className="text-xs text-slate-400 mt-0.5">Fetches Python, JS/TS, Java, C#, and C++ files and combines them for analysis. Public repos only.</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-xs font-medium text-slate-200">Repository URL</label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="url"
                    placeholder="https://github.com/owner/repository"
                    value={repoUrl}
                    onChange={(e) => onSetRepoUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !githubFetching && !loading) onFetchAndAnalyze(); }}
                    disabled={githubFetching || loading}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-50"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-200">Branch</label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="main"
                    value={branch}
                    onChange={(e) => onSetBranch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !githubFetching && !loading) onFetchAndAnalyze(); }}
                    disabled={githubFetching || loading}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 py-2 pl-8 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 disabled:opacity-50"
                  />
                </div>
              </div>
            </div>

            <Button
              onClick={onFetchAndAnalyze}
              disabled={githubFetching || loading || !repoUrl.trim()}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white border-0 shadow-md shadow-blue-600/20 disabled:opacity-40 gap-2 focus-visible:ring-2 focus-visible:ring-blue-400"
            >
              {githubFetching
                ? <><Loader2 className="size-4 animate-spin" />Fetching repository…</>
                : loading
                ? <><Loader2 className="size-4 animate-spin" />{loadingMessage || "Analyzing…"}</>
                : <><GitBranch className="size-4" />Fetch &amp; Analyze</>}
            </Button>

            <p className="text-xs text-slate-600">Public repositories only · Up to 80 files, 100 KB each</p>
          </div>

          {/* Files found */}
          {githubFilesFound.length > 0 && !githubFetching && (
            <div className="rounded-xl border border-emerald-800/40 bg-emerald-950/20 p-4 space-y-2">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                Found {githubFilesFound.length} file{githubFilesFound.length !== 1 ? "s" : ""} — combined code loaded into editor below
              </p>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {githubFilesFound.map((f) => (
                  <span key={f} className="font-mono text-[10px] bg-slate-800/60 border border-slate-700/50 text-slate-300 rounded px-1.5 py-0.5">{f}</span>
                ))}
              </div>
            </div>
          )}

          {/* Monaco — only shown after successful fetch */}
          {showGithubEditor && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
                  Combined Source Code <span className="text-emerald-400 font-normal normal-case">({githubFilesFound.length} files)</span>
                </p>
                <div className="flex items-center gap-2">
                  <LanguageBadge language={language} onChange={onSetLanguage} />
                  <SyntaxBadge state={syntaxState} />
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 shadow-xl overflow-hidden" style={{ height: 320 }}>
                <MonacoEditor
                  height="320px"
                  language={language}
                  theme="vs-dark"
                  value={code}
                  onChange={(v) => onSetCode(v ?? "")}
                  options={{
                    fontSize: 13,
                    fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    padding: { top: 12, bottom: 12 },
                    lineNumbers: "on",
                    readOnly: false,
                    wordWrap: "on",
                    smoothScrolling: true,
                  }}
                />
              </div>
            </div>
          )}
        </Tabs.Content>

        {/* ── From User Story tab ─────────────────────────────────────── */}
        <Tabs.Content value="story" className="flex flex-col gap-4 data-[state=inactive]:hidden">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 p-5 space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Generate Tests Directly from a User Story</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Skip the code stage — describe what the feature should do and get test cases immediately.
              </p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">User Story <span className="text-red-400">*</span></label>
              <textarea
                rows={5}
                value={storyModeText}
                onChange={(e) => setStoryModeText(e.target.value)}
                placeholder={"As a bank customer, I want to deposit money into my account so that my balance is updated immediately…"}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-300">Acceptance Criteria <span className="text-slate-500">(optional)</span></label>
              <textarea
                rows={3}
                value={storyModeAC}
                onChange={(e) => setStoryModeAC(e.target.value)}
                placeholder={"- Balance must increase by exact deposit amount\n- Deposit must be positive and non-zero\n- Confirmation must include transaction ID"}
                className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
              />
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Language</label>
                <select
                  value={storyModeLang}
                  onChange={(e) => setStoryModeLang(e.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/60"
                >
                  <option value="python">Python (pytest)</option>
                  <option value="javascript">JavaScript (Jest)</option>
                  <option value="typescript">TypeScript (Jest)</option>
                  <option value="java">Java (JUnit)</option>
                  <option value="csharp">C# (xUnit)</option>
                </select>
              </div>
              <div className="flex-1" />
              <Button
                onClick={handleGenerateFromStory}
                disabled={!storyModeText.trim() || storyModeLoading}
                className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20 disabled:opacity-40 gap-2"
              >
                {storyModeLoading
                  ? <><Loader2 className="size-4 animate-spin" />Generating…</>
                  : <><FlaskConical className="size-4" />Generate Tests from Story</>}
              </Button>
            </div>

            {storyModeError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                {storyModeError}
              </div>
            )}
          </div>

          {storyModeResults && (
            <StoryTestResults
              data={storyModeResults}
              onAddToPipeline={(combinedCode, filename) => {
                onSetCode(combinedCode);
                onSetInputTab("paste" as InputTab);
              }}
            />
          )}
        </Tabs.Content>
      </Tabs.Root>

      {/* ── ② User Story — collapsible ───────────────────────────────── */}
      <Collapsible.Root open={storyOpen} onOpenChange={setStoryOpen}>
        <Collapsible.Trigger asChild>
          <button className="w-full flex items-center justify-between gap-2 rounded-xl border border-slate-700/60 bg-slate-900/40 px-4 py-3 text-sm font-medium text-slate-200 hover:bg-slate-800/60 hover:border-slate-600 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="flex items-center gap-2">
              <span className="text-blue-400 font-bold">②</span>
              <Sparkles className="size-3.5 text-yellow-400" />
              Add User Story Context
              <span className="text-xs text-slate-500 font-normal">(optional)</span>
            </span>
            {storyOpen
              ? <ChevronUp className="size-4 text-slate-500" />
              : <ChevronDown className="size-4 text-slate-500" />}
          </button>
        </Collapsible.Trigger>

        <Collapsible.Content className="overflow-hidden data-[state=open]:animate-none">
          <div className="mt-2 rounded-xl border border-slate-700/60 bg-slate-900/40 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400 leading-relaxed">
                Describe what the code should do. Used to generate more relevant, business-aligned test scenarios.
              </p>
              <span className={cn(
                "text-xs tabular-nums ml-4 shrink-0",
                storyLen >= STORY_MAX ? "text-red-400" : storyLen > STORY_MAX * 0.8 ? "text-yellow-400" : "text-slate-500",
              )}>
                {storyLen}/{STORY_MAX}
              </span>
            </div>

            <textarea
              rows={4}
              maxLength={STORY_MAX}
              value={userStory}
              onChange={(e) => onSetUserStory(e.target.value)}
              placeholder='e.g. "As a user, I want to divide two numbers and get the correct quotient, including handling division by zero gracefully."'
              className="w-full resize-none rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-100 placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-colors"
            />

            <div className="flex items-start justify-between gap-3 flex-wrap">
              <p className="text-xs text-amber-500/80 flex items-center gap-1">
                <AlertTriangle className="size-3 shrink-0" />
                This will replace the current editor content
              </p>
              <Button
                size="sm"
                variant="outline"
                disabled={!userStory.trim() || generatingCode}
                onClick={() => onGenerateCode(userStory, language)}
                className="border-slate-700 bg-slate-800/60 text-slate-200 hover:bg-slate-700 hover:text-white disabled:opacity-40 gap-1.5 focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {generatingCode
                  ? <><Loader2 className="size-3.5 animate-spin" />Generating…</>
                  : <><Wand2 className="size-3.5" />Generate Code from Story</>}
              </Button>
            </div>
          </div>
        </Collapsible.Content>
      </Collapsible.Root>

    </div>
  );
}
