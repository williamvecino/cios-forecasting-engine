import { useState, useCallback } from "react";
import {
  AlertTriangle,
  GitBranch,
  Layers,
  Shield,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  TreePine,
  BarChart3,
  ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DependencyCluster {
  rootEvidenceId: string;
  rootSignalDescription: string;
  rootSignalType: string;
  rootSourceCluster: string;
  rootLikelihoodRatio: number;
  clusterSignalCount: number;
  compressedSignalCount: number;
  echoCount: number;
  translationCount: number;
  descendants: {
    signalId: string;
    description: string;
    signalType: string;
    sourceCluster: string;
    dependencyRole: string;
    echoVsTranslation: string;
    novelInformationFlag: string;
    lineageConfidence: string;
    rawLikelihoodRatio: number;
    compressionFactor: number;
    compressedLikelihoodRatio: number;
  }[];
}

interface DependencyMetrics {
  totalSignalCount: number;
  clusterCount: number;
  independentEvidenceFamilies: number;
  noveltyScore: number;
  echoDensity: number;
  evidenceDiversityScore: number;
  posteriorFragilityScore: number;
  concentrationPenalty: number;
}

interface ConfidenceCeiling {
  maxAllowedProbability: number;
  reason: string;
  diversityLevel: "high" | "moderate" | "low" | "single";
}

interface ConcentrationWarning {
  type: string;
  severity: "high" | "medium" | "low";
  message: string;
  clusterId?: string;
}

interface IndependentFamily {
  signalId: string;
  description: string;
  sourceCluster: string;
  signalType: string;
  likelihoodRatio: number;
}

interface NaiveVsComparison {
  naiveLrProduct: number;
  compressedLrProduct: number;
  naivePosterior: number;
  compressedPosterior: number;
  delta: number;
  inflationPrevented: number;
}

interface DependencyData {
  clusters: DependencyCluster[];
  independentFamilies: IndependentFamily[];
  metrics: DependencyMetrics;
  warnings: ConcentrationWarning[];
  confidenceCeiling: ConfidenceCeiling;
  comparison: NaiveVsComparison;
  signalCount: number;
  priorProbability: number;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

function metricColor(value: number, invertedScale = false): string {
  const v = invertedScale ? 1 - value : value;
  if (v >= 0.7) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

function severityBadge(severity: "high" | "medium" | "low") {
  if (severity === "high") return "bg-rose-500/15 text-rose-400 border-rose-500/30";
  if (severity === "medium") return "bg-amber-500/15 text-amber-400 border-amber-500/30";
  return "bg-blue-500/15 text-blue-400 border-blue-500/30";
}

function ceilingColor(level: string) {
  if (level === "high") return "text-emerald-400";
  if (level === "moderate") return "text-amber-400";
  return "text-rose-400";
}

export default function SignalDependencyPanel({ caseId }: { caseId: string }) {
  const [data, setData] = useState<DependencyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/cases/${encodeURIComponent(caseId)}/signal-dependency`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const json = await res.json();
      setData(json);
      setExpanded(true);
    } catch (e: any) {
      setError(e.message ?? "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  const toggleCluster = (id: string) => {
    setExpandedClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="rounded-3xl border border-indigo-500/20 bg-[#0A1736] overflow-hidden">
      <button
        onClick={() => (data ? setExpanded(!expanded) : fetchAnalysis())}
        className="w-full flex items-center justify-between px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center gap-3">
          <GitBranch className="w-4 h-4 text-indigo-400" />
          <div>
            <div className="text-sm font-semibold text-indigo-300">Signal Dependency & Redundancy Control</div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Identifies causally linked signals and prevents inflated probability from correlated evidence
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />}
          {data && data.warnings.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-amber-400">
              <AlertTriangle className="w-3 h-3" /> {data.warnings.length}
            </span>
          )}
          {data && (
            <span className="text-[10px] text-slate-500">
              {data.metrics.independentEvidenceFamilies} independent families
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-indigo-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-indigo-400" />
          )}
        </div>
      </button>

      {expanded && data && (
        <div className="px-5 pb-5 space-y-4">
          {error && (
            <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {data.comparison.inflationPrevented > 0 && (
            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 className="w-4 h-4 text-indigo-400" />
                <div className="text-xs font-semibold text-indigo-300">Naive vs Dependency-Controlled Posterior</div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-lg font-bold text-rose-400">{Math.round(data.comparison.naivePosterior * 100)}%</div>
                  <div className="text-[10px] text-slate-500" title="What the probability would be if all signals were treated as independent evidence">Naive (raw stacking)</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-emerald-400">{Math.round(data.comparison.compressedPosterior * 100)}%</div>
                  <div className="text-[10px] text-slate-500" title="The corrected probability after removing the effect of correlated/echoed signals">Dependency-controlled</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-bold text-amber-400">-{Math.round(data.comparison.inflationPrevented * 100)} pts</div>
                  <div className="text-[10px] text-slate-500" title="How many percentage points of inflation were prevented by detecting signal dependencies">Inflation prevented</div>
                </div>
              </div>
            </div>
          )}

          {data.confidenceCeiling.diversityLevel !== "high" && (
            <div className={cn(
              "rounded-xl border p-3 flex items-start gap-2",
              data.confidenceCeiling.diversityLevel === "single" ? "border-rose-500/30 bg-rose-500/5" :
              data.confidenceCeiling.diversityLevel === "low" ? "border-rose-500/20 bg-rose-500/5" :
              "border-amber-500/20 bg-amber-500/5"
            )}>
              <ShieldAlert className={cn("w-4 h-4 shrink-0 mt-0.5", ceilingColor(data.confidenceCeiling.diversityLevel))} />
              <div>
                <div className={cn("text-xs font-semibold", ceilingColor(data.confidenceCeiling.diversityLevel))}>
                  Confidence Ceiling: {Math.round(data.confidenceCeiling.maxAllowedProbability * 100)}%
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{data.confidenceCeiling.reason}</div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
              <div className="text-lg font-bold text-white">{data.metrics.totalSignalCount}</div>
              <div className="text-[10px] text-slate-500 mt-1">Total Signals</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
              <div className="text-lg font-bold text-white">{data.metrics.independentEvidenceFamilies}</div>
              <div className="text-[10px] text-slate-500 mt-1" title="How many truly different reasons support the forecast — independent evidence families, not duplicate signals">Independent Families</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
              <div className={cn("text-lg font-bold", metricColor(data.metrics.evidenceDiversityScore))}>
                {Math.round(data.metrics.evidenceDiversityScore * 100)}%
              </div>
              <div className="text-[10px] text-slate-500 mt-1" title="How many different types of evidence sources are represented — clinical, market, KOL, payer, etc.">Evidence Diversity</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
              <div className={cn("text-lg font-bold", metricColor(data.metrics.posteriorFragilityScore, true))}>
                {Math.round(data.metrics.posteriorFragilityScore * 100)}%
              </div>
              <div className="text-[10px] text-slate-500 mt-1" title="How much of the probability shift depends on a single evidence cluster">Fragility</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <div className={cn("text-sm font-semibold", metricColor(data.metrics.noveltyScore))}>
                {Math.round(data.metrics.noveltyScore * 100)}%
              </div>
              <div className="text-[10px] text-slate-500" title="What percentage of signals contain genuinely new information">Novelty</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <div className={cn("text-sm font-semibold", metricColor(data.metrics.echoDensity, true))}>
                {Math.round(data.metrics.echoDensity * 100)}%
              </div>
              <div className="text-[10px] text-slate-500" title="What fraction of signals are echoes — restatements of upstream evidence">Echo Density</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <div className={cn("text-sm font-semibold", data.metrics.concentrationPenalty > 0 ? "text-rose-400" : "text-emerald-400")}>
                {data.metrics.concentrationPenalty > 0 ? `-${Math.round(data.metrics.concentrationPenalty * 100)}%` : "None"}
              </div>
              <div className="text-[10px] text-slate-500" title="Reduction applied when too much evidence comes from one lineage">Concentration Penalty</div>
            </div>
          </div>

          {data.warnings.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
                Concentration Warnings
              </div>
              {data.warnings.map((w, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex items-start gap-2 rounded-lg border px-3 py-2",
                    severityBadge(w.severity)
                  )}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">{w.message}</div>
                </div>
              ))}
            </div>
          )}

          {data.clusters.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70">
                Evidence Clusters ({data.clusters.length})
              </div>
              {data.clusters.map((cl) => (
                <div
                  key={cl.rootEvidenceId}
                  className="rounded-lg border border-white/10 bg-white/[0.02] overflow-hidden"
                >
                  <button
                    onClick={() => toggleCluster(cl.rootEvidenceId)}
                    className="w-full flex items-center justify-between px-3 py-2.5 cursor-pointer hover:bg-white/[0.02] transition"
                  >
                    <div className="flex items-center gap-2 text-left flex-1 min-w-0">
                      <TreePine className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs text-white font-medium truncate">{cl.rootSignalDescription}</div>
                        <div className="text-[10px] text-slate-500">
                          {cl.rootSourceCluster} · LR {cl.rootLikelihoodRatio?.toFixed(2)} · {cl.clusterSignalCount} signals → {cl.compressedSignalCount} effective
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                      {cl.echoCount > 0 && (
                        <span className="text-[10px] text-slate-500 bg-slate-700/50 px-1.5 py-0.5 rounded">{cl.echoCount} echo{cl.echoCount !== 1 ? "es" : ""}</span>
                      )}
                      {cl.translationCount > 0 && (
                        <span className="text-[10px] text-blue-400/70 bg-blue-500/10 px-1.5 py-0.5 rounded">{cl.translationCount} translation{cl.translationCount !== 1 ? "s" : ""}</span>
                      )}
                      {expandedClusters.has(cl.rootEvidenceId) ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>
                  {expandedClusters.has(cl.rootEvidenceId) && cl.descendants.length > 0 && (
                    <div className="border-t border-white/5 px-3 pb-2.5 pt-2 space-y-1.5">
                      {cl.descendants.map((d) => (
                        <div
                          key={d.signalId}
                          className="rounded bg-slate-800/40 px-2 py-2 space-y-1"
                        >
                          <div className="flex items-center gap-2 text-[10px]">
                            <Layers className="w-3 h-3 text-slate-500 shrink-0" />
                            <span className="text-slate-400 truncate flex-1">{d.description}</span>
                          </div>
                          <div className="flex items-center gap-2 text-[10px] pl-5 flex-wrap">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded",
                              d.echoVsTranslation === "Echo" ? "bg-slate-700/50 text-slate-500" :
                              d.echoVsTranslation === "Translation" ? "bg-blue-500/10 text-blue-400/70" :
                              "bg-emerald-500/10 text-emerald-400/70"
                            )}>
                              {d.echoVsTranslation}
                            </span>
                            <span className="text-slate-600">{d.dependencyRole}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-600">{d.sourceCluster}</span>
                            <span className="text-slate-600">·</span>
                            <span className="text-slate-500" title={`Raw LR: ${d.rawLikelihoodRatio?.toFixed(2)} → Compressed: ${d.compressedLikelihoodRatio?.toFixed(2)} (×${d.compressionFactor.toFixed(2)} factor). ${d.echoVsTranslation === "Echo" ? "Echoes contribute ≈5% of their raw impact because they restate existing evidence." : d.echoVsTranslation === "Translation" ? "Translations contribute ≈35% of their raw impact because they add behavioral/access/workflow context." : "Full impact — independent evidence."}`}>
                              LR {d.rawLikelihoodRatio?.toFixed(2)} → {d.compressedLikelihoodRatio?.toFixed(2)}
                            </span>
                            <span className="text-slate-600" title={`Compression factor: ${d.compressionFactor.toFixed(2)}`}>
                              ×{d.compressionFactor.toFixed(2)}
                            </span>
                            {d.novelInformationFlag !== "Yes" && (
                              <span className={cn(
                                "px-1 py-0.5 rounded",
                                d.novelInformationFlag === "No" ? "bg-rose-500/10 text-rose-400/60" : "bg-amber-500/10 text-amber-400/60"
                              )}>
                                {d.novelInformationFlag === "No" ? "No novel info" : "Partial novelty"}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {data.independentFamilies.length > 0 && (
            <div className="space-y-2">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">
                Independent Evidence ({data.independentFamilies.length})
              </div>
              <div className="space-y-1">
                {data.independentFamilies.map((f) => (
                  <div
                    key={f.signalId}
                    className="flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg border border-emerald-500/10 bg-emerald-500/5"
                  >
                    <Shield className="w-3 h-3 text-emerald-400/60 shrink-0" />
                    <span className="text-slate-300 truncate flex-1">{f.description}</span>
                    <span className="text-slate-600 shrink-0">{f.sourceCluster}</span>
                    <span className="text-slate-600 shrink-0">LR {f.likelihoodRatio?.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="text-[10px] text-slate-600 leading-snug pt-1 border-t border-white/5">
            The forecast should reflect how many <span className="text-slate-400">independent reasons</span> exist to believe the outcome — not how many signals were entered. Echoes and derivatives of the same upstream evidence are compressed so they don't inflate the probability.
          </div>

          <button
            onClick={fetchAnalysis}
            className="flex items-center gap-1.5 text-[10px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" /> Refresh analysis
          </button>
        </div>
      )}

      {expanded && !data && !loading && (
        <div className="px-5 pb-5">
          <button
            onClick={fetchAnalysis}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 px-4 py-2 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 transition cursor-pointer"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Analyze Signal Dependencies
          </button>
        </div>
      )}
    </div>
  );
}
