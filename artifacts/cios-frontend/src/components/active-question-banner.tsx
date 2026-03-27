import type { ActiveQuestion } from "../lib/workflow";

interface Props {
  activeQuestion: ActiveQuestion | null;
  onClear: () => void;
}

export default function ActiveQuestionBanner({ activeQuestion, onClear }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Active Question
          </div>

          {activeQuestion ? (
            <>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {activeQuestion.text}
              </div>
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
          ) : (
            <>
              <div className="mt-2 text-sm text-muted-foreground">
                No question is active yet.
              </div>
              <div className="mt-2 text-sm text-muted-foreground/70">
                Start with your own case or open <span className="text-foreground/80">See Mock Case</span> to explore the workflow.
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
            Clear Question
          </button>
        )}
      </div>
    </div>
  );
}
