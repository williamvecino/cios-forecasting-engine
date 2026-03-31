import { memo, useState } from "react";
import {
  Scale,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowUpRight,
  ArrowDownRight,
  Compass,
  Eye,
  MessageSquareWarning,
  Lightbulb,
  TrendingUp,
  BookOpen,
  ExternalLink,
  Layers,
  ShieldAlert,
  ShieldCheck,
  Lock,
} from "lucide-react";
import type { ExecutiveJudgmentResult, AnalogCaseDetail } from "@/lib/judgment-engine";
import type { SignalTier } from "@/lib/signal-differentiation";
import { AnalogModal } from "./AnalogModal";

function getDriverDirectionLabel(points: number, direction: "Upward" | "Downward"): string {
  const abs = Math.abs(points);
  if (points === 0) return "Neutral driver";
  if (direction === "Upward") {
    if (abs >= 5) return "Stabilizes franchise";
    if (abs >= 4) return "Strengthens defensive position";
    if (abs >= 3) return "Supports positive trajectory";
    if (abs >= 2) return "Moderately protective";
    return "Marginally supportive";
  }
  if (abs >= 5) return "Significant headwind";
  if (abs >= 4) return "Strong competitive pressure";
  if (abs >= 3) return "Material downside risk";
  if (abs >= 2) return "Moderate drag";
  return "Minor friction";
}

interface ExecutiveJudgmentProps {
  judgment: ExecutiveJudgmentResult;
  isLoading?: boolean;
  priorProbability?: number | null;
}

function getProbabilityBand(pct: number): { label: string; description: string } {
  if (pct > 80) return { label: "Very High", description: "Strong convergence of evidence supports this outcome" };
  if (pct >= 60) return { label: "High", description: "Evidence favors this outcome" };
  if (pct >= 30) return { label: "Moderate", description: "Mixed signals — outcome could go either way" };
  return { label: "Low", description: "Limited evidence or significant barriers to this outcome" };
}

const BAND_COLORS: Record<string, string> = {
  "Very High": "text-emerald-300 bg-emerald-500/15 border-emerald-500/25",
  High: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  Moderate: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  Low: "text-rose-400 bg-rose-500/10 border-rose-500/20",
};

function getVerdictConfig(pct: number) {
  if (pct >= 60) return {
    icon: CheckCircle2,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    ring: "ring-emerald-500/20",
  };
  if (pct >= 40) return {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    ring: "ring-amber-500/20",
  };
  if (pct >= 10) return {
    icon: XCircle,
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/25",
    ring: "ring-rose-500/20",
  };
  return {
    icon: HelpCircle,
    color: "text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/25",
    ring: "ring-slate-500/20",
  };
}

const confidenceBadge: Record<string, string> = {
  High: "bg-emerald-500/15 text-emerald-300 border-emerald-500/20",
  Moderate: "bg-amber-500/15 text-amber-300 border-amber-500/20",
  Low: "bg-rose-500/15 text-rose-300 border-rose-500/20",
};

const confidenceDescriptions: Record<string, string> = {
  High: "Strong and consistent signals",
  Moderate: "Mixed or incomplete signals",
  Low: "Limited or conflicting evidence",
};

const uncertaintyColors: Record<string, string> = {
  missing_evidence: "text-orange-300",
  conflicting_signals: "text-amber-300",
  gating_barriers: "text-rose-300",
  weak_evidence: "text-orange-300",
  well_resolved: "text-emerald-300",
};

const uncertaintyLabels: Record<string, string> = {
  missing_evidence: "Incomplete Picture",
  conflicting_signals: "Mixed Signals",
  gating_barriers: "Barriers Unresolved",
  weak_evidence: "Limited Evidence",
  well_resolved: "Clear Picture",
};

