"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PseudocodePanelProps {
  /** Set to a URL to begin streaming; null = idle state. */
  streamUrl: string | null;
  onApprove: () => void;
  onRegenerate: () => void;
}

type Status = "idle" | "streaming" | "done" | "error";

export default function PseudocodePanel({
  streamUrl,
  onApprove,
  onRegenerate,
}: PseudocodePanelProps) {
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const scrollRef = useRef<HTMLPreElement>(null);

  // Start/restart SSE stream whenever streamUrl changes
  useEffect(() => {
    if (!streamUrl) {
      setContent("");
      setStatus("idle");
      return;
    }

    setContent("");
    setStatus("streaming");

    const es = new EventSource(streamUrl);

    es.onmessage = (event: MessageEvent<string>) => {
      setContent((prev) => prev + event.data);
    };

    es.addEventListener("done", () => {
      setStatus("done");
      es.close();
    });

    es.onerror = () => {
      setStatus("done");
      es.close();
    };

    return () => {
      es.close();
    };
  }, [streamUrl]);

  // Auto-scroll to bottom as content arrives
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [content]);

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-200">Pseudocode</h2>
        <StatusBadge status={status} />
      </div>

      {/* Code block */}
      <div className="relative min-h-[180px] overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
        {status === "idle" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-sm text-zinc-600">Waiting to start analysis…</p>
          </div>
        )}

        <pre
          ref={scrollRef}
          className="h-full max-h-[400px] overflow-y-auto p-4 text-sm leading-relaxed text-zinc-300 font-mono whitespace-pre-wrap break-words"
        >
          {content}
          {status === "streaming" && (
            <span className="ml-0.5 inline-block h-[1.1em] w-2 translate-y-[2px] animate-pulse rounded-sm bg-blue-400" />
          )}
        </pre>
      </div>

      {/* Actions — shown after stream ends */}
      <div
        className={cn(
          "flex gap-3 transition-all duration-300",
          status === "done" ? "opacity-100 translate-y-0" : "pointer-events-none opacity-0 translate-y-1"
        )}
      >
        <Button
          onClick={onApprove}
          className="flex-1 bg-emerald-600 text-white hover:bg-emerald-500 border-0 shadow-md shadow-emerald-600/20 transition-colors"
          size="lg"
        >
          <CheckCircle2 className="size-4" />
          Approve
        </Button>
        <Button
          onClick={onRegenerate}
          variant="outline"
          size="lg"
          className="flex-1 border-zinc-700 bg-zinc-800/60 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
        >
          <RefreshCw className="size-4" />
          Regenerate
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  if (status === "streaming") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-blue-500/30 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
        <Loader2 className="size-3 animate-spin" />
        Streaming
      </span>
    );
  }
  if (status === "done") {
    return (
      <span className="flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
        <CheckCircle2 className="size-3" />
        Complete
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-400">
        Error
      </span>
    );
  }
  return (
    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-2.5 py-0.5 text-xs font-medium text-zinc-500">
      Idle
    </span>
  );
}
