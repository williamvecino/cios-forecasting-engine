import { useState, useEffect } from "react";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Shield,
  Crosshair,
  BarChart3,
  GitBranch,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface DriverSummary {
  signalId: string;
  description: string;
  family: string;
  direction: string;
  strength: number;
  lineageType: string;
  sourceCluster: string;
}

interface ExplanationData {
  topPositiveDrivers: DriverSummary[];
  topNegativeDrivers: DriverSummary[];
  uncertaintyFactors: string[];
  concentrationWarning: string | null;
  nextMover: string | null;
  fragilityAssessment: string;
  familyDistribution: Record<string, number>;
  lineageBreakdown: Record<string, number>;
  noveltyRatio: { novel: number; echo: number };
}

export default function ExplanationPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    if (!caseId) return;
    setLoading(true);
    fetch(`${API}/api/cases/${caseId}/explanation`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [caseId]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 animate-pulse">
        <div className="h-4 bg-muted/30 rounded w-48 mb-4" />
        <div className="h-3 bg-muted/20 rounded w-full mb-2" />
        <div className="h-3 bg-muted/20 rounded w-3/4" />
      </div>
    );
  }

  if (!data || (data.topPositiveDrivers.length === 0 && data.topNegativeDrivers.length === 0)) {
    return null;
  }

  const totalSignals = Object.values(data.familyDistribution).reduce((a, b) => a + b, 0);
  const sortedFamilies = Object.entries(data.familyDistribution).sort((a, b) => b[1] - a[1]);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-muted/5 transition"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Forecast Explanation</span>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-green-400">Top Positive Drivers</span>
              </div>
              {data.topPositiveDrivers.length === 0 ? (
                <p className="text-xs text-foreground/40">No positive drivers.</p>
              ) : (
                data.topPositiveDrivers.map((d, i) => (
                  <div key={i} className="rounded-lg border border-green-500/10 bg-green-500/5 p-3">
                    <p className="text-xs text-foreground/80 leading-relaxed">{d.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[9px] text-cyan-400">{d.family}</span>
                      <span className="text-[9px] text-muted-foreground">{d.lineageType}</span>
                      <span className="text-[9px] text-muted-foreground">{d.sourceCluster}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-red-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Top Negative Drivers</span>
              </div>
              {data.topNegativeDrivers.length === 0 ? (
                <p className="text-xs text-foreground/40">No negative drivers.</p>
              ) : (
                data.topNegativeDrivers.map((d, i) => (
                  <div key={i} className="rounded-lg border border-red-500/10 bg-red-500/5 p-3">
                    <p className="text-xs text-foreground/80 leading-relaxed">{d.description}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      <span className="text-[9px] text-cyan-400">{d.family}</span>
                      <span className="text-[9px] text-muted-foreground">{d.lineageType}</span>
                      <span className="text-[9px] text-muted-foreground">{d.sourceCluster}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {data.uncertaintyFactors.length > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Uncertainty Factors</span>
              </div>
              {data.uncertaintyFactors.map((f, i) => (
                <p key={i} className="text-xs text-foreground/70">• {f}</p>
              ))}
            </div>
          )}

          {data.concentrationWarning && (
            <div className="rounded-xl border border-orange-500/20 bg-orange-500/5 p-4">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-orange-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-orange-400">Concentration Warning</span>
              </div>
              <p className="text-xs text-foreground/70">{data.concentrationWarning}</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-muted/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Fragility</span>
              </div>
              <p className="text-xs text-foreground/70">{data.fragilityAssessment}</p>
            </div>

            {data.nextMover && (
              <div className="rounded-xl border border-border bg-muted/5 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Crosshair className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Next Mover</span>
                </div>
                <p className="text-xs text-foreground/70">{data.nextMover}</p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-muted/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Evidence Quality</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-foreground/60">Novel evidence</span>
                  <span className="text-green-400 font-mono">{data.noveltyRatio.novel}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-foreground/60">Echo / derivative</span>
                  <span className="text-red-400 font-mono">{data.noveltyRatio.echo}</span>
                </div>
              </div>
            </div>
          </div>

          {sortedFamilies.length > 0 && (
            <div className="rounded-xl border border-border bg-muted/5 p-4">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Evidence Family Distribution</div>
              <div className="space-y-2">
                {sortedFamilies.map(([family, count]) => (
                  <div key={family} className="flex items-center gap-3">
                    <span className="text-[10px] text-foreground/60 w-40 truncate">{family}</span>
                    <div className="flex-1 h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-cyan-500/60 rounded-full"
                        style={{ width: `${Math.max(8, (count / totalSignals) * 100)}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-foreground/40 w-6 text-right">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
