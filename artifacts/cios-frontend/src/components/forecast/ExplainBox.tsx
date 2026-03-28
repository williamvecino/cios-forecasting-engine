import { memo, useState, useRef, useEffect } from "react";
import { Send, X, Sparkles, ArrowUpRight, ArrowDownRight, Tag, FileText, AlertCircle, HelpCircle, FlaskConical, Wrench, BookOpen } from "lucide-react";
import type { ExecutiveJudgmentResult } from "@/lib/judgment-engine";
import { askCIOS, type CaseAnswer, type CaseContext, type AnswerCategory } from "@/lib/explain-service";

interface ExplainBoxProps {
  judgment: ExecutiveJudgmentResult;
  caseContext: CaseContext;
}

const categoryIcons: Record<AnswerCategory, typeof Sparkles> = {
  explanation: HelpCircle,
  counterfactual: FlaskConical,
  resolution: Wrench,
  interpretation: BookOpen,
  unanswerable: AlertCircle,
};

const categoryColors: Record<AnswerCategory, string> = {
  explanation: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  counterfactual: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  resolution: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  interpretation: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
  unanswerable: "text-slate-400 bg-slate-500/10 border-slate-500/20",
};

const ExplainBox = memo(function ExplainBox({ judgment, caseContext }: ExplainBoxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<{ question: string; answer: CaseAnswer }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  function submitQuestion(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;
    const answer = askCIOS(trimmed, judgment, caseContext);
    setEntries(prev => [...prev, { question: trimmed, answer }]);
    setQuery("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitQuestion(query);
  }

  const suggestions = [
    "Why is the forecast this value?",
    "What should be addressed first?",
    "What happens if the top constraint improves?",
    "What does this term mean here?",
  ];

  return (
    <div className="fixed top-20 right-4 z-40" style={{ maxWidth: "420px", width: "100%" }}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-indigo-600/90 hover:bg-indigo-600 border border-indigo-500/30 px-4 py-2.5 text-sm font-medium text-white shadow-lg backdrop-blur-sm transition-colors"
        >
          <Sparkles className="w-4 h-4" />
          Ask CIOS
        </button>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#0A1736]/95 backdrop-blur-md shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "560px" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-indigo-600/10">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Ask about this case</span>
            </div>
            <button onClick={() => setIsOpen(false)} className="rounded-lg p-1 hover:bg-white/10 transition-colors">
              <X className="w-3.5 h-3.5 text-slate-400" />
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-4" style={{ maxHeight: "420px" }}>
            {entries.length === 0 && (
              <div className="space-y-3">
                <p className="text-xs text-slate-400 leading-relaxed">Ask anything about this forecast. Answers are grounded in the current case state and audit trail.</p>
                <div className="space-y-1.5">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => submitQuestion(s)}
                      className="w-full text-left rounded-lg bg-white/[0.03] border border-white/5 hover:border-indigo-500/30 hover:bg-indigo-500/5 px-3 py-2 text-[11px] text-slate-300 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {entries.map((entry, i) => {
              const a = entry.answer;
              const CatIcon = categoryIcons[a.category];
              const catColor = categoryColors[a.category];

              return (
                <div key={i} className="space-y-2">
                  <div className="flex justify-end">
                    <div className="rounded-xl bg-indigo-600/20 border border-indigo-500/20 px-3 py-2 max-w-[85%]">
                      <p className="text-xs text-indigo-200">{entry.question}</p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-3 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <div className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${catColor}`}>
                        <CatIcon className="w-3 h-3" />
                        <span className="text-[9px] font-bold uppercase tracking-wider">{a.categoryLabel}</span>
                      </div>
                      <span className="text-[9px] text-slate-500">{a.sourceLabel}</span>
                    </div>

                    <p className="text-xs text-slate-200 leading-relaxed whitespace-pre-line">{a.answer}</p>

                    {a.affectedVariable && a.directionalEffect && (
                      <div className="flex items-center gap-2 rounded-lg bg-amber-500/5 border border-amber-500/10 px-2.5 py-1.5">
                        {a.directionalEffect.startsWith("↑") ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : a.directionalEffect.startsWith("↓") ? (
                          <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                        ) : (
                          <Tag className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-amber-400 mb-0.5">Affected Variable</div>
                          <p className="text-[11px] text-slate-200">{a.affectedVariable}: {a.directionalEffect}</p>
                        </div>
                      </div>
                    )}

                    {a.evidence.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1">
                          <FileText className="w-3 h-3 text-slate-500" />
                          <div className="text-[9px] uppercase tracking-wider text-slate-500">Evidence</div>
                        </div>
                        <div className="space-y-0.5">
                          {a.evidence.slice(0, 6).map((e, ei) => (
                            <div key={ei} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                              <span className="text-slate-500 shrink-0">•</span>
                              <span>{e}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {a.followUp && (
                      <div className={`rounded-lg bg-indigo-500/5 border border-indigo-500/10 px-2.5 py-1.5 ${a.followUpQuery ? "cursor-pointer hover:border-indigo-500/25 hover:bg-indigo-500/10 transition-colors" : ""}`}
                        {...(a.followUpQuery ? { onClick: () => submitQuestion(a.followUpQuery!), role: "button" } : {})}
                      >
                        <div className="text-[9px] uppercase tracking-wider text-indigo-400 mb-0.5">{a.followUpQuery ? "Follow-up" : "Note"}</div>
                        <p className="text-[11px] text-indigo-200 leading-relaxed">{a.followUp}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="px-3 py-2.5 border-t border-white/10">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ask about this case..."
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
export type { ExplainBoxProps };
