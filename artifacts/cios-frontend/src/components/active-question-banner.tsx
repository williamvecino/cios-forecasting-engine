import { Target } from "lucide-react";
import type { ActiveQuestion } from "../lib/workflow";

interface Props {
  activeQuestion: ActiveQuestion | null;
  draftText?: string;
  onClear: () => void;
}

export default function ActiveQuestionBanner({ activeQuestion, draftText, onClear }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Active Question
          </div>

          {activeQuestion ? (
            <>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {activeQuestion.text}
              </div>
              {activeQuestion.outcome && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
                  <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-primary/80 uppercase tracking-wider">Outcome being forecast:</span>
                  <span className="text-xs font-medium text-foreground">{activeQuestion.outcome}</span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted/30 px-3 py-1">
                  ID: {activeQuestion.id}
                </span>
                {activeQuestion.caseId && (
                  <span className="rounded-full bg-muted/30 px-3 py-1 font-mono">
                    Case: {activeQuestion.caseId.length > 12 ? activeQuestion.caseId.slice(0, 8) + "…" : activeQuestion.caseId}
                  </span>
                )}
                {activeQuestion.timeHorizon && (
                  <span className="rounded-full bg-muted/30 px-3 py-1">
                    Horizon: {activeQuestion.timeHorizon}
                  </span>
                )}
              </div>
            </>
          ) : draftText ? (
            <>
              <div className="mt-2 text-lg font-medium text-foreground/80">
                {draftText}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-amber-300">
                  Draft — click Continue to create case
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-sm text-muted-foreground">
                No question is active yet.
              </div>
              <div className="mt-2 text-sm text-muted-foreground/70">
                Type a question below or browse the <a href="/library" className="text-foreground/80 underline underline-offset-2">Library</a> for sample forecasts.
              </div>
            </>
          )}
        </div>

        {activeQuestion && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            New Forecast
          </button>
        )}
      </div>
    </div>
  );
}
