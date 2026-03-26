import type { ForecastRunState } from "../lib/recalculation-controller";
import { Button } from "@/components/ui/button";

interface Props {
  state: ForecastRunState;
  onRecalculate: () => void;
}

export default function ForecastStabilityPanel({ state, onRecalculate }: Props) {
  const statusColor =
    state.status === "ready"
      ? "text-green-400"
      : state.status === "dirty"
      ? "text-amber-400"
      : state.status === "error"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Forecast Stability
          </div>
          <div className={`mt-2 text-sm font-medium ${statusColor}`}>
            Status: {state.status.toUpperCase()}
          </div>
          {state.dirtyReason && (
            <div className="mt-2 text-sm text-amber-300">
              Recalculation required: {state.dirtyReason}
            </div>
          )}
          {state.errorMessage && (
            <div className="mt-2 text-sm text-red-300">{state.errorMessage}</div>
          )}
          {state.lastOutput && (
            <div className="mt-3 text-xs text-muted-foreground">
              Run ID: {state.lastOutput.runId} | Engine: {state.lastOutput.engineVersion}
            </div>
          )}
        </div>

        <Button onClick={onRecalculate}>
          Recalculate Forecast
        </Button>
      </div>
    </div>
  );
}
