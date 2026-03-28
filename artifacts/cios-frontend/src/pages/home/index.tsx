import { useState, useEffect, useCallback } from "react";
import { useLocation, Link } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import TopNav from "@/components/top-nav";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { clearCaseState } from "@/lib/workflow";
import {
  ArrowRight,
  Clock,
  Sparkles,
  Target,
} from "lucide-react";

const GOOD_QUESTIONS = [
  "Will community pulmonologists adopt within 12 months?",
  "Will payer restrictions delay uptake by more than 6 months?",
  "Which stakeholder segment is most likely to adopt first?",
  "Will first-line adoption exceed 20% in academic centers?",
  "When will commercial payers begin restricting access?",
];

const AVOID_QUESTIONS = [
  "Will this do well?",
  "What happens in the market?",
  "Will doctors like it?",
];

export default function HomePage() {
  const [, navigate] = useLocation();
  const { data: cases } = useListCases();
  const { activeQuestion, createQuestion } = useActiveQuestion();
  const [input, setInput] = useState(activeQuestion?.text ?? "");
  const [syncedId, setSyncedId] = useState<string | null>(activeQuestion?.caseId ?? null);

  useEffect(() => {
    if (!activeQuestion?.text) return;
    const id = activeQuestion.caseId ?? activeQuestion.id;
    if (id !== syncedId) {
      setInput(activeQuestion.text);
      setSyncedId(id);
    }
  }, [activeQuestion?.text, activeQuestion?.caseId, activeQuestion?.id, syncedId]);

  const allCases = (cases as any[]) || [];
  const recentCases = allCases.slice(0, 5);

  const openCase = useCallback((c: any) => {
    const cid = c.caseId || c.id;
    if (activeQuestion?.caseId === cid) {
      navigate("/signals");
      return;
    }
    const prevCaseId = activeQuestion?.caseId;
    if (prevCaseId && prevCaseId !== cid) {
      clearCaseState(prevCaseId);
    }
    try { localStorage.removeItem("cios.therapeuticArea"); } catch {}
    try { localStorage.removeItem("cios.questionDraft"); } catch {}
    const questionText = c.strategicQuestion || c.assetName || "Untitled";
    createQuestion({
      text: questionText,
      rawInput: c.strategicQuestion || "",
      caseId: cid,
      timeHorizon: c.timeHorizon || "12 months",
      subject: c.assetName || c.primaryBrand || "",
      outcome: c.outcomeDefinition || "adoption",
    });
    if (c.therapeuticArea) {
      try { localStorage.setItem("cios.therapeuticArea", c.therapeuticArea); } catch {}
    }
    navigate("/signals");
  }, [activeQuestion, createQuestion, navigate]);

  function handleStart() {
    if (!input.trim()) return;
    localStorage.setItem("cios.questionDraft", input.trim());
    navigate("/question");
  }

  function handleExampleClick(q: string) {
    setInput(q);
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-7xl px-6 py-10 space-y-12">
        <section className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">
            What do you want to forecast?
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Frame a critical business question and receive a structured forecast with clear decision guidance.
          </p>

          <div className="max-w-2xl mx-auto">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Example: Which regions will adopt first-line ARIKAYCE fastest in 12 months?"
                rows={3}
                className="w-full rounded-2xl border border-border bg-card px-5 py-4 text-foreground placeholder:text-muted-foreground/50 resize-none text-lg"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && input.trim()) {
                    e.preventDefault();
                    handleStart();
                  }
                }}
              />
            </div>
            <button
              type="button"
              onClick={handleStart}
              disabled={!input.trim()}
              className="mt-4 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 text-base"
            >
              Start Forecast
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {activeQuestion && (
          <section className="max-w-2xl mx-auto">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-primary/70 mb-2">
                Continue where you left off
              </div>
              <div className="text-foreground font-medium">{activeQuestion.text}</div>
              <Link
                href="/question"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/20 transition"
              >
                Resume Forecast <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>
        )}

        {recentCases.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Recent Forecasts
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentCases.map((c: any) => {
                const cid = c.caseId || c.id;
                const prob = c.currentProbability;
                return (
                  <button
                    key={cid}
                    type="button"
                    onClick={() => openCase(c)}
                    className="rounded-2xl border border-border bg-card p-5 hover:border-border/80 hover:bg-muted/10 transition space-y-3 text-left"
                  >
                    <div className="text-sm font-medium text-foreground line-clamp-2">
                      {c.strategicQuestion || c.assetName || "Untitled"}
                    </div>
                    <div className="flex items-center gap-3">
                      {prob != null && (
                        <span className="text-lg font-bold text-primary">
                          {Math.round(prob * 100)}%
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground font-mono">{cid}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-blue-400" />
              Good Questions
            </h2>
            <div className="space-y-2">
              {GOOD_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => handleExampleClick(q)}
                  className="w-full rounded-xl border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-left text-sm text-foreground/80 hover:bg-blue-500/10 hover:border-blue-500/30 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              Avoid
            </h2>
            <div className="space-y-2">
              {AVOID_QUESTIONS.map((q) => (
                <div
                  key={q}
                  className="rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground/60 line-through"
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
