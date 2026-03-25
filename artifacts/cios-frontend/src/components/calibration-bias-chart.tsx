import type { BiasBySignalType } from "../types/forecast";
import { Card } from "./ui-components";
import { cn } from "@/lib/cn";

type Props = {
  rows: BiasBySignalType[];
};

export default function CalibrationBiasChart({ rows }: Props) {
  const displayRows = [...rows].sort((a, b) => a.meanErrorPp - b.meanErrorPp);

  const min = Math.min(-25, ...displayRows.map((r) => r.meanErrorPp));
  const max = Math.max(10, ...displayRows.map((r) => r.meanErrorPp));
  const span = max - min || 1;

  function xPosition(value: number) {
    return `${((value - min) / span) * 100}%`;
  }

  function barWidth(value: number) {
    return `${(Math.abs(value) / span) * 100}%`;
  }

  return (
    <Card>
      <h3 className="text-lg font-bold text-foreground mb-1">Forecast Bias Analysis</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Mean forecast error (pp) in calibrated cases where this signal type was active.
      </p>

      <div className="space-y-3">
        {displayRows.map((row) => {
          const zeroPos = xPosition(0);
          const valuePos = xPosition(row.meanErrorPp);
          const isOverforecast = row.meanErrorPp < 0;

          return (
            <div
              key={row.signalType}
              className="grid items-center gap-3"
              style={{ gridTemplateColumns: "240px 1fr 56px" }}
            >
              <div>
                <div className="text-sm font-semibold text-foreground">{row.label}</div>
                <div className="text-xs text-muted-foreground">
                  {row.n > 0 ? `${row.n} calibrated` : "no calibrated records yet"}
                </div>
              </div>

              <div className="relative h-[26px] rounded-lg bg-muted/30 overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 w-px bg-foreground/25"
                  style={{ left: zeroPos }}
                />

                {row.n > 0 && (
                  <div
                    className={cn(
                      "absolute top-1 bottom-1 rounded-md",
                      isOverforecast ? "bg-warning/90" : "bg-success/90"
                    )}
                    style={{
                      left: isOverforecast ? valuePos : zeroPos,
                      width: barWidth(row.meanErrorPp),
                    }}
                  />
                )}
              </div>

              <div className="text-right text-sm tabular-nums text-foreground">
                {row.n > 0 ? `${row.meanErrorPp.toFixed(1)}pp` : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
