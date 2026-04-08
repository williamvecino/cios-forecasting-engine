import type { WorkflowStep } from "@/types";
import { cn } from "@/lib/cn";
import { useLocation } from "wouter";

const steps: Array<{ id: WorkflowStep; label: string; route: string }> = [
  { id: "question", label: "Define Question", route: "/question" },
  { id: "adopters", label: "Identify Adopters", route: "/discovery" },
  { id: "events", label: "Monitor Events", route: "/watchlist" },
  { id: "detection", label: "Detect Signals", route: "/review" },
  { id: "review", label: "Validate Signals", route: "/signals" },
  { id: "forecast", label: "Update Forecast", route: "/forecasts" },
  { id: "learning", label: "Learn", route: "/forecast-ledger" },
];

export default function WorkflowIndicator({ current }: { current: WorkflowStep }) {
  const [, setLocation] = useLocation();
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            onClick={() => setLocation(step.route)}
            className={cn(
              "rounded-xl border px-3 py-2 text-sm transition-all cursor-pointer hover:border-blue-400/50",
              current === step.id
                ? "border-blue-500 bg-blue-600 text-white"
                : "border-slate-700 bg-slate-900 text-slate-400"
            )}
          >
            <span className="mr-2 text-slate-300">{idx + 1}</span>
            {step.label}
          </div>
          {idx < steps.length - 1 && <span className="text-slate-600">→</span>}
        </div>
      ))}
    </div>
  );
}
