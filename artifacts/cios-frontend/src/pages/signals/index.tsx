import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";

export default function SignalsPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();

  return (
    <WorkflowLayout
      currentStep="signals"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 2
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What new information do we have?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            This screen becomes the clean intake layer for signal entry, event
            intake, validation, and future automation. Keep only the question-driven
            action visible.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard
              title="Add signal manually"
              body="Enter a new signal, direction, reliability, and strength."
            />
            <InfoCard
              title="Review incoming events"
              body="Guideline updates, payer shifts, trials, competition, campaign changes."
            />
            <InfoCard
              title="Validate signal quality"
              body="Keep this functional underneath, not as a primary navigation item."
            />
            <InfoCard
              title="Prepare forecast-ready state"
              body="Signals become input to the next step, not a separate destination."
            />
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function InfoCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-2 text-sm text-muted-foreground">{body}</div>
    </div>
  );
}
