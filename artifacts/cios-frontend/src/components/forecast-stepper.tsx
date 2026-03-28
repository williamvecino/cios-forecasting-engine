import { Link, useLocation } from "wouter";
import { Check } from "lucide-react";

const STEPS = [
  { key: "question", label: "Define Question", path: "/question" },
  { key: "signals", label: "Add Information", path: "/signals" },
  { key: "forecast", label: "Judge", path: "/forecast" },
  { key: "decide", label: "Decide", path: "/decide" },
] as const;

interface Props {
  hasActiveQuestion: boolean;
}

export default function ForecastStepper({ hasActiveQuestion }: Props) {
  const [location] = useLocation();

  const currentIdx = STEPS.findIndex(
    (s) => location.startsWith(s.path)
  );

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {STEPS.map((step, i) => {
        const isActive = location.startsWith(step.path);
        const isCompleted = currentIdx > i;
        const isGated = !hasActiveQuestion && i > 0;

        const className = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition ${
          isActive
            ? "bg-primary/10 text-primary border border-primary/30"
            : isCompleted
              ? "text-primary/70 hover:bg-primary/5"
              : isGated
                ? "text-muted-foreground/40 cursor-not-allowed pointer-events-none"
                : "text-muted-foreground hover:bg-muted/20 hover:text-foreground"
        }`;

        const stepNumber = (
          <span
            className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
              isActive
                ? "bg-primary text-primary-foreground"
                : isCompleted
                  ? "bg-primary/20 text-primary"
                  : "bg-muted/30 text-muted-foreground"
            }`}
          >
            {isCompleted ? <Check className="w-3 h-3" /> : i + 1}
          </span>
        );

        return (
          <div key={step.key} className="flex items-center gap-2">
            {i > 0 && (
              <div
                className={`h-px w-6 ${
                  isCompleted ? "bg-primary/60" : "bg-border"
                }`}
              />
            )}
            {isGated ? (
              <span className={className}>
                {stepNumber}
                {step.label}
              </span>
            ) : (
              <Link href={step.path} className={className}>
                {stepNumber}
                {step.label}
              </Link>
            )}
          </div>
        );
      })}
    </div>
  );
}
