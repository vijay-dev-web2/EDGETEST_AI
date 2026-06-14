"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Play, FileCode2, Lock, Unlock, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TestFile } from "@/lib/backendApi";
import type { Language } from "@/hooks/useAnalysis";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Props {
  generatedFiles: TestFile[];
  editingTests: boolean;
  sessionId: string | null;
  language: Language;
  isDemoMode?: boolean;
  onSetEditing: (v: boolean) => void;
  onUpdateFile: (idx: number, code: string) => void;
  onRunTests: (sessionId: string, language: Language) => void;
}

export function Step5GeneratedTests({
  generatedFiles, editingTests, sessionId, language, isDemoMode,
  onSetEditing, onUpdateFile, onRunTests,
}: Props) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  // Demo: auto-run sandbox when files arrive
  useEffect(() => {
    if (isDemoMode && generatedFiles.length > 0 && sessionId) {
      const t = setTimeout(() => onRunTests(sessionId, language), 1000);
      return () => clearTimeout(t);
    }
  }, [isDemoMode, generatedFiles.length, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (generatedFiles.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-zinc-600 text-sm">No test files generated yet.</p>
      </div>
    );
  }

  const safeIdx = Math.min(activeTab, generatedFiles.length - 1);
  const activeFile = generatedFiles[safeIdx];
  const monacoLang = activeFile.language === "typescript" ? "typescript" : activeFile.language === "javascript" ? "javascript" : "python";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(activeFile.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard API not available
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="shrink-0 flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-zinc-100">Generated Test Code</h2>
          <p className="text-sm text-zinc-500">
            {generatedFiles.length} file{generatedFiles.length !== 1 ? "s" : ""} generated ·{" "}
            {editingTests ? <span className="text-yellow-400">Editing mode</span> : <span className="text-zinc-500">Read-only</span>}
          </p>
        </div>
        <div className="flex gap-2">
          {/* Copy to clipboard */}
          <Button
            variant="outline"
            onClick={handleCopy}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800 gap-1.5"
          >
            {copied ? <><Check className="size-4 text-green-400" />Copied!</> : <><Copy className="size-4" />Copy</>}
          </Button>

          <Button
            variant="outline"
            onClick={() => onSetEditing(!editingTests)}
            className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {editingTests ? <><Lock className="size-4 mr-1.5" />Lock</> : <><Unlock className="size-4 mr-1.5" />Edit Tests</>}
          </Button>
          <Button
            onClick={() => sessionId && onRunTests(sessionId, language)}
            disabled={!sessionId}
            className="bg-green-600 hover:bg-green-500 text-white border-0 shadow-md shadow-green-600/20"
          >
            <Play className="size-4 mr-1.5" /> Run Tests
          </Button>
        </div>
      </div>

      {/* File tabs */}
      {generatedFiles.length > 1 && (
        <div className="shrink-0 flex gap-1 overflow-x-auto pb-0.5">
          {generatedFiles.map((f, i) => (
            <button
              key={i}
              onClick={() => { setActiveTab(i); setCopied(false); }}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-all",
                safeIdx === i
                  ? "bg-zinc-700/80 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60",
              )}
            >
              <FileCode2 className="size-3.5" />
              {f.filename}
            </button>
          ))}
        </div>
      )}

      {generatedFiles.length === 1 && (
        <div className="shrink-0 flex items-center gap-1.5 text-sm text-zinc-400">
          <FileCode2 className="size-3.5" />
          <span className="font-mono">{activeFile.filename}</span>
        </div>
      )}

      <div className={cn("flex-1 min-h-0 overflow-hidden rounded-xl border shadow-xl transition-colors",
        editingTests ? "border-yellow-500/30" : "border-zinc-800")}>
        <MonacoEditor
          key={`${safeIdx}-${editingTests}`}
          height="100%"
          language={monacoLang}
          theme="vs-dark"
          value={activeFile.code}
          onChange={(v) => editingTests && onUpdateFile(safeIdx, v ?? "")}
          options={{
            readOnly: !editingTests,
            fontSize: 13,
            fontFamily: "'Geist Mono', 'JetBrains Mono', monospace",
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            lineNumbers: "on",
            wordWrap: "on",
            smoothScrolling: true,
            renderLineHighlight: editingTests ? "line" : "none",
          }}
        />
      </div>
    </div>
  );
}
