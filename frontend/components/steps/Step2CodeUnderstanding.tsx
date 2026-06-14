"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, AlertTriangle, ChevronRight, RotateCcw, ChevronsDown, Network, Check, ArrowRight, Sparkles, Send, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import { streamCodeCompletion } from "@/lib/backendApi";
import type { CompletenessResult, GithubFetchResult } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

// ── Pseudocode syntax highlighting ──────────────────────────────────────────

type Seg = { text: string; color: string }

const PC = {
  keyword: '#60A5FA',   // blue-400
  arrow:   '#F5A623',   // gold
  step:    '#475569',   // slate-600  (muted gray)
  cls:     '#C084FC',   // purple-400
  func:    '#22D3EE',   // cyan-400
  default: '#94A3B8',   // slate-400
} as const

const PC_KEYWORDS = new Set([
  'CHECK','VALIDATE','HASH','STORE','RETURN','GET','SET',
  'INITIALIZE','COMPARE','GENERATE','VERIFY','CREATE','RAISE',
  'INCREMENT','RESET',
])

function tokenizeLine(line: string): Seg[] {
  const trimmed = line.trimStart()
  if (/^CLASS\s/.test(trimmed)) return [{ text: line, color: PC.cls }]
  if (trimmed.includes('📌'))   return [{ text: line, color: PC.func }]

  const TOKEN_RE = /(\d+\.\s?|→|\b[A-Z]{3,}\b)/g
  const segs: Seg[] = []
  let last = 0
  let m: RegExpExecArray | null

  while ((m = TOKEN_RE.exec(line)) !== null) {
    if (m.index > last) segs.push({ text: line.slice(last, m.index), color: PC.default })
    const tok = m[1]
    if (tok === '→')            segs.push({ text: tok, color: PC.arrow })
    else if (/^\d/.test(tok))   segs.push({ text: tok, color: PC.step })
    else if (PC_KEYWORDS.has(tok)) segs.push({ text: tok, color: PC.keyword })
    else                        segs.push({ text: tok, color: PC.default })
    last = m.index + tok.length
  }

  if (last < line.length) segs.push({ text: line.slice(last), color: PC.default })
  return segs.length ? segs : [{ text: line, color: PC.default }]
}

interface Props {
  code: string;
  language: Language;
  sessionId: string | null;
  userStory?: string;
  completeness: CompletenessResult | null;
  pseudocode: string;
  pseudocodeStreaming: boolean;
  loading: boolean;
  loadingMessage: string;
  isDemoMode?: boolean;
  selectedSuggestion: number | null;
  moduleGraph?: GithubFetchResult["module_graph"];
  onRunCompleteness: (code: string, lang: Language, story?: string) => void;
  onStartStream: (code: string, sessionId: string, story?: string) => void;
  onSelectSuggestion: (idx: number) => void;
  onAcceptSuggestion: (s: string) => void;
  onApprove: () => void;
  onEditCode: () => void;
  onRegenerate: (code: string, sessionId: string, story?: string) => void;
}

