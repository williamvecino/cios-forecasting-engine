import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, TrendingUp, Shield, Swords, Settings } from "lucide-react";

type MechanismGroup = "economic_pressure" | "structural_protection" | "competitive_threat" | "execution_change";

const MECHANISM_LABELS: Record<MechanismGroup, string> = {
  economic_pressure: "Economic Pressure",
  structural_protection: "Structural Protection",
  competitive_threat: "Competitive Threat",
  execution_change: "Execution Change",
};

const MECHANISM_ICONS: Record<MechanismGroup, React.ElementType> = {
  economic_pressure: TrendingUp,
  structural_protection: Shield,
  competitive_threat: Swords,
  execution_change: Settings,
};

const MECHANISM_STYLES: Record<MechanismGroup, { border: string; bg: string; text: string; dot: string }> = {
  economic_pressure: { border: "border-amber-500/20", bg: "bg-amber-500/5", text: "text-amber-400", dot: "bg-amber-400" },
  structural_protection: { border: "border-blue-500/20", bg: "bg-blue-500/5", text: "text-blue-400", dot: "bg-blue-400" },
  competitive_threat: { border: "border-red-500/20", bg: "bg-red-500/5", text: "text-red-400", dot: "bg-red-400" },
  execution_change: { border: "border-emerald-500/20", bg: "bg-emerald-500/5", text: "text-emerald-400", dot: "bg-emerald-400" },
};

const ALL_GROUPS: MechanismGroup[] = ["economic_pressure", "structural_protection", "competitive_threat", "execution_change"];

interface SignalMapItem {
  id: string;
  text: string;
  mechanism_group?: MechanismGroup;
  driver_role?: string;
  accepted: boolean;
}

export default function SignalMapPanel({ signals }: { signals: SignalMapItem[] }) {
  const [collapsed, setCollapsed] = useState(false);

  const grouped = useMemo(() => {
    const map: Record<MechanismGroup, SignalMapItem[]> = {
      economic_pressure: [],
      structural_protection: [],
      competitive_threat: [],
      execution_change: [],
    };
    for (const sig of signals) {
      const group = sig.mechanism_group || "execution_change";
      if (map[group]) map[group].push(sig);
    }
    return map;
  }, [signals]);

  if (signals.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex items-center justify-between w-full text-left"
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
          <h2 className="text-sm font-bold text-foreground">Signal Map</h2>
          <span className="text-xs text-muted-foreground">Grouped by mechanism</span>
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {ALL_GROUPS.map((group) => {
            const items = grouped[group];
            const style = MECHANISM_STYLES[group];
            const Icon = MECHANISM_ICONS[group];
            return (
              <div key={group} className={`rounded-xl border ${style.border} ${style.bg} p-4 space-y-2`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${style.text}`} />
                  <span className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
                    {MECHANISM_LABELS[group]}
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">{items.length}</span>
                </div>
                {items.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground/60 italic">No signals in this category</div>
                ) : (
                  <div className="space-y-1.5">
                    {items.map((sig) => (
                      <div key={sig.id} className="flex items-start gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${style.dot} mt-1.5 shrink-0`} />
                        <div className="text-[11px] text-foreground/80 leading-relaxed">
                          {sig.text.length > 80 ? sig.text.slice(0, 80) + "…" : sig.text}
                          {!sig.accepted && (
                            <span className="text-muted-foreground/50 ml-1">(pending)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
