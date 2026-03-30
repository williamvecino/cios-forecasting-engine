import { useState, useEffect, useCallback } from "react";
import {
  GitBranch,
  ShieldAlert,
  BarChart3,
  TreePine,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface EvidenceHealthData {
  metrics: {
    totalSignalCount: number;
    clusterCount: number;
    independentEvidenceFamilies: number;
    noveltyScore: number;
    echoDensity: number;
    evidenceDiversityScore: number;
    posteriorFragilityScore: number;
    concentrationPenalty: number;
  };
  confidenceCeiling: {
    maxAllowedProbability: number;
    reason: string;
    diversityLevel: "high" | "moderate" | "low" | "single";
  };
  comparison: {
    naivePosterior: number;
    compressedPosterior: number;
    inflationPrevented: number;
  };
  warnings: Array<{
    type: string;
    severity: "high" | "medium" | "low";
    message: string;
  }>;
  signalCount: number;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

function scoreColor(value: number, inverted = false): string {
  const v = inverted ? 1 - value : value;
  if (v >= 0.7) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

function ceilingColor(level: string) {
  if (level === "high") return "text-emerald-400";
  if (level === "moderate") return "text-amber-400";
  return "text-rose-400";
}

export default function EvidenceHealthPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<EvidenceHealthData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBase()}/cases/${encodeURIComponent(caseId)}/signal-dependency`);
      if (!res.ok) return;
      const json = await res.json();
      setData(json);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    fetchData();
  }, [caseId]);

  if (!data || data.signalCount === 0) return null;

  const m = data.metrics;
  const c = data.confidenceCeiling;
  const hasInflation = data.comparison.inflationPrevented > 0;
  const hasCeiling = c.diversityLevel !== "high";

  return (
    <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-[#0C1E42] to-[#0A1736] p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-indigo-500/10 p-2">
            <GitBranch className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Evidence Health</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">How diverse and independent is the evidence base</p>
          </div>
        </div>
        <button onClick={fetchData} className="text-slate-500 hover:text-indigo-400 transition" title="Refresh">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className={cn("text-lg font-bold", scoreColor(m.evidenceDiversityScore))}>
            {Math.round(m.evidenceDiversityScore * 100)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1" title="How many different types of evidence sources are represented">Evidence Diversity</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className={cn("text-lg font-bold", scoreColor(m.posteriorFragilityScore, true))}>
            {Math.round(m.posteriorFragilityScore * 100)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1" title="How much of the probability shift depends on a single evidence cluster">Fragility</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-lg font-bold text-white">{m.independentEvidenceFamilies}</div>
          <div className="text-[10px] text-slate-500 mt-1" title="How many truly different reasons support the forecast">Independent Families</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className={cn("text-lg font-bold", scoreColor(m.noveltyScore))}>
            {Math.round(m.noveltyScore * 100)}%
          </div>
          <div className="text-[10px] text-slate-500 mt-1" title="What percentage of signals contain genuinely new information">Novelty</div>
        </div>
      </div>

      {hasCeiling && (
        <div className={cn(
          "rounded-xl border p-3 flex items-start gap-2",
          c.diversityLevel === "single" || c.diversityLevel === "low"
            ? "border-rose-500/20 bg-rose-500/5"
            : "border-amber-500/20 bg-amber-500/5"
        )}>
          <ShieldAlert className={cn("w-4 h-4 shrink-0 mt-0.5", ceilingColor(c.diversityLevel))} />
          <div>
            <div className={cn("text-xs font-semibold", ceilingColor(c.diversityLevel))}>
              Confidence Ceiling: {Math.round(c.maxAllowedProbability * 100)}%
            </div>
            <div className="text-[10px] text-slate-400 mt-1">{c.reason}</div>
          </div>
        </div>
      )}

      {hasInflation && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[10px] font-semibold text-indigo-300 uppercase tracking-wider">Inflation Prevention</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <div className="text-sm font-bold text-rose-400">{Math.round(data.comparison.naivePosterior * 100)}%</div>
              <div className="text-[10px] text-slate-500" title="What the probability would be if all signals were treated as independent">Naive</div>
            </div>
            <div>
              <div className="text-sm font-bold text-emerald-400">{Math.round(data.comparison.compressedPosterior * 100)}%</div>
              <div className="text-[10px] text-slate-500" title="The corrected probability after detecting correlated signals">Controlled</div>
            </div>
            <div>
              <div className="text-sm font-bold text-amber-400">-{Math.round(data.comparison.inflationPrevented * 100)} pts</div>
              <div className="text-[10px] text-slate-500">Prevented</div>
            </div>
          </div>
        </div>
      )}

      {data.warnings.length > 0 && (
        <div className="space-y-1.5">
          {data.warnings.slice(0, 3).map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
              <span className="text-amber-300/80">{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {m.echoDensity > 0.3 && (
        <div className="flex items-start gap-2 text-[10px] rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2">
          <TreePine className="w-3 h-3 text-slate-500 shrink-0 mt-0.5" />
          <span className="text-slate-400">
            {Math.round(m.echoDensity * 100)}% of signals are echoes of upstream evidence. The forecast has been adjusted to reflect only independent information.
          </span>
        </div>
      )}
    </div>
  );
}
