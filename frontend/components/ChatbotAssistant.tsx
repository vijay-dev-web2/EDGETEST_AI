"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  sender: "user" | "bot";
  text: string;
}

const KNOWLEDGE_BASE = [
  {
    keywords: ["language", "languages", "supported", "python", "javascript", "typescript"],
    answer: `EdgeTest AI supports the following languages and testing frameworks natively:

- **Python**: Unit and integration test generation using PyTest.
- **JavaScript**: Unit and integration test generation using Jest or Mocha.
- **TypeScript**: Unit and integration test generation using Vitest or Jest.

**Why it matters:** You can rely on these engines to generate structurally sound, production-ready code.`
  },
  {
    keywords: ["risk score", "high risk", "medium", "low"],
    answer: `The Risk Score is derived automatically from the analyzed code.

- Derived from **code complexity**, **guard clause density**, and **logical branch depth**.
- HIGH risk code triggers deeper test category generation automatically.

**Why it matters:** It ensures your most failure-prone code receives the highest testing priority.`
  },
  {
    keywords: ["traceability", "map", "trace"],
    answer: `The Traceability Map proves what is tested.

- Maps **100% of discovered logical branches** (Happy Path, Negative, Boundary, Exception).
- Connects every single generated test method directly to its source function.

**Why it matters:** It provides total transparency for compliance and code reviews.`
  },
  {
    keywords: ["sandbox", "execution", "run", "docker"],
    answer: `Sandbox execution provides isolated execution runtimes.

- Executes your tests securely in a container.
- Verifies compilation and prevents environment contamination.

**Next step:** Review the terminal output to fix any failed tests.`
  },
  {
    keywords: ["generate", "tests", "generated"],
    answer: `Tests are automatically built from detected risks and functions.

- Edge cases and boundaries are included.
- High-risk scenarios are prioritized first.
- Duplicates are avoided.

**Next step:** Adjust the Maximum Test Cases slider if you need more coverage.`
  },
  {
    keywords: ["export", "report", "pdf", "xlsx", "yaml"],
    answer: `EdgeTest AI provides multiple export formats for different needs.

- **PDF/DOCX:** For summary and management review.
- **XLSX:** For detailed analysis and filtering.
- **JSON/YAML:** For machine-readable CI/CD integration.

**Why it matters:** It seamlessly fits into your existing engineering workflows.`
  },
  {
    keywords: ["smoke test", "smoke"],
    answer: `A smoke test is a basic test to verify that the most crucial functions work.

- It doesn't test edge cases.
- It acts as a quick health check.

**Why it matters:** It saves time by catching major breakages immediately.`
  },
  {
    keywords: ["boundary", "edge case"],
    answer: `A boundary test checks behavior at the extreme limits of input ranges.

- Tests values just below, at, and just above a limit (e.g., N-1, N, N+1).
- Often catches off-by-one errors.

**Why it matters:** Most bugs occur at the boundaries of data structures or logic limits.`
  },
  {
    keywords: ["null", "empty", "zero", "division"],
    answer: `Negative tests verify how the system handles invalid or unexpected inputs.

- **Null/Empty:** Tests missing data.
- **Division by zero:** Tests math exceptions.

**Why it matters:** It ensures the system degrades gracefully without crashing.`
  }
];

const SUGGESTIONS = [
  "What is risk score?",
  "Explain traceability map",
  "How are tests generated?",
  "What does sandbox execution do?",
  "What is a smoke test?"
];

export function ChatbotAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          sender: "bot",
          text: `Hi, I’m your EdgeTest AI Assistant.

I can help you with:
- platform steps
- testing concepts
- risk score meaning
- traceability and reports

Ask a question or pick a quick option.`
        }
      ]);
    }
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isTyping]);

  const handleSend = (text: string) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), sender: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      let botResponse = `I’m not fully sure about that yet.

Try asking in one of these ways:
- Explain risk score
- Explain traceability map
- Explain sandbox execution
- Explain smoke test`;

      const lowerInput = text.toLowerCase();
      for (const item of KNOWLEDGE_BASE) {
        if (item.keywords.some((kw) => lowerInput.includes(kw))) {
          botResponse = item.answer;
          break;
        }
      }

      const botMsg: ChatMessage = { id: (Date.now() + 1).toString(), sender: "bot", text: botResponse };
      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 800);
  };

  const renderText = (text: string) => {
    return text.split("\n").map((line, i) => {
      if (line.startsWith("- ")) {
        return <li key={i} className="ml-4 list-disc mt-1" dangerouslySetInnerHTML={{ __html: line.substring(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
      }
      if (line.trim() === "") {
        return <br key={i} />;
      }
      return <p key={i} className="mt-1" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
    });
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg shadow-blue-600/30 transition-transform hover:scale-110",
          isOpen && "hidden"
        )}
        aria-label="Open Help Assistant"
      >
        <MessageCircle className="h-6 w-6" />
      </button>

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-50 flex h-[550px] max-h-[85vh] w-[360px] max-w-[calc(100vw-48px)] flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          
          {/* Header */}
          <div className="flex items-center justify-between bg-slate-800 px-4 py-3 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-500/20 text-blue-400">
                <Bot className="h-4 w-4" />
              </div>
              <span className="font-semibold text-slate-100 text-sm">EdgeTest AI Assistant</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-200 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-900/50">
            {messages.map((msg) => (
              <div key={msg.id} className={cn("flex gap-3", msg.sender === "user" ? "justify-end" : "justify-start")}>
                {msg.sender === "bot" && (
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 mt-1">
                    <Bot className="h-3 w-3 text-blue-400" />
                  </div>
                )}
                <div
                  className={cn(
                    "rounded-2xl px-4 py-2.5 text-[13px] leading-relaxed max-w-[85%]",
                    msg.sender === "user"
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700"
                  )}
                >
                  {renderText(msg.text)}
                </div>
              </div>
            ))}
            
            {isTyping && (
              <div className="flex gap-3 justify-start">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 mt-1">
                  <Bot className="h-3 w-3 text-blue-400" />
                </div>
                <div className="rounded-2xl px-4 py-3 bg-slate-800 text-slate-200 rounded-tl-sm border border-slate-700 flex items-center gap-1.5">
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" />
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0.2s" }} />
                  <div className="h-1.5 w-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0.4s" }} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggestions */}
          {!isTyping && messages[messages.length - 1]?.sender === "bot" && (
            <div className="px-4 pb-2 pt-1 flex flex-wrap gap-2 overflow-x-auto bg-slate-900/50 scrollbar-none">
              {SUGGESTIONS.map((sug) => (
                <button
                  key={sug}
                  onClick={() => handleSend(sug)}
                  className="whitespace-nowrap rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  {sug}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 bg-slate-800 border-t border-slate-700">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about EdgeTest AI..."
                className="flex-1 rounded-full border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-slate-200 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-500"
              />
              <button
                type="submit"
                disabled={!input.trim() || isTyping}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4 ml-[-2px] mt-[1px]" />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
