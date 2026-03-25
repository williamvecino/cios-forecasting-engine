import type { SignalStatus } from "@/types";
import { cn } from "@/lib/cn";

const states: SignalStatus[] = ["candidate", "reviewed", "validated", "active", "archived", "rejected"];

const labels: Record<SignalStatus, string> = {
  candidate: "Candidate",
  reviewed: "Reviewed",
  validated: "Validated",
  active: "Active",
  archived: "Archived",
  rejected: "Rejected",
};

export default function SignalLifecycleBar({
  current,
}: {
  current?: SignalStatus;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Signal Lifecycle
      </div>
      <div className="flex flex-wrap gap-2">
        {states.map((state) => (
          <div
            key={state}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              current === state
                ? "border-green-500 bg-green-600 text-white"
                : "border-slate-700 bg-slate-900 text-slate-400"
            )}
          >
            {labels[state]}
          </div>
        ))}
      </div>
    </div>
  );
}
