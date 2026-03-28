import { memo } from "react";

interface EventGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
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

interface EventGatesPanelProps {
  gates: EventGate[];
}

export const EventGatesPanel = memo(function EventGatesPanel({ gates }: EventGatesPanelProps) {
  if (gates.length === 0) return null;

  return (
    <div className="rounded-3xl border border-amber-500/20 bg-[#0A1736] p-5 space-y-3">
      <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Event Gates</div>
      <div className="space-y-2">
        {gates.map((gate) => (
          <div key={gate.gate_id} className={`rounded-xl border px-3 py-2.5 ${gateStatusColor[gate.status] || gateStatusColor.unresolved}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold">{gate.gate_label}</span>
              <div className="flex items-center gap-2">
                {typeof gate.constrains_probability_to === "number" && (
                  <span className="text-[10px] opacity-70">
                    Constrains to {"\u2264"}{Math.round(gate.constrains_probability_to * 100)}%
                  </span>
                )}
                <span className="text-[10px] font-bold uppercase flex items-center gap-1">
                  <span>{gateStatusIcon[gate.status] || "?"}</span>
                  {gate.status}
                </span>
              </div>
            </div>
            <div className="mt-1 text-[10px] opacity-80 leading-snug">{gate.reasoning}</div>
          </div>
        ))}
      </div>
    </div>
  );
});
