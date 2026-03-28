import { memo } from "react";

interface EventGate {
  gate_id: string;
  gate_label: string;
  status: string;
  constrains_probability_to: number;
}

const gateStatusColor: Record<string, string> = {
  strong: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30",
  moderate: "text-amber-400 bg-amber-500/15 border-amber-500/30",
  weak: "text-red-400 bg-red-500/15 border-red-500/30",
  unresolved: "text-slate-400 bg-slate-500/15 border-slate-500/30",
};

const gateStatusIcon: Record<string, string> = {
  strong: "\u25CF",
  moderate: "\u25D0",
  weak: "\u25CB",
  unresolved: "?",
};

interface ForecastMeaningPanelProps {
  interpretation: string;
  weakestGate: EventGate | null;
  strongestUnresolved: EventGate | null;
  brandPct: number;
}

export const ForecastMeaningPanel = memo(function ForecastMeaningPanel({
  interpretation,
  weakestGate,
  strongestUnresolved,
  brandPct,
}: ForecastMeaningPanelProps) {
  return (
    <div className="rounded-3xl border border-indigo-500/20 bg-[#0A1736] p-6 space-y-5">
      <div className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wider">Forecast Meaning</div>

      <div className="space-y-1">
        <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Interpretation</div>
        <p className="text-sm text-slate-200 leading-relaxed">{interpretation}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 space-y-1">
          <div className="text-[10px] text-red-400 font-semibold uppercase tracking-wider">Primary Constraint</div>
          <div className="text-sm font-semibold text-white">{weakestGate?.gate_label || "\u2014"}</div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${gateStatusColor[weakestGate?.status || "unresolved"]}`}>
              {gateStatusIcon[weakestGate?.status || "unresolved"]} {weakestGate?.status || "unresolved"}
            </span>
            {weakestGate?.constrains_probability_to != null && (
              <span className="text-[10px] text-slate-500">caps at {Math.round(weakestGate.constrains_probability_to * 100)}%</span>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1">
          <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">What Would Change the Forecast</div>
          <div className="text-sm font-semibold text-white">{strongestUnresolved?.gate_label || "\u2014"}</div>
          {strongestUnresolved && (
            <div className="text-[10px] text-slate-400 leading-snug">
              Resolving this gate could raise the forecast to ~{Math.min(Math.round((strongestUnresolved.constrains_probability_to ?? 0.5) * 100 + 15), brandPct)}%
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
