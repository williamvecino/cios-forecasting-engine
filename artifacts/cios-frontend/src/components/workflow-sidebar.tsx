import { Link, useLocation } from "wouter";
import type { WorkflowStep } from "../lib/workflow";
import { getWorkflowSteps } from "../lib/workflow";

interface Props {
  currentStep: WorkflowStep;
  hasActiveQuestion: boolean;
  onToggleAdvanced?: () => void;
  onOpenMockCase: () => void;
}

export default function WorkflowSidebar({
  currentStep,
  hasActiveQuestion,
  onOpenMockCase,
}: Props) {
  const steps = getWorkflowSteps();
  const [location] = useLocation();

  return (
    <aside className="w-full rounded-2xl border border-border bg-card p-5 lg:w-[300px] shrink-0">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Workflow
      </div>
      <div className="mt-2 text-sm text-muted-foreground/70">
        Simple guided path. System complexity stays in the background.
      </div>

      <div className="mt-6 space-y-3">
        {steps.map((step) => {
          const gated =
            !hasActiveQuestion &&
            (step.key === "signals" || step.key === "forecast" || step.key === "decide");

          const isActive = location === step.path || currentStep === step.key;

          return (
            <Link
              key={step.key}
              href={step.path}
              className={[
                "block rounded-xl border px-4 py-4 transition",
                isActive
                  ? "border-primary/60 bg-primary/10"
                  : "border-border bg-muted/10 hover:border-border/80 hover:bg-muted/20",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{step.label}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{step.description}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-6 space-y-3 border-t border-border pt-5">
        <button
          type="button"
          onClick={onOpenMockCase}
          className="w-full rounded-xl border border-border bg-muted/10 px-4 py-3 text-left text-sm font-medium text-muted-foreground hover:border-border/80 hover:bg-muted/20"
        >
          See Mock Case
        </button>
      </div>
    </aside>
  );
}
