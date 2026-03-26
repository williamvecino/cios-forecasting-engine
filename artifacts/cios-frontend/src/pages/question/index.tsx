import { useState } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { CheckCircle2, AlertTriangle } from "lucide-react";

const STRONG_EXAMPLES = [
  "Will adoption increase after indication expansion within 12 months?",
  "Which segment is most likely to adopt first after launch?",
  "Will payer restrictions delay uptake in the first year?",
  "Will guideline endorsement shift prescribing behavior?",
  "Will competitor entry materially reduce share within 6 months?",
];

const WEAK_EXAMPLES = [
  "What will happen with this product?",
  "Is this launch going to be successful?",
  "What do doctors think?",
  "How will the market react?",
  "Will this work?",
];

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, clearQuestion } = useActiveQuestion();

  const [questionText, setQuestionText] = useState(activeQuestion?.text ?? "");
  const [caseId, setCaseId] = useState(activeQuestion?.caseId ?? "");
  const [timeHorizon, setTimeHorizon] = useState(
    activeQuestion?.timeHorizon ?? "12 months"
  );

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
      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="flex-1 rounded-2xl border border-border bg-card p-6">
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

            <button
              type="button"
              onClick={handleCreateQuestion}
              disabled={!questionText.trim()}
              className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Continue to Add Information
            </button>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-[300px]">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div className="text-sm font-semibold text-foreground">
                Strong Strategic Questions
              </div>
            </div>
            <div className="space-y-2">
              {STRONG_EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestionText(q)}
                  className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-left text-xs text-foreground/80 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <div className="text-sm font-semibold text-foreground">
                Avoid These Questions
              </div>
            </div>
            <div className="space-y-2">
              {WEAK_EXAMPLES.map((q) => (
                <div
                  key={q}
                  className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
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