export function Step2CodeUnderstanding({
  code, language, sessionId, userStory,
  completeness, pseudocode, pseudocodeStreaming,
  loading, loadingMessage, isDemoMode,
  selectedSuggestion, moduleGraph,
  onRunCompleteness, onStartStream,
  onSelectSuggestion, onAcceptSuggestion,
  onApprove, onEditCode, onRegenerate,
}: Props) {
  // Auto-start completeness check when sessionId becomes available.
  // Must depend on sessionId (not []) because startAnalysis sets currentStep:2
  // while loading:true, so the mount-time closure would see loading=true and skip.
  // When sessionId is patched in, loading is already false in the same batch.
  useEffect(() => {
    if (!completeness && !loading) {
      console.log("[Step2] starting completeness check", { sessionId, loading, hasCompleteness: !!completeness });
      onRunCompleteness(code, language, userStory);
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-start pseudocode streaming once session is ready
  useEffect(() => {
    if (sessionId && !pseudocode && !pseudocodeStreaming) {
      onStartStream(code, sessionId, userStory);
    }
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo: auto-approve once pseudocode is done
  useEffect(() => {
    if (isDemoMode && completeness && pseudocode && !pseudocodeStreaming) {
      const t = setTimeout(() => onApprove(), 2000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, completeness, pseudocode, pseudocodeStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  const score = completeness?.completeness_score ?? null;
  const isComplete = completeness?.is_complete ?? null;

  // Track which suggestion was just applied for brief "✓ Applied" feedback
  const [appliedIdx, setAppliedIdx] = useState<number | null>(null);

  function handleSuggestionClick(s: string, i: number) {
    // Inject suggestion text into chat input
    setChatInputText(s);
    setAppliedIdx(i);
    onSelectSuggestion(i);
    setTimeout(() => setAppliedIdx(null), 2000);
    // Scroll chat into view
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 100);
  }

  // ── Chat state ───────────────────────────────────────────────────────────

  type ChatMsg =
    | { kind: 'ai-greeting' }
    | { kind: 'user'; text: string }
    | { kind: 'typing' }
    | { kind: 'ai-response'; text: string; code: string; ts: number }
    | { kind: 'ai-error'; text: string }

  const [chatMsgs, setChatMsgs] = useState<ChatMsg[]>([{ kind: 'ai-greeting' }]);
  const [chatInputText, setChatInputText] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [chatHidden, setChatHidden] = useState(false);
  const [successBanner, setSuccessBanner] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const chatMsgsRef = useRef<HTMLDivElement>(null);

  function scrollChatBottom() {
    setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  }

  const sendUserPrompt = useCallback(async () => {
    const text = chatInputText.trim();
    if (!text || chatSending) return;

    setChatInputText('');
    setChatSending(true);
    setChatMsgs(prev => [...prev, { kind: 'user', text }, { kind: 'typing' }]);
    scrollChatBottom();

    let accumulated = '';
    try {
      const full = await streamCodeCompletion(
        code,
        language,
        text,
        (token) => {
          accumulated += token;
          // Live-update the typing indicator with streamed text
          setChatMsgs(prev => {
            const next = [...prev];
            const typingIdx = next.findLastIndex(m => m.kind === 'typing');
            if (typingIdx >= 0) {
              next[typingIdx] = { kind: 'ai-response', text: 'Here is the completed code:', code: accumulated, ts: Date.now() };
            }
            return next;
          });
          scrollChatBottom();
        },
      );
      // Finalize — replace any still-typing bubble
      setChatMsgs(prev => {
        const next = prev.filter(m => m.kind !== 'typing');
        // Update or push final response
        const lastIdx = next.findLastIndex(m => m.kind === 'ai-response');
        if (lastIdx >= 0) {
          (next[lastIdx] as { kind: 'ai-response'; text: string; code: string; ts: number }).code = full;
        } else {
          next.push({ kind: 'ai-response', text: 'Here is the completed code:', code: full, ts: Date.now() });
        }
        return next;
      });
    } catch (err) {
      setChatMsgs(prev => [
        ...prev.filter(m => m.kind !== 'typing'),
        { kind: 'ai-error', text: err instanceof Error ? err.message : 'Something went wrong. Please try again.' },
      ]);
    } finally {
      setChatSending(false);
      scrollChatBottom();
    }
  }, [chatInputText, chatSending, code, language]);

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendUserPrompt();
    }
  }

  function useThisCode(completedCode: string) {
    onAcceptSuggestion(completedCode);
    setSuccessBanner(true);
    setChatHidden(true);
    setTimeout(() => onApprove(), 1500);
  }

  async function regenerateChat(ts: number) {
    const lastUser = [...chatMsgs].reverse().find(m => m.kind === 'user') as { kind: 'user'; text: string } | undefined;
    if (!lastUser || chatSending) return;
    const text = lastUser.text;
    // Strip the old response
    setChatMsgs(prev => [
      ...prev.filter(m => !(m.kind === 'ai-response' && (m as { kind: 'ai-response'; ts: number }).ts === ts)),
      { kind: 'typing' },
    ]);
    setChatSending(true);
    scrollChatBottom();
    let accumulated = '';
    try {
      const full = await streamCodeCompletion(code, language, text, (token) => {
        accumulated += token;
        setChatMsgs(prev => {
          const next = [...prev];
          const typingIdx = next.findLastIndex(m => m.kind === 'typing');
          if (typingIdx >= 0) next[typingIdx] = { kind: 'ai-response', text: 'Here is the completed code:', code: accumulated, ts: Date.now() };
          return next;
        });
        scrollChatBottom();
      });
      setChatMsgs(prev => {
        const next = prev.filter(m => m.kind !== 'typing');
        const lastIdx = next.findLastIndex(m => m.kind === 'ai-response');
        if (lastIdx >= 0) (next[lastIdx] as { kind: 'ai-response'; text: string; code: string; ts: number }).code = full;
        else next.push({ kind: 'ai-response', text: 'Here is the completed code:', code: full, ts: Date.now() });
        return next;
      });
    } catch (err) {
      setChatMsgs(prev => [...prev.filter(m => m.kind !== 'typing'), { kind: 'ai-error', text: err instanceof Error ? err.message : 'Something went wrong.' }]);
    } finally {
      setChatSending(false);
      scrollChatBottom();
    }
  }

  return (
    <div className="flex flex-col h-full gap-5 overflow-y-auto pr-1">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-slate-100">Code Understanding</h2>
        <p className="text-sm text-slate-500">Analyzing completeness and generating pseudocode description.</p>
      </div>

      {moduleGraph && moduleGraph.integration_boundaries.length > 0 && (
        <div className="shrink-0 flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/8 px-4 py-3">
          <Network className="size-4 text-purple-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-purple-300">
              {Object.keys(moduleGraph.modules).length} module{Object.keys(moduleGraph.modules).length !== 1 ? "s" : ""} · {moduleGraph.integration_boundaries.length} integration {moduleGraph.integration_boundaries.length !== 1 ? "boundaries" : "boundary"} detected
            </span>
            <div className="flex flex-wrap gap-1 mt-1.5">
              {moduleGraph.integration_boundaries.slice(0, 6).map((b, i) => (
                <span key={i} className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[10px] font-mono text-purple-300">
                  {b.from.split(".")[0]} → {b.to.split(".")[0]}
                </span>
              ))}
              {moduleGraph.integration_boundaries.length > 6 && (
                <span className="text-[10px] text-slate-500">+{moduleGraph.integration_boundaries.length - 6} more</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Completeness card */}
      <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="flex size-6 items-center justify-center rounded-md bg-blue-500/20 text-blue-400 text-xs font-bold">1</div>
          <h3 className="text-sm font-semibold text-slate-200">Completeness Analysis</h3>
        </div>

        {loading && !completeness ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="size-4 animate-spin" />
            <span>{loadingMessage || "Analyzing…"}</span>
          </div>
        ) : completeness ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              {isComplete
                ? <CheckCircle2 className="size-5 text-green-400 shrink-0" />
                : <AlertTriangle className="size-5 text-amber-400 shrink-0" />
              }
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-200">
                    {isComplete ? "Code is complete" : "Code may be incomplete"}
                  </span>
                  <span className={cn(
                    "text-sm font-bold tabular-nums",
                    score !== null && score >= 70 ? "text-green-400" : score !== null && score >= 40 ? "text-amber-400" : "text-red-400",
                  )}>{score}%</span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-700">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      score !== null && score >= 70 ? "bg-green-500" : score !== null && score >= 40 ? "bg-amber-500" : "bg-red-500",
                    )}
                    style={{ width: `${score ?? 0}%` }}
                  />
                </div>
              </div>
            </div>

            {completeness.missing_elements.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-400">Missing elements:</p>
                <ul className="space-y-1">
                  {completeness.missing_elements.map((el, i) => (
                    <li key={i} className="text-xs text-slate-500 flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">·</span> {el}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {completeness.suggestions && completeness.suggestions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400">
                  Suggested completions — <span className="text-blue-400">click to apply</span>
                </p>
                {completeness.suggestions.map((s, i) => {
                  const isApplied  = appliedIdx === i;
                  const isSelected = selectedSuggestion === i && appliedIdx === null;
                  return (
                    <button
                      key={i}
                      onClick={() => handleSuggestionClick(s, i)}
                      style={{ cursor: 'pointer', transition: 'all 0.15s' }}
                      className={cn(
                        "suggestion-chip w-full text-left rounded-lg border p-3 text-xs font-mono group",
                        "flex items-start gap-2",
                        isApplied
                          ? "border-green-500/60 bg-green-500/10 text-green-300"
                          : isSelected
                            ? "border-blue-500/60 bg-blue-500/10 text-blue-300"
                            : "border-slate-700 bg-slate-900/60 text-slate-400 hover:border-blue-500/40 hover:bg-blue-500/5 hover:text-slate-200",
                      )}
                    >
                      <pre className="whitespace-pre-wrap break-all line-clamp-3 flex-1">{s}</pre>
                      <span className="shrink-0 mt-0.5 transition-transform group-hover:translate-x-0.5">
                        {isApplied
                          ? <Check className="size-3.5 text-green-400" />
                          : <ArrowRight className="size-3.5 text-slate-600 group-hover:text-blue-400" />
                        }
                      </span>
                    </button>
                  );
                })}
                {appliedIdx !== null && (
                  <p className="text-xs text-green-400 flex items-center gap-1">
                    <Check className="size-3" /> Suggestion applied to code
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-600">Waiting…</p>
        )}
      </div>

      {/* ── Success banner (shown after "Use This Code") ── */}
      {successBanner && (
        <div className="shrink-0 flex items-center gap-3 rounded-xl border border-green-500/30 bg-green-500/10 px-5 py-4">
          <Check className="size-5 text-green-400 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-green-300">Code completed successfully — continuing pipeline</p>
            <p className="text-xs text-green-500/70 mt-0.5">Advancing to risk analysis…</p>
          </div>
          <Loader2 className="size-4 text-green-400 animate-spin ml-auto shrink-0" />
        </div>
      )}

      {/* ── AI Chat: complete your code ── */}
      {completeness && !isComplete && !chatHidden && (
        <div className="shrink-0 rounded-xl border border-slate-700 overflow-hidden"
             style={{ background: '#ffffff' }}>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
               style={{ background: '#f8fafc', borderBottom: '1px solid #e5e7eb' }}>
            <div className="flex items-center gap-2">
              <Sparkles className="size-4" style={{ color: '#1e40af' }} />
              <span className="text-sm font-semibold" style={{ color: '#0f1535' }}>
                Complete your code with AI
              </span>
            </div>
            <span className="text-[11px] font-medium px-2.5 py-1 rounded-full"
                  style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
              Powered by GPT-4o
            </span>
          </div>

          {/* Messages */}
          <div id="chat-messages" ref={chatMsgsRef}
               className="flex flex-col gap-2.5 overflow-y-auto"
               style={{ minHeight: 180, maxHeight: 320, padding: 16, background: '#ffffff' }}>

            {chatMsgs.map((msg, idx) => {
              if (msg.kind === 'ai-greeting') return (
                <div key={idx} className="flex items-start gap-2" style={{ maxWidth: '85%' }}>
                  <Bot className="size-4 mt-0.5 shrink-0" style={{ color: '#1e40af' }} />
                  <div className="text-[13px] rounded-[10px] px-3.5 py-2.5"
                       style={{ background: '#f0f6ff', color: '#1e40af', lineHeight: 1.5 }}>
                    I can see your code is incomplete. Tell me what you'd like to add or fix — or click any suggestion above to get started.
                  </div>
                </div>
              );

              if (msg.kind === 'user') return (
                <div key={idx} className="self-end text-[13px] rounded-[10px] px-3.5 py-2.5"
                     style={{ background: '#1e40af', color: '#ffffff', maxWidth: '85%', lineHeight: 1.5 }}>
                  {msg.text}
                </div>
              );

              if (msg.kind === 'typing') return (
                <div key={idx} className="flex items-center gap-2" style={{ maxWidth: '85%' }}>
                  <Bot className="size-4 shrink-0" style={{ color: '#6b7280' }} />
                  <div className="text-[13px] rounded-[10px] px-3.5 py-2.5 flex items-center gap-1.5"
                       style={{ background: '#f8fafc', border: '1px solid #e5e7eb', color: '#6b7280' }}>
                    <span className="animate-pulse">●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>●</span>
                    <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>●</span>
                  </div>
                </div>
              );

              if (msg.kind === 'ai-error') return (
                <div key={idx} className="text-[13px] rounded-[10px] px-3.5 py-2.5"
                     style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', maxWidth: '85%' }}>
                  ⚠ {msg.text}
                </div>
              );

              if (msg.kind === 'ai-response') return (
                <div key={idx} className="flex flex-col gap-2" style={{ maxWidth: '100%' }}>
                  <div className="flex items-start gap-2">
                    <Bot className="size-4 mt-0.5 shrink-0" style={{ color: '#6b7280' }} />
                    <div className="text-[13px] rounded-[10px] px-3.5 py-2.5"
                         style={{ background: '#f8fafc', border: '1px solid #e5e7eb', color: '#0f1535', lineHeight: 1.5, flex: 1 }}>
                      {msg.text}
                      {msg.code && (
                        <pre className="mt-2 overflow-x-auto rounded-lg p-3 text-[11px] leading-relaxed"
                             style={{ background: '#0d1117', color: '#e2e8f0', fontFamily: '"JetBrains Mono", monospace' }}>
                          {msg.code}
                        </pre>
                      )}
                    </div>
                  </div>
                  {msg.code && (
                    <div className="flex items-center gap-2 pl-6">
                      <button
                        onClick={() => useThisCode(msg.code)}
                        className="flex items-center gap-1.5 text-[13px] font-semibold rounded-lg px-3 py-1.5"
                        style={{ background: '#16a34a', color: '#ffffff', border: 'none', cursor: 'pointer' }}>
                        <Check className="size-3.5" /> Use This Code
                      </button>
                      <button
                        onClick={() => regenerateChat(msg.ts)}
                        className="flex items-center gap-1.5 text-[13px] font-medium rounded-lg px-3 py-1.5"
                        style={{ background: '#f8fafc', color: '#374151', border: '1px solid #e5e7eb', cursor: 'pointer' }}>
                        <RotateCcw className="size-3" /> Regenerate
                      </button>
                    </div>
                  )}
                </div>
              );

              return null;
            })}
            <div ref={chatBottomRef} />
          </div>

          {/* Input row */}
          <div className="flex items-end gap-2"
               style={{ borderTop: '1px solid #e5e7eb', padding: '12px 14px', background: '#ffffff' }}>
            <div className="flex-1 flex flex-col gap-1">
              <textarea
                id="user-chat-input"
                rows={2}
                placeholder={"Describe what you want to complete or fix…\ne.g. 'Add error handling to the withdraw method'"}
                value={chatInputText}
                onChange={e => setChatInputText(e.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={chatSending}
                maxLength={500}
                className="w-full resize-none rounded-lg text-[13px] outline-none transition-all disabled:opacity-50"
                style={{
                  border: '1px solid #e5e7eb',
                  padding: '8px 12px',
                  fontFamily: 'inherit',
                  color: '#0f1535',
                  background: '#ffffff',
                  lineHeight: 1.5,
                }}
                onFocus={e => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)'; }}
                onBlur={e =>  { e.target.style.borderColor = '#e5e7eb'; e.target.style.boxShadow = 'none'; }}
              />
              <span className="text-[11px]" style={{ color: '#9ca3af', textAlign: 'right' }}>
                {chatInputText.length} / 500 · Shift+Enter for newline
              </span>
            </div>
            <button
              id="chat-send-btn"
              onClick={sendUserPrompt}
              disabled={chatSending || !chatInputText.trim()}
              className="flex items-center gap-1.5 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40"
              style={{ background: '#1e40af', color: '#ffffff', border: 'none', padding: '8px 16px', cursor: 'pointer', whiteSpace: 'nowrap', alignSelf: 'flex-end', marginBottom: 22 }}
              onMouseEnter={e => { if (!chatSending) (e.target as HTMLButtonElement).style.background = '#1d4ed8'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = '#1e40af'; }}
            >
              {chatSending
                ? <><Loader2 className="size-3.5 animate-spin" /> Generating…</>
                : <><Send className="size-3.5" /> Generate ↗</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Pseudocode card */}
      <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-800/50 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-purple-500/20 text-purple-400 text-xs font-bold">2</div>
            <h3 className="text-sm font-semibold text-slate-200">Pseudocode Description</h3>
          </div>
          {pseudocode && !pseudocodeStreaming && sessionId && (
            <button
              onClick={() => onRegenerate(code, sessionId, userStory)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              <RotateCcw className="size-3" /> Regenerate
            </button>
          )}
        </div>

        {!pseudocode && pseudocodeStreaming && (
          <div className="flex items-center gap-2 text-sm text-slate-400 mb-3">
            <Loader2 className="size-4 animate-spin text-purple-400" />
            <span>Generating pseudocode…</span>
          </div>
        )}

        {pseudocode ? (
          <div className="relative">
            <pre
              className="whitespace-pre-wrap text-xs leading-relaxed overflow-y-auto rounded-lg bg-slate-900/60 p-4 border border-slate-700"
              style={{
                fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
                minHeight: '400px',
                maxHeight: '60vh',
              }}
            >
              {pseudocode.split('\n').map((line, i, arr) => (
                <span key={i}>
                  {tokenizeLine(line).map((seg, j) => (
                    <span key={j} style={{ color: seg.color }}>{seg.text}</span>
                  ))}
                  {i < arr.length - 1 && '\n'}
                </span>
              ))}
              {pseudocodeStreaming && (
                <span className="animate-pulse" style={{ color: PC.keyword }}>▊</span>
              )}
            </pre>
            {/* bottom gradient + scroll hint when content is long */}
            {pseudocode.split('\n').length > 20 && (
              <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex flex-col items-center pb-1 rounded-b-lg"
                   style={{ background: 'linear-gradient(to top, rgba(2,6,23,0.85) 0%, transparent 100%)', height: '2.5rem' }}>
                <ChevronsDown className="size-3.5 text-slate-500 mt-auto mb-0.5" />
              </div>
            )}
          </div>
        ) : !pseudocodeStreaming && sessionId ? (
          <p className="text-xs text-slate-600">Pseudocode will appear here after session is created.</p>
        ) : null}
      </div>

      {/* Actions */}
      <div className="shrink-0 pt-2 flex items-center justify-between gap-4 flex-wrap">
        <Button
          variant="outline"
          size="sm"
          onClick={onEditCode}
          className="border-slate-700 text-slate-400 hover:bg-slate-800"
        >
          ← Edit Code
        </Button>
        <Button
          onClick={onApprove}
          disabled={!completeness || pseudocodeStreaming}
          className="bg-blue-600 hover:bg-blue-500 text-white border-0 px-6 shadow-md shadow-blue-600/20 disabled:opacity-40"
        >
          {pseudocodeStreaming
            ? <><Loader2 className="size-4 animate-spin mr-1.5" />Generating…</>
            : <>Approve & Analyze Risk <ChevronRight className="size-4 ml-1" /></>
          }
        </Button>
      </div>
    </div>
  );
}
