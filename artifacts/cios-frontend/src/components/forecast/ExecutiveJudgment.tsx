import { memo } from "react";
import {
  Scale,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Fingerprint,
  ArrowUpRight,
  ArrowDownRight,
  GitCompareArrows,
  Compass,
  Eye,
  MessageSquareWarning,
  Lightbulb,
} from "lucide-react";
import type { ExecutiveJudgmentResult } from "@/lib/judgment-engine";

interface ExecutiveJudgmentProps {
  judgment: ExecutiveJudgmentResult;
  isLoading?: boolean;
}

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

const uncertaintyColors: Record<string, string> = {
  missing_evidence: "text-orange-300",
  conflicting_signals: "text-amber-300",
  gating_barriers: "text-rose-300",
  weak_evidence: "text-orange-300",
  well_resolved: "text-emerald-300",
};

const uncertaintyLabels: Record<string, string> = {
  missing_evidence: "Missing Evidence",
  conflicting_signals: "Conflicting Signals",
  gating_barriers: "Gating Barriers",
  weak_evidence: "Weak Evidence",
  well_resolved: "Well Resolved",
};

const ExecutiveJudgment = memo(function ExecutiveJudgment({
  judgment,
  isLoading,
}: ExecutiveJudgmentProps) {
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
    <div className={`rounded-3xl border ${config.border} bg-gradient-to-b from-[#0C1E42] to-[#0A1736] p-6 space-y-5 ring-1 ${config.ring}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className={`rounded-xl ${config.bg} p-2.5`}>
            <Scale className={`w-5 h-5 ${config.color}`} />
          </div>
          <div>
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Executive Judgment</h2>
            <p className="text-[10px] text-slate-600 mt-0.5">Signal + gate + analog pattern synthesis</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${uncertaintyColors[judgment.uncertaintyType]} bg-white/5 border-white/10`}>
            {uncertaintyLabels[judgment.uncertaintyType]}
          </span>
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${confidenceBadge[judgment.confidence]}`}>
            {judgment.confidence} Confidence
          </span>
        </div>
      </div>

      <div className={`flex items-center gap-4 rounded-2xl ${config.bg} border ${config.border} p-4`}>
        <VerdictIcon className={`w-8 h-8 ${config.color} shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Most Likely Outcome</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-lg font-bold ${config.color}`}>{judgment.mostLikelyOutcome}</span>
            <span className="text-2xl font-bold text-white">{judgment.probability}%</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-indigo-500/8 border border-indigo-500/20 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Compass className="w-4 h-4 text-indigo-400" />
          <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Recommended Decision Posture</h3>
        </div>
        <p className="text-sm text-white font-medium leading-relaxed pl-6">{judgment.decisionPosture}</p>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-3.5 h-3.5 text-blue-400" />
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What Is Driving the Call</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed pl-5">{judgment.reasoning}</p>
        {judgment.keyDrivers.length > 0 && (
          <div className="flex flex-wrap gap-2 pl-5 pt-1">
            {judgment.keyDrivers.map((driver, i) => (
              <span key={i} className="rounded-lg bg-white/5 border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 font-medium">
                {driver}
              </span>
            ))}
          </div>
        )}
      </div>

      {judgment.uncertaintyType !== "well_resolved" && (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <MessageSquareWarning className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Source of Uncertainty</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed pl-5">{judgment.uncertaintyExplanation}</p>
        </div>
      )}

      {judgment.analogPattern && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <GitCompareArrows className="w-3.5 h-3.5 text-violet-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Closest Analog Pattern: {judgment.analogPattern.patternLabel}</h3>
          </div>
          <div className="rounded-xl bg-violet-500/5 border border-violet-500/15 p-3 ml-5">
            <div className="flex items-center gap-3 mb-2">
              {judgment.analogPattern.analogCaseId && (
                <span className="text-[10px] font-mono text-violet-300 bg-violet-500/15 rounded px-2 py-0.5">
                  {judgment.analogPattern.analogCaseId}
                </span>
              )}
              {judgment.analogPattern.analogProbability !== null && (
                <span className="text-[10px] text-slate-400">
                  Resolved at {judgment.analogPattern.analogProbability}%
                </span>
              )}
              <span className="text-[10px] text-slate-500">
                {judgment.analogPattern.similarityScore}% similarity
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">{judgment.analogPattern.description}</p>
          </div>
          {judgment.convergenceNote && (
            <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-3 ml-5">
              <p className="text-xs text-blue-200/80 leading-relaxed">{judgment.convergenceNote}</p>
            </div>
          )}
        </div>
      )}

      {judgment.reversalTriggers.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What Would Change This</h3>
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

      {judgment.monitorList.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="w-3.5 h-3.5 text-cyan-400" />
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monitor List</h3>
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
          <h3 className="text-[10px] font-bold text-indigo-300 uppercase tracking-wider">Next-Best Question</h3>
        </div>
        <p className="text-sm text-slate-200 leading-relaxed pl-5 italic">{judgment.nextBestQuestion}</p>
      </div>

      <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-[10px] text-slate-600">
        <span>Deterministic judgment engine</span>
        <span>·</span>
        <span>No generative text</span>
        <span>·</span>
        <span>Signal + gate + analog synthesis</span>
      </div>
    </div>
  );
});

export { ExecutiveJudgment };
export type { ExecutiveJudgmentProps };
