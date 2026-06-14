"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCheck, RefreshCw, Edit3, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  code: string;
  sessionId: string | null;
  pseudocode: string;
  streaming: boolean;
  approved: boolean;
  editing: boolean;
  isDemoMode?: boolean;
  onStartStream: (code: string, sessionId: string) => void;
  onApprove: () => void;
  onSetEditing: (v: boolean) => void;
  onUpdatePseudocode: (text: string) => void;
  onRegenerate: (code: string, sessionId: string) => void;
}

export function Step3Pseudocode({
  code, sessionId, pseudocode, streaming, approved, editing, isDemoMode,
  onStartStream, onApprove, onSetEditing, onUpdatePseudocode, onRegenerate,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!started.current && sessionId && !pseudocode && !streaming) {
      started.current = true;
      onStartStream(code, sessionId);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo: auto-approve when streaming finishes
  useEffect(() => {
    if (isDemoMode && !streaming && pseudocode.length > 0 && !approved) {
      const t = setTimeout(() => onApprove(), 1200);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, streaming, pseudocode.length, approved]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll during streaming
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [pseudocode]);

  const doneStreaming = !streaming && pseudocode.length > 0;

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 space-y-1">
        <h2 className="text-lg font-semibold text-zinc-100">Pseudocode Review</h2>
        <p className="text-sm text-zinc-500">AI-generated English representation of your code logic. Approve before generating tests.</p>
      </div>

      {/* Streaming indicator */}
      {streaming && (
        <div className="shrink-0 flex items-center gap-2 text-sm text-blue-400">
          <Loader2 className="size-4 animate-spin" />
          Generating pseudocode…
        </div>
      )}

      {/* Pseudocode display / edit area */}
      <div className="flex-1 min-h-0 rounded-xl border border-zinc-800 bg-zinc-900/50 overflow-hidden">
        {editing ? (
          <textarea
            value={pseudocode}
            onChange={(e) => onUpdatePseudocode(e.target.value)}
            className="w-full h-full resize-none bg-transparent p-4 text-sm text-zinc-200 font-mono leading-relaxed focus:outline-none"
            spellCheck={false}
          />
        ) : (
          <div className="h-full overflow-y-auto p-4">
            {pseudocode ? (
              <>
                <pre className="text-sm text-zinc-200 font-mono leading-relaxed whitespace-pre-wrap">
                  {pseudocode}
                </pre>
                {streaming && (
                  <span className="inline-block size-2 rounded-sm bg-blue-400 animate-pulse ml-0.5" />
                )}
                <div ref={bottomRef} />
              </>
            ) : (
              <div className="flex h-full items-center justify-center">
                <div className="flex items-center gap-2 text-zinc-600 text-sm">
                  <Loader2 className="size-4 animate-spin" />
                  Waiting for stream to start…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons — only show after streaming is done */}
      {doneStreaming && (
        <div className={cn("shrink-0 pt-4 border-t border-zinc-800 flex flex-wrap gap-3", approved && "opacity-60")}>
          {approved ? (
            <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
              <CheckCheck className="size-4" /> Pseudocode approved — proceeding to scenarios
            </div>
          ) : (
            <>
              {editing ? (
                <Button
                  onClick={() => onSetEditing(false)}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Done Editing
                </Button>
              ) : (
                <Button
                  onClick={() => onSetEditing(true)}
                  variant="outline"
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  <Edit3 className="size-4 mr-1.5" /> Edit
                </Button>
              )}

              <Button
                onClick={() => {
                  onUpdatePseudocode("");
                  onRegenerate(code, sessionId!);
                }}
                variant="outline"
                className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                disabled={!sessionId}
              >
                <RefreshCw className="size-4 mr-1.5" /> Regenerate
              </Button>

              <Button
                onClick={onApprove}
                className="bg-green-600 hover:bg-green-500 text-white border-0 ml-auto"
              >
                <Check className="size-4 mr-1.5" /> Approve & Continue
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
