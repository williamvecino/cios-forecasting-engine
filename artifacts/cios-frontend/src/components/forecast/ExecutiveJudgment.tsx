import { memo } from "react";
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
} from "lucide-react";
import type { ExecutiveJudgmentResult, PrimaryConstraint } from "@/lib/judgment-engine";

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
          <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Most Likely Outcome</div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className={`text-lg font-bold ${config.color}`}>{judgment.mostLikelyOutcome}</span>
          </div>
        </div>
      </div>

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
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{constraint.label}</span>
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  constraint.status === "weak" ? "bg-red-900/40 text-red-400" :
                  constraint.status === "unresolved" ? "bg-orange-900/40 text-orange-400" :
                  "bg-amber-900/40 text-amber-400"
                }`}>
                  {constraint.status}
                </span>
              </div>

              {constraint.drivers.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">Primary drivers</div>
                  <div className="space-y-1.5">
                    {constraint.drivers.map((dr, di) => (
                      <div key={di} className="flex items-center gap-3">
                        <span className={`text-xs font-semibold w-20 text-right ${
                          dr.rank === "High" ? "text-red-400" :
                          dr.rank === "Moderate" ? "text-amber-400" :
                          "text-slate-500"
                        }`}>
                          {dr.rank} impact
                        </span>
                        <span className="text-sm text-slate-200">{dr.name}</span>
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
  );
});

export { ExecutiveJudgment };
export type { ExecutiveJudgmentProps };
