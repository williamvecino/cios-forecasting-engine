import { useMemo, useState } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Clock,
} from "lucide-react";

interface DriftField {
  field: string;
  previousValue: string | number | null;
  currentValue: string | number | null;
  severity: "material" | "minor";
}

interface ConsistencyData {
  score: "high" | "moderate" | "low";
  details: string;
}

interface DriftData {
  hasMaterialDrift: boolean;
  driftFields: DriftField[];
  consistencyScore: string;
  message: string | null;
}

interface Snapshot {
  id: string;
  version: number;
  forecastProbability: number;
  forecastDirection: string;
  decisionPattern: string | null;
  primaryConstraint: string | null;
  topDrivers: string[] | null;
  signalCount: number | null;
  driftDetected: boolean;
  consistencyScore: string | null;
  createdAt: string;
}

interface Props {
  consistency: ConsistencyData | null;
  drift: DriftData | null;
  snapshots: Snapshot[];
  loading?: boolean;
}

const scoreConfig = {
  high: {
    icon: ShieldCheck,
    label: "High Consistency",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
    badge: "bg-emerald-500/20 text-emerald-300",
  },
  moderate: {
    icon: AlertTriangle,
    label: "Moderate Consistency",
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20",
    badge: "bg-amber-500/20 text-amber-300",
  },
  low: {
    icon: ShieldAlert,
    label: "Low Consistency",
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20",
    badge: "bg-rose-500/20 text-rose-300",
  },
};

export function ConsistencyPanel({ consistency, drift, snapshots, loading }: Props) {
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [compareA, setCompareA] = useState<number | null>(null);
  const [compareB, setCompareB] = useState<number | null>(null);

  const score = consistency?.score ?? "high";
  const config = scoreConfig[score];
  const Icon = config.icon;

  const comparisonPair = useMemo(() => {
    if (compareA === null || compareB === null) return null;
    const a = snapshots.find((s) => s.version === compareA);
    const b = snapshots.find((s) => s.version === compareB);
    if (!a || !b) return null;
    return { a, b };
  }, [compareA, compareB, snapshots]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
        <div className="h-3 bg-muted rounded w-2/3" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className={`flex items-center justify-between px-4 py-3 border-b ${config.bg}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${config.badge}`}>
            {consistency?.details || "No data"}
          </span>
        </div>
        {snapshots.length > 0 && (
          <button
            onClick={() => setShowSnapshots(!showSnapshots)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            {showSnapshots ? "Hide" : "Show"} History ({snapshots.length})
            {showSnapshots ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {drift?.hasMaterialDrift && (
        <div className="px-4 py-3 border-b border-rose-500/20 bg-rose-500/5">
          <div className="flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-rose-300 font-medium">{drift.message}</p>
              <div className="mt-2 space-y-1">
                {drift.driftFields
                  .filter((d) => d.severity === "material")
                  .map((d, i) => (
                    <div key={i} className="flex items-center gap-2 text-[10px]">
                      <span className="text-muted-foreground w-28 shrink-0">{d.field}</span>
                      <span className="text-rose-300/70 truncate max-w-[120px]">
                        {String(d.previousValue ?? "—")}
                      </span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-rose-300 truncate max-w-[120px]">
                        {String(d.currentValue ?? "—")}
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {showSnapshots && snapshots.length > 0 && (
        <div className="px-4 py-3 space-y-3">
          <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            Run History
          </div>
          <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
            {snapshots.map((snap) => (
              <div
                key={snap.id}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs ${
                  snap.driftDetected
                    ? "bg-rose-500/5 border border-rose-500/20"
                    : "bg-muted/30 border border-transparent"
                }`}
              >
                <span className="text-muted-foreground w-8">v{snap.version}</span>
                <span className="font-mono text-foreground w-12">
                  {(snap.forecastProbability * 100).toFixed(1)}%
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    snap.forecastDirection === "favorable"
                      ? "bg-emerald-500/15 text-emerald-300"
                      : snap.forecastDirection === "unfavorable"
                        ? "bg-rose-500/15 text-rose-300"
                        : "bg-slate-500/15 text-slate-300"
                  }`}
                >
                  {snap.forecastDirection}
                </span>
                <span className="text-muted-foreground">{snap.signalCount ?? 0} signals</span>
                {snap.driftDetected && (
                  <span className="text-[10px] text-rose-400 ml-auto">drift</span>
                )}
                <div className="ml-auto flex gap-1">
                  <button
                    onClick={() => setCompareA(snap.version)}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      compareA === snap.version
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    A
                  </button>
                  <button
                    onClick={() => setCompareB(snap.version)}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      compareB === snap.version
                        ? "bg-blue-500/20 text-blue-300"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    B
                  </button>
                </div>
              </div>
            ))}
          </div>

          {comparisonPair && (
            <div className="border border-border rounded-lg p-3 space-y-2">
              <div className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Comparing v{comparisonPair.a.version} vs v{comparisonPair.b.version}
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="text-muted-foreground">Field</div>
                <div className="text-blue-300">v{comparisonPair.a.version}</div>
                <div className="text-blue-300">v{comparisonPair.b.version}</div>

                <div className="text-muted-foreground">Probability</div>
                <div>{(comparisonPair.a.forecastProbability * 100).toFixed(1)}%</div>
                <div>{(comparisonPair.b.forecastProbability * 100).toFixed(1)}%</div>

                <div className="text-muted-foreground">Direction</div>
                <div>{comparisonPair.a.forecastDirection}</div>
                <div>{comparisonPair.b.forecastDirection}</div>

                <div className="text-muted-foreground">Primary Constraint</div>
                <div className="truncate">{comparisonPair.a.primaryConstraint ?? "—"}</div>
                <div className="truncate">{comparisonPair.b.primaryConstraint ?? "—"}</div>

                <div className="text-muted-foreground">Signal Count</div>
                <div>{comparisonPair.a.signalCount ?? 0}</div>
                <div>{comparisonPair.b.signalCount ?? 0}</div>

                <div className="text-muted-foreground">Top Drivers</div>
                <div className="text-[10px]">
                  {(comparisonPair.a.topDrivers ?? []).slice(0, 2).map((d, i) => (
                    <div key={i} className="truncate">{d}</div>
                  ))}
                </div>
                <div className="text-[10px]">
                  {(comparisonPair.b.topDrivers ?? []).slice(0, 2).map((d, i) => (
                    <div key={i} className="truncate">{d}</div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
