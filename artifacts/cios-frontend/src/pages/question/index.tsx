import { useState } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import MockCaseTour from "@/components/mock-case/mock-case-tour";

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, clearQuestion } = useActiveQuestion();

  const [questionText, setQuestionText] = useState(activeQuestion?.text ?? "");
  const [caseId, setCaseId] = useState(activeQuestion?.caseId ?? "");
  const [timeHorizon, setTimeHorizon] = useState(
    activeQuestion?.timeHorizon ?? "12 months"
  );
  const [tourOpen, setTourOpen] = useState(false);

  function handleCreateQuestion() {
    const text = questionText.trim();
    if (!text) return;

    createQuestion({
      text,
      caseId: caseId.trim() || undefined,
      timeHorizon: timeHorizon.trim() || undefined,
    });

    navigate("/signals");
  }

  return (
    <WorkflowLayout
      currentStep="question"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Step 1
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">
          What are you trying to predict?
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Start with one strategic question. Everything else in the system should
          inherit this context.
        </p>

        <div className="mt-6 space-y-5">
          <Field
            label="Strategic question"
            value={questionText}
            onChange={setQuestionText}
            placeholder="Will adoption increase after indication expansion?"
            multiline
          />

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Field
              label="Case ID"
              value={caseId}
              onChange={setCaseId}
              placeholder="CASE_001"
            />
            <Field
              label="Time horizon"
              value={timeHorizon}
              onChange={setTimeHorizon}
              placeholder="12 months"
            />
          </div>

          <div className="rounded-xl border border-border bg-muted/10 p-4">
            <div className="text-sm font-medium text-foreground">Examples</div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {[
                "Will adoption increase after indication expansion?",
                "Which segment is most likely to move first?",
                "Will this campaign materially change behavior?",
              ].map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setQuestionText(example)}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleCreateQuestion}
              disabled={!questionText.trim()}
              className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to Add Information
            </button>

            <button
              type="button"
              onClick={() => setTourOpen(true)}
              className="rounded-xl border border-border px-5 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
            >
              See demo walkthrough
            </button>
          </div>
        </div>
      </section>

      <MockCaseTour open={tourOpen} onClose={() => setTourOpen(false)} />
    </WorkflowLayout>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50"
        />
      )}
    </div>
  );
}
