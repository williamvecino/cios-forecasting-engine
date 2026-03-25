import type { WorkflowStep } from "@/types";
import { cn } from "@/lib/cn";

const steps: Array<{ id: WorkflowStep; label: string }> = [
  { id: "question", label: "Define Question" },
  { id: "adopters", label: "Identify Adopters" },
  { id: "events", label: "Monitor Events" },
  { id: "detection", label: "Detect Signals" },
  { id: "review", label: "Validate Signals" },
  { id: "forecast", label: "Update Forecast" },
  { id: "learning", label: "Learn" },
];

export default function WorkflowIndicator({ current }: { current: WorkflowStep }) {
  return (
    <div className="mb-6 flex flex-wrap gap-2">
      {steps.map((step, idx) => (
        <div key={step.id} className="flex items-center gap-2">
          <div
            className={cn(
              "rounded-xl border px-3 py-2 text-sm transition-all",
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
