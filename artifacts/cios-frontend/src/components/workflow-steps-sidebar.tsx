import { Link, useLocation } from "wouter";
import { Check, Shield, Activity } from "lucide-react";
import type { WorkflowStep } from "../lib/workflow";

const STEPS = [
  { key: "question", label: "Define Question", path: "/question" },
  { key: "comparison-groups", label: "Define Comparison Groups", path: "/comparison-groups" },
  { key: "signals", label: "Add Information", path: "/signals" },
  { key: "forecast", label: "Judge", path: "/forecast" },
  { key: "decide", label: "Decide", path: "/decide" },
  { key: "respond", label: "Respond", path: "/respond" },
  { key: "simulate", label: "Simulate", path: "/simulate" },
] as const;

interface Props {
  currentStep: WorkflowStep;
  hasActiveQuestion: boolean;
  assumptionCount?: number;
  hasInvalidatedAssumptions?: boolean;
  onOpenAssumptions?: () => void;
}

export default function WorkflowStepsSidebar({
  currentStep,
  hasActiveQuestion,
  assumptionCount = 0,
  hasInvalidatedAssumptions = false,
  onOpenAssumptions,
}: Props) {
  const [location] = useLocation();

  const currentIdx = STEPS.findIndex((s) => location.startsWith(s.path));
  const showDiagnostics = hasActiveQuestion && currentIdx >= 3;

  return (
    <aside className="hidden lg:block w-[220px] shrink-0">
      <div className="sticky top-6 space-y-2">
        {STEPS.map((step, i) => {
          const isActive = location.startsWith(step.path);
          const isCompleted = hasActiveQuestion && currentIdx > i;
          const isGated = !hasActiveQuestion && i > 0;

          const stepNumber = (
            <span
              className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0 ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : isCompleted
                    ? "bg-primary/20 text-primary"
                    : "bg-muted/30 text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </span>
          );

          const className = `flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition w-full ${
            isActive
              ? "bg-primary/10 text-primary border border-primary/30"
              : isCompleted
                ? "text-primary/70 hover:bg-primary/5 border border-transparent"
                : isGated
                  ? "text-muted-foreground/40 cursor-not-allowed border border-transparent"
                  : "text-muted-foreground hover:bg-muted/20 hover:text-foreground border border-transparent"
          }`;

          if (isGated) {
            return (
              <span key={step.key} className={className}>
                {stepNumber}
                {step.label}
              </span>
            );
          }

          return (
            <Link key={step.key} href={step.path} className={className}>
              {stepNumber}
              {step.label}
            </Link>
          );
        })}

        {showDiagnostics && (
          <>
            <div className="pt-3 pb-1 px-3">
              <div className="flex items-center gap-1.5">
                <Activity className="w-3 h-3 text-muted-foreground/40" />
                <span className="text-[10px] font-bold text-muted-foreground/40 uppercase tracking-widest">Diagnostics</span>
              </div>
            </div>
            {onOpenAssumptions && (
              <button
                onClick={onOpenAssumptions}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition w-full text-muted-foreground hover:bg-muted/20 hover:text-foreground border border-transparent"
              >
                <Shield className="w-4 h-4 text-muted-foreground/60" />
                <span className="flex-1 text-left">Assumptions</span>
                {assumptionCount > 0 && (
                  <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
                    {assumptionCount}
                  </span>
                )}
                {hasInvalidatedAssumptions && (
                  <span className="rounded-full bg-rose-400/10 text-rose-400 px-1.5 py-0.5 text-[10px] font-bold">
                    !
                  </span>
                )}
              </button>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
