import { memo, useState, useRef, useEffect } from "react";
import { MessageCircleQuestion, Send, X, ChevronDown, ChevronUp } from "lucide-react";
import type { ExecutiveJudgmentResult } from "@/lib/judgment-engine";
import { explain } from "@/lib/explain-service";

interface ExplainBoxProps {
  judgment: ExecutiveJudgmentResult;
}

interface ExplainEntry {
  question: string;
  definition: string;
  currentRelevance: string;
  drivers: string[];
  lever: string | null;
}

const ExplainBox = memo(function ExplainBox({ judgment }: ExplainBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<ExplainEntry[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const judgmentKey = `${judgment.probability}-${judgment.confidence}-${judgment.reasoning.slice(0, 30)}`;

  useEffect(() => {
    setEntries([]);
    setQuery("");
  }, [judgmentKey]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;

    const response = explain(trimmed, judgment);
    setEntries(prev => [...prev, {
      question: trimmed,
      definition: response.definition,
      currentRelevance: response.currentRelevance,
      drivers: response.drivers,
      lever: response.lever,
    }]);
    setQuery("");
  }

  const suggestions = [
    "What does operational readiness mean?",
    "Why is the forecast this number?",
    "What would change the outlook?",
  ];

  return (
    <div className="fixed top-20 right-4 z-40" style={{ maxWidth: "380px" }}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 border border-indigo-500/30 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors"
        >
          <MessageCircleQuestion className="w-4 h-4" />
          Ask the System
        </button>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#0A1736]/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "500px" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-indigo-600/10">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ask the System</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-lg p-1 hover:bg-white/10 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ maxHeight: "350px" }}>
            {entries.length === 0 && (
              <div className="space-y-2">
                <p className="text-xs text-slate-400">Ask about any term, constraint, or forecast element. Answers are grounded in the current case.</p>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        const response = explain(s, judgment);
                        setEntries([{
                          question: s,
                          definition: response.definition,
                          currentRelevance: response.currentRelevance,
                          drivers: response.drivers,
                          lever: response.lever,
                        }]);
                      }}
                      className="w-full text-left rounded-lg bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 px-3 py-2 text-[11px] text-slate-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry, i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-end">
                  <div className="rounded-xl bg-indigo-600/20 border border-indigo-500/20 px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-indigo-200">{entry.question}</p>
                  </div>
                </div>

                <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-3 space-y-2">
                  <p className="text-xs text-slate-200 leading-relaxed">{entry.definition}</p>

                  {entry.currentRelevance && (
                    <div className="rounded-lg bg-cyan-500/5 border border-cyan-500/10 px-2.5 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-cyan-400 mb-0.5">Current Relevance</div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">{entry.currentRelevance}</p>
                    </div>
                  )}

                  {entry.drivers.length > 0 && (
                    <div>
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Drivers</div>
                      <div className="space-y-0.5">
                        {entry.drivers.slice(0, 5).map((d, di) => (
                          <div key={di} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                            <span className="text-slate-500 shrink-0">•</span>
                            <span>{d}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {entry.lever && (
                    <div className="rounded-lg bg-indigo-500/5 border border-indigo-500/10 px-2.5 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-indigo-400 mb-0.5">What Changes the Outlook</div>
                      <p className="text-[11px] text-slate-200 leading-relaxed">{entry.lever}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="px-3 py-2.5 border-t border-white/10">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about any term or output..."
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
              />
              <button
                type="submit"
                disabled={!query.trim()}
                className="rounded-lg bg-indigo-600/80 hover:bg-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed p-2 transition-colors"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
});

export { ExplainBox };
