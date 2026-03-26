import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";

export default function DecidePage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();

  return (
    <WorkflowLayout
      currentStep="decide"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate
        activeQuestion={activeQuestion}
        title="An active question is required"
        body="Decision tools should only activate once a question and forecast context exist."
      >
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 4
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What action should we take?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This step will hold the commercial decision panels. The primary view
            should stay action-oriented, not module-oriented.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <DecisionPanelCard
              title="Adoption Segmentation"
              body="Who is likely to move first and when."
            />
            <DecisionPanelCard
              title="Barrier Diagnosis"
              body="What is blocking adoption or behavior change."
            />
            <DecisionPanelCard
              title="Readiness Timeline"
              body="When the market can realistically shift."
            />
            <DecisionPanelCard
              title="Competitive Risk"
              body="What competitors are likely to do next."
            />
            <DecisionPanelCard
              title="Growth Feasibility"
              body="Whether expansion can translate into revenue."
            />
            <DecisionPanelCard
              title="Actors / Segments"
              body="Advanced layer for market-research simulation and later reaction testing."
              advanced
            />
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function DecisionPanelCard({
  title,
  body,
  advanced = false,
}: {
  title: string;
  body: string;
  advanced?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        {advanced && (
          <span className="rounded-full bg-muted/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Advanced
          </span>
        )}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
