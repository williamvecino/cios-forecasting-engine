import { Link } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";

export default function ForecastPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();

  return (
    <WorkflowLayout
      currentStep="forecast"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate
        activeQuestion={activeQuestion}
        title="An active question is required"
        body="Forecasts must be generated in the context of a defined question."
      >
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 3
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              What is likely to happen?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              This is the visible forecast surface: probability, drivers, timing,
              and summary. System health and tracking stay accessible, but secondary.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <ForecastCard label="Probability" value="—" body="Primary forecast output." />
              <ForecastCard label="Key Drivers" value="—" body="Main factors moving the forecast." />
              <ForecastCard label="Timing" value="—" body="When the shift is likely to occur." />
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold text-foreground">What comes next</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Once the forecast is visible, the next layer helps convert that output into action:
              who to target, what blocks movement, when to act, and what competitive risks to watch.
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {[
                "Adoption Segmentation",
                "Barrier Diagnosis",
                "Readiness Timeline",
                "Competitive Risk",
                "Growth Feasibility",
              ].map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-muted/20 px-3 py-1 text-xs text-muted-foreground"
                >
                  {item}
                </span>
              ))}
            </div>

            <Link
              href="/decide"
              className="mt-5 inline-flex rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-500"
            >
              Go to Decide
            </Link>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-sm font-semibold text-foreground">
              Advanced forecast tools
            </div>
            <div className="mt-2 text-sm text-muted-foreground">
              Keep these accessible without crowding the main workflow.
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/forecast-ledger"
                className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
              >
                Forecast Ledger
              </Link>
              <Link
                href="/calibration"
                className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
              >
                Calibration
              </Link>
              <Link
                href="/workbench"
                className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
              >
                Workbench
              </Link>
            </div>
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function ForecastCard({
  label,
  value,
  body,
}: {
  label: string;
  value: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/10 p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-foreground">{value}</div>
      <div className="mt-2 text-sm text-muted-foreground/70">{body}</div>
    </div>
  );
}