const ExecutiveJudgment = memo(function ExecutiveJudgment({
  judgment,
  isLoading,
  priorProbability,
}: ExecutiveJudgmentProps) {
  const [selectedAnalog, setSelectedAnalog] = useState<AnalogCaseDetail | null>(null);

  if (isLoading) {
    return (
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-[#0C1E42] to-[#0A1736] p-8 animate-pulse">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-white/5" />
          <div className="h-5 w-48 rounded bg-white/5" />
        </div>
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-white/5" />
          <div className="h-4 w-3/4 rounded bg-white/5" />
          <div className="h-4 w-1/2 rounded bg-white/5" />
        </div>
      </div>
    );
  }

  const config = getVerdictConfig(judgment.probability);
  const VerdictIcon = config.icon;

  return (
    <>
    {selectedAnalog && (
      <AnalogModal analog={selectedAnalog} onClose={() => setSelectedAnalog(null)} />
    )}
    <div className={`rounded-3xl border ${config.border} bg-gradient-to-b from-[#0C1E42] to-[#0A1736] p-6 space-y-5 ring-1 ${config.ring}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl ${config.bg} p-2.5`}>
            <Scale className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Executive Judgment</h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${uncertaintyColors[judgment.uncertaintyType] || "text-slate-300"} bg-white/5 border-white/10`}>
            {uncertaintyLabels[judgment.uncertaintyType] || "Assessing"}
          </span>
          <div className="flex flex-col items-end">
            <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceBadge[judgment.confidence] || "bg-slate-500/15 text-slate-300 border-slate-500/20"}`}>
              {judgment.confidence} Confidence
            </span>
            <span className="text-[9px] text-slate-500 mt-0.5">
              {confidenceDescriptions[judgment.confidence] || ""}
            </span>
          </div>
        </div>
      </div>

      <div className={`flex items-center gap-4 rounded-2xl ${config.bg} border ${config.border} p-4`}>
        <VerdictIcon className={`w-8 h-8 ${config.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">Most Likely Outcome</div>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${BAND_COLORS[getProbabilityBand(judgment.probability).label] || "text-slate-400 bg-slate-500/10 border-slate-500/20"}`}>
              {getProbabilityBand(judgment.probability).label}
            </span>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-lg font-bold ${config.color}`}>{judgment.mostLikelyOutcome}</span>
          </div>
          <div className="text-[10px] text-slate-600 mt-1 leading-snug">
            {getProbabilityBand(judgment.probability).description} — {judgment.probability >= 60
              ? `at ${judgment.probability}%, the evidence points toward this outcome happening`
              : judgment.probability >= 40
              ? `at ${judgment.probability}%, the outcome is uncertain — evidence is mixed`
              : judgment.probability >= 10
              ? judgment.gateConstrained
                ? `at ${judgment.probability}%, realization is constrained by operational barriers — not by weak product evidence`
                : `at ${judgment.probability}%, the evidence suggests this outcome is unlikely without significant changes`
              : "insufficient evidence to form a reliable view"}
          </div>
          {priorProbability != null && priorProbability !== judgment.probability && (
            <div className="flex items-center gap-1.5 mt-2">
              <span className={`text-sm font-bold tabular-nums ${judgment.probability > priorProbability ? "text-emerald-400" : "text-rose-400"}`}>
                {judgment.probability}%
              </span>
              <span className={`text-xs ${judgment.probability > priorProbability ? "text-emerald-400" : "text-rose-400"}`}>
                {judgment.probability > priorProbability ? "↑" : "↓"}
              </span>
              <span className="text-[11px] text-slate-500">
                {Math.abs(judgment.probability - priorProbability)} {Math.abs(judgment.probability - priorProbability) === 1 ? "point" : "points"} since last update
              </span>
            </div>
          )}
        </div>
      </div>

      {judgment.gateConstrained && (
        <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-r from-amber-500/[0.06] to-transparent p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <h3 className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Gate-Constrained Outcome</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">Underlying Strength</span>
              </div>
              <div className="text-lg font-bold text-emerald-300 tabular-nums">{judgment.gateConstrained.underlyingStrengthPct}%</div>
              <div className="text-[10px] text-slate-400 mt-0.5">Product evidence supports a stronger outcome</div>
            </div>
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Constraint Impact</span>
              </div>
              <div className="text-lg font-bold text-amber-300 tabular-nums">−{judgment.gateConstrained.constraintGap} pts</div>
              <div className="text-[10px] text-slate-400 mt-0.5">
                {judgment.gateConstrained.constraintType === "access" ? "Access constraints" : judgment.gateConstrained.constraintType === "execution" ? "Execution constraints" : "Execution and access constraints"} limiting realization
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {judgment.gateConstrained.constraintLabels.map((label) => (
              <span key={label} className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/[0.06] px-2.5 py-0.5 text-[10px]">
                <Lock className="w-2.5 h-2.5 text-amber-400/70" />
                <span className="text-amber-200/80">{label}</span>
              </span>
            ))}
          </div>
          <div className="text-[10px] text-slate-500 leading-snug border-t border-white/5 pt-2">
            This is not a product weakness — the clinical evidence supports a {judgment.gateConstrained.underlyingStrengthPct}% outlook. The current {judgment.probability}% forecast reflects {judgment.gateConstrained.constraintType === "access" ? "access barriers" : judgment.gateConstrained.constraintType === "execution" ? "execution gaps" : "operational constraints"} that, if resolved, would allow the forecast to rise toward its evidence-supported level.
          </div>
        </div>
      )}

      {judgment.compositeScenarios && judgment.compositeScenarios.length > 0 && (() => {
        const maxProb = Math.max(...judgment.compositeScenarios.map(s => s.probability));
        const SCENARIO_COLORS = [
          "bg-emerald-400", "bg-sky-400", "bg-amber-400", "bg-violet-400",
          "bg-rose-400", "bg-teal-400", "bg-orange-400", "bg-indigo-400",
        ];
        return (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal-400" />
            <h3 className="text-[10px] font-bold text-teal-300 uppercase tracking-wider">Outcome Probability Distribution</h3>
          </div>

          <div className="rounded-2xl border border-teal-500/20 bg-teal-500/[0.03] p-4 space-y-3">
            <div className="h-6 rounded-full overflow-hidden flex bg-slate-800/50">
              {judgment.compositeScenarios.map((scenario, si) => (
                <div
                  key={scenario.id}
                  className={`${SCENARIO_COLORS[si % SCENARIO_COLORS.length]} ${si === 0 ? "rounded-l-full" : ""} ${si === judgment.compositeScenarios!.length - 1 ? "rounded-r-full" : ""} flex items-center justify-center transition-all`}
                  style={{ width: `${scenario.probability}%` }}
                  title={`${scenario.label} — ${scenario.probability}%`}
                >
                  {scenario.probability >= 12 && (
                    <span className="text-[9px] font-bold text-slate-900 tabular-nums">{scenario.probability}%</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {judgment.compositeScenarios.map((scenario, si) => (
                <div key={scenario.id} className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${SCENARIO_COLORS[si % SCENARIO_COLORS.length]}`} />
                  <span className="text-[10px] text-slate-400">{scenario.label}</span>
                  <span className="text-[10px] font-bold text-slate-200 tabular-nums">— {scenario.probability}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {judgment.compositeScenarios.map((scenario, si) => (
              <div
                key={scenario.id}
                className={`rounded-2xl border p-4 transition ${
                  scenario.isSelected
                    ? `${config.border} ${config.bg} ring-1 ${config.ring}`
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`text-xs font-bold tabular-nums ${scenario.isSelected ? config.color : "text-slate-500"}`}>
                      #{scenario.rank}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-sm font-semibold ${scenario.isSelected ? "text-white" : "text-slate-300"}`}>
                          {scenario.label}
                        </span>
                        <span className="text-sm font-bold tabular-nums text-slate-200">— {scenario.probability}%</span>
                      </div>
                      {scenario.rationale && (
                        <div className="text-[10px] text-slate-500 mt-0.5">{scenario.rationale}</div>
                      )}
                    </div>
                  </div>
                  {scenario.isSelected && (
                    <span className="rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider shrink-0">
                      Most Likely
                    </span>
                  )}
                </div>
                <div className="relative h-2 rounded-full bg-slate-800/50 overflow-hidden">
                  <div
                    className={`absolute inset-y-0 left-0 rounded-full transition-all ${SCENARIO_COLORS[si % SCENARIO_COLORS.length]}`}
                    style={{ width: `${(scenario.probability / maxProb) * 100}%` }}
                  />
                </div>
                {scenario.isSelected && Object.keys(scenario.dimensions).length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5">
                    {Object.entries(scenario.dimensions).map(([dim, level]) => (
                      <span key={dim} className="inline-flex items-center gap-1 rounded-full border border-teal-500/20 bg-teal-500/5 px-2.5 py-0.5 text-[10px]">
                        <span className="text-slate-400">{dim}:</span>
                        <span className="text-teal-300 font-medium">{level}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-4 h-4 text-indigo-400" />
          <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">What This Means for Planning</h3>
        </div>
        <p className="text-sm text-white font-medium leading-relaxed pl-6">{judgment.decisionPosture}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Why This Is the Current Outlook</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed pl-5">{judgment.reasoning}</p>
      </div>

      {judgment.primaryConstraints.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h3 className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">What Is Holding This Back</h3>
          </div>
          {judgment.primaryConstraints.map((constraint, ci) => (
            <div key={ci} className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-bold text-white">{constraint.label}</span>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0 ${
                    constraint.status === "weak" ? "bg-red-900/40 text-red-400" :
                    constraint.status === "unresolved" ? "bg-orange-900/40 text-orange-400" :
                    "bg-amber-900/40 text-amber-400"
                  }`}>
                    {constraint.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-emerald-400/70 mb-0.5">Potential impact</div>
                  <span className="text-sm font-bold text-emerald-300 tabular-nums">+{constraint.potentialImpact} {constraint.potentialImpact === 1 ? "pt" : "pts"}</span>
                </div>
                <div className="rounded-xl border border-sky-500/15 bg-sky-500/[0.04] px-3 py-2">
                  <div className="text-[9px] uppercase tracking-wider text-sky-400/70 mb-0.5">Expected resolution window</div>
                  <span className="text-sm font-bold text-sky-300 tabular-nums">{constraint.resolutionWindow.minMonths} to {constraint.resolutionWindow.maxMonths} months</span>
                </div>
              </div>

              {constraint.drivers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Primary drivers</div>
                  <div className="space-y-1.5">
                    {constraint.drivers.map((dr, di) => (
                      <div key={di} className="flex items-start gap-3">
                        <span className={`text-xs font-semibold w-20 text-right shrink-0 mt-0.5 ${
                          dr.rank === "High" ? "text-red-400" :
                          dr.rank === "Moderate" ? "text-amber-400" :
                          "text-slate-500"
                        }`}>
                          {dr.rank} impact
                        </span>
                        <div className="flex-1">
                          <span className="text-sm text-slate-200">{dr.name}</span>
                          <div className="text-[10px] text-slate-600 mt-0.5">
                            {dr.rank === "High"
                              ? "This factor has a large effect on whether the outcome happens — resolving it would meaningfully improve the probability"
                              : dr.rank === "Moderate"
                              ? "Contributes to the constraint but is not the primary blocker"
                              : "Minor factor — unlikely to change the outcome on its own"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-xl bg-indigo-500/8 border border-indigo-500/15 px-3 py-2">
                <div className="text-[10px] uppercase tracking-wider text-indigo-400 mb-0.5">Most effective lever</div>
                <p className="text-xs text-slate-200 leading-relaxed">{constraint.lever}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {(judgment.signalHierarchy.dominant.length > 0 || judgment.signalHierarchy.supporting.length > 0 || judgment.signalHierarchy.neutral.length > 0 || judgment.signalHierarchy.contradictory.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-violet-400" />
            <h3 className="text-[10px] font-bold text-violet-300 uppercase tracking-wider">Evidence Hierarchy</h3>
          </div>

          {(["dominant", "supporting", "neutral", "contradictory"] as SignalTier[]).map(tier => {
            const signals = judgment.signalHierarchy[tier];
            if (signals.length === 0) return null;
            const tierConfig: Record<SignalTier, { label: string; color: string; bg: string; border: string }> = {
              dominant: { label: "Dominant Evidence", color: "text-emerald-300", bg: "bg-emerald-500/5", border: "border-emerald-500/15" },
              supporting: { label: "Supporting Evidence", color: "text-blue-300", bg: "bg-blue-500/5", border: "border-blue-500/15" },
              neutral: { label: "Neutral", color: "text-slate-400", bg: "bg-slate-500/5", border: "border-slate-500/15" },
              contradictory: { label: "Weak or Non-Confirmatory", color: "text-rose-300", bg: "bg-rose-500/5", border: "border-rose-500/15" },
            };
            const tc = tierConfig[tier];
            return (
              <div key={tier} className={`rounded-xl ${tc.bg} border ${tc.border} p-3 space-y-2`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${tc.color}`}>{tc.label}</div>
                <div className="space-y-1.5">
                  {signals.map((sig, si) => (
                    <div key={si} className="flex items-start gap-3 pl-1">
                      {sig.direction === "Upward" ? (
                        <ArrowUpRight className="w-3 h-3 text-emerald-400 shrink-0 mt-1" />
                      ) : sig.contributionPoints === 0 ? (
                        <span className="w-3 h-3 shrink-0 mt-1 rounded-full border border-slate-600 bg-slate-700/50" />
                      ) : (
                        <ArrowDownRight className="w-3 h-3 text-rose-400 shrink-0 mt-1" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className={`text-xs font-bold tabular-nums ${
                            sig.contributionPoints > 0 ? "text-emerald-300" :
                            sig.contributionPoints < 0 ? "text-rose-300" :
                            "text-slate-500"
                          }`}>
                            {sig.contributionPoints > 0 ? "+" : ""}{sig.contributionPoints} {Math.abs(sig.contributionPoints) === 1 ? "pt" : "pts"}
                          </span>
                          <span className="text-[10px] text-slate-500">—</span>
                          <span className={`text-[11px] font-medium ${
                            sig.contributionPoints > 0 ? "text-emerald-400/80" :
                            sig.contributionPoints < 0 ? "text-rose-400/80" :
                            "text-slate-500"
                          }`}>
                            {getDriverDirectionLabel(sig.contributionPoints, sig.direction)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-white font-medium">{sig.name}</span>
                          <span className="rounded-full border border-slate-600/50 bg-slate-700/30 px-2 py-px text-[9px] font-medium text-slate-400 uppercase tracking-wider shrink-0">
                            {sig.functionalRole}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{sig.rationale}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-violet-400 mb-1">Strategic implication</div>
            <p className="text-xs text-slate-200 leading-relaxed">{judgment.signalHierarchy.strategicImplication}</p>
          </div>

          {judgment._audit.signalImbalance.detected && (
            <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-300 uppercase tracking-wider">Signal Imbalance Detected</span>
              </div>
              <div className="space-y-1 pl-5">
                {judgment._audit.signalImbalance.strongDomain && (
                  <div className="text-[11px] text-slate-300">
                    <span className="text-emerald-400 font-medium">Strong: </span>{judgment._audit.signalImbalance.strongDomain}
                  </div>
                )}
                {judgment._audit.signalImbalance.weakDomain && (
                  <div className="text-[11px] text-slate-300">
                    <span className="text-rose-400 font-medium">Weak: </span>{judgment._audit.signalImbalance.weakDomain}
                  </div>
                )}
                <div className="text-[11px] text-slate-400">
                  <span className="text-amber-400 font-medium">Confidence impact: </span>{judgment._audit.signalImbalance.confidenceImpact}
                </div>
                {judgment._audit.signalImbalance.strategicRisk && (
                  <div className="text-[11px] text-amber-200/70 mt-1 leading-relaxed">{judgment._audit.signalImbalance.strategicRisk}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {judgment.uncertaintyType !== "well_resolved" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Why We Are Not More Certain</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pl-5">{judgment.uncertaintyExplanation}</p>
        </div>
      )}

      {judgment.reversalTriggers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What Would Change the Outlook</h3>
          </div>
          <div className="space-y-1.5 pl-5">
            {judgment.reversalTriggers.map((trigger, i) => (
              <div key={i} className="flex items-start gap-2">
                {trigger.direction === "upward" ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                )}
                <span className="text-xs text-slate-300 leading-relaxed">{trigger.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {judgment.analogCases.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Historical Precedent</h3>
          </div>
          <div className="space-y-1.5 pl-5">
            {judgment.analogCases.map((ac, i) => (
              <button
                key={ac.caseId}
                onClick={() => setSelectedAnalog(ac)}
                className="w-full text-left flex items-center gap-3 rounded-lg bg-white/[0.02] border border-white/5 hover:border-cyan-500/30 hover:bg-cyan-500/5 px-3 py-2.5 transition-colors group cursor-pointer"
              >
                <span className="text-[10px] text-cyan-400 font-mono shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white font-medium group-hover:text-cyan-200 transition-colors">{ac.brand}</span>
                    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                      ac.confidence === "High" ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/20" :
                      ac.confidence === "Moderate" ? "bg-amber-500/15 text-amber-300 border-amber-500/20" :
                      "bg-rose-500/15 text-rose-300 border-rose-500/20"
                    }`}>
                      {ac.confidence}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 truncate">{ac.indication} — {ac.lesson}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-cyan-400 shrink-0 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      )}

      {judgment.monitorList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What to Watch Next</h3>
          </div>
          <div className="space-y-1.5 pl-5">
            {judgment.monitorList.map((item, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg bg-white/[0.02] px-3 py-2">
                <span className="text-[10px] text-cyan-400 font-mono shrink-0 mt-0.5">{i + 1}.</span>
                <div>
                  <span className="text-xs text-white font-medium">{item.label}</span>
                  <span className="text-xs text-slate-500 ml-2">— {item.reason}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-indigo-500/5 border border-indigo-500/15 p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Lightbulb className="w-3.5 h-3.5 text-indigo-400" />
          <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">The Most Important Question to Answer Next</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed pl-5 italic">{judgment.nextBestQuestion}</p>
      </div>
    </div>
    </>
  );
});

export { ExecutiveJudgment };
export type { ExecutiveJudgmentProps };
