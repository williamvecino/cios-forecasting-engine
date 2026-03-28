import { memo } from "react";
import {
  ShieldAlert,
  Target,
  TrendingUp,
  TrendingDown,
  Layers,
  Lightbulb,
  GitCompareArrows,
  Crosshair,
} from "lucide-react";

interface EventGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: string;
  reasoning: string;
  constrains_probability_to: number;
}

interface Driver {
  id: string;
  name: string;
  direction: "Upward" | "Downward";
  strength: "Low" | "Medium" | "High";
  contributionPoints: number;
}

interface DecisionLabSummaryProps {
  brandOutlookPct: number;
  finalForecastPct: number;
  executionGap: number;
  gates: EventGate[];
  drivers: Driver[];
  upsideTotal: number;
  downsideTotal: number;
  topGateDriverName: string | null;
  topGateDriverDelta: number;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    unresolved: "Not yet resolved",
    weak: "Early stage",
    moderate: "Progressing",
    strong: "In place",
  };
  return labels[status] || status.charAt(0).toUpperCase() + status.slice(1);
}

const DecisionLabSummary = memo(function DecisionLabSummary({
  brandOutlookPct,
  finalForecastPct,
  executionGap,
  gates,
  drivers,
  upsideTotal,
  downsideTotal,
  topGateDriverName,
  topGateDriverDelta,
}: DecisionLabSummaryProps) {
  const sortedByImpact = [...gates].sort((a, b) => a.constrains_probability_to - b.constrains_probability_to);
  const mostSensitiveGate = topGateDriverName
    ? gates.find(g => g.gate_label === topGateDriverName) || sortedByImpact[0]
    : sortedByImpact[0];
  const primaryConstraint = mostSensitiveGate;
  const weakGates = gates.filter(g => g.status === "weak" || g.status === "unresolved");
  const moderateGates = gates.filter(g => g.status === "moderate");

  const upwardDrivers = drivers.filter(d => d.direction === "Upward" && d.contributionPoints > 0);
  const downwardDrivers = drivers.filter(d => d.direction === "Downward" && d.contributionPoints < 0);
  const hasConflictingPressures = upwardDrivers.length > 0 && downwardDrivers.length > 0;

  const brandHigh = brandOutlookPct >= 60;
  const brandModerate = brandOutlookPct >= 40 && brandOutlookPct < 60;
  const forecastLow = finalForecastPct < 40;
  const forecastModerate = finalForecastPct >= 40 && finalForecastPct < 60;
  const forecastHigh = finalForecastPct >= 60;
  const largeGap = executionGap >= 15;

  let situationAssessment = "";
  if (brandHigh && forecastLow) {
    situationAssessment = `The therapy shows strong clinical positioning, but the outlook stands at only ${finalForecastPct}%. This gap indicates that practical barriers — not product weakness — are preventing progress.`;
    if (primaryConstraint) {
      situationAssessment += ` The primary bottleneck is "${primaryConstraint.gate_label}" (${statusLabel(primaryConstraint.status)}), which is placing the strongest limit on what is achievable.`;
    }
  } else if (brandHigh && forecastModerate) {
    situationAssessment = `The therapy has strong underlying evidence, but some conditions are partially holding back the outlook to ${finalForecastPct}%.`;
    if (primaryConstraint && (primaryConstraint.status === "weak" || primaryConstraint.status === "unresolved")) {
      situationAssessment += ` Resolving "${primaryConstraint.gate_label}" could allow the outlook to better reflect the underlying strength.`;
    }
  } else if (brandHigh && forecastHigh) {
    situationAssessment = `Both the evidence and operational readiness support this outcome at ${finalForecastPct}%. The clinical profile is strong and key conditions for success are largely in place.`;
  } else if (forecastLow && !brandHigh) {
    situationAssessment = `Both the clinical evidence and operational readiness remain limited. The outlook of ${finalForecastPct}% reflects genuine uncertainty — key conditions have not yet resolved favorably.`;
  } else if (forecastModerate) {
    situationAssessment = `The outcome depends on resolving remaining barriers. The therapy has a ${brandModerate ? "moderate" : "developing"} evidence base, but key conditions have not fully cleared, holding the outlook at ${finalForecastPct}%.`;
  } else {
    situationAssessment = `The outlook of ${finalForecastPct}% reflects the current balance between evidence strength and operational readiness. Watch the primary barrier below for shifts.`;
  }

  let primaryBarrierExplanation = "";
  if (primaryConstraint) {
    primaryBarrierExplanation = `"${primaryConstraint.gate_label}" (${statusLabel(primaryConstraint.status)}) is the factor currently placing the strongest limit on what is achievable`;
    if (primaryConstraint.constrains_probability_to < 1) {
      primaryBarrierExplanation += `, even though other conditions may be favorable`;
    }
    primaryBarrierExplanation += `.`;
  }

  const notHigherReasons: string[] = [];
  for (const g of weakGates) {
    notHigherReasons.push(`"${g.gate_label}" remains ${statusLabel(g.status).toLowerCase()}, limiting what is achievable.`);
  }
  for (const g of moderateGates) {
    notHigherReasons.push(`"${g.gate_label}" is progressing but not yet fully resolved — completing this would unlock additional upside.`);
  }
  if (downwardDrivers.length > 0) {
    const topDown = [...downwardDrivers].sort((a, b) => a.contributionPoints - b.contributionPoints);
    const themes = topDown.slice(0, 3).map(d => d.name);
    notHigherReasons.push(`Negative pressure from: ${themes.join(", ")}.`);
  }
  if (largeGap && notHigherReasons.length === 0) {
    notHigherReasons.push(`A significant gap between evidence strength and outlook suggests unresolved operational or market barriers.`);
  }

  const whatWouldHelp: string[] = [];
  if (primaryConstraint && (primaryConstraint.status === "weak" || primaryConstraint.status === "unresolved")) {
    const potentialGain = topGateDriverDelta > 0 ? ` (estimated improvement: +${topGateDriverDelta} points)` : "";
    whatWouldHelp.push(`Resolve "${primaryConstraint.gate_label}"${potentialGain}. This is the single highest-impact action.`);
  }
  for (const g of weakGates.filter(g => g.gate_id !== primaryConstraint?.gate_id).slice(0, 2)) {
    whatWouldHelp.push(`Address "${g.gate_label}" — currently ${statusLabel(g.status).toLowerCase()}, resolving this would improve the outlook.`);
  }
  for (const g of moderateGates.slice(0, 1)) {
    whatWouldHelp.push(`Strengthen "${g.gate_label}" to fully resolved status to unlock the remaining upside.`);
  }
  if (whatWouldHelp.length === 0) {
    whatWouldHelp.push("All key conditions are progressing or resolved. Focus on strengthening the evidence base to improve the outlook further.");
  }

  let planningGuidance = "";
  if (brandHigh && forecastLow && largeGap) {
    planningGuidance = "The product appears viable, but success within this timeframe depends more on removing practical barriers than on improving clinical positioning. Prioritize operational and access resolution.";
  } else if (brandHigh && forecastModerate) {
    planningGuidance = "The therapy is well-positioned clinically. Improvement is achievable by addressing the remaining barriers. Focus resources on the primary bottleneck.";
  } else if (forecastHigh) {
    planningGuidance = "Conditions are favorable. Shift focus to monitoring for emerging headwinds and sustaining current momentum.";
  } else if (forecastLow && !brandHigh) {
    planningGuidance = "Both product positioning and operational readiness need improvement before committing to aggressive targets. Consider extending the time horizon or addressing fundamental evidence gaps.";
  } else {
    planningGuidance = "The situation is in a transitional range. The most impactful action is resolving the primary barrier identified above.";
  }

  const upwardCategories = new Set(upwardDrivers.map(d => {
    const lower = d.name.toLowerCase();
    if (lower.includes("clinical") || lower.includes("evidence") || lower.includes("trial") || lower.includes("fda") || lower.includes("efficacy")) return "clinical readiness";
    if (lower.includes("payer") || lower.includes("access") || lower.includes("reimbursement") || lower.includes("formulary") || lower.includes("authorization")) return "access readiness";
    if (lower.includes("guideline") || lower.includes("nccn") || lower.includes("recommendation")) return "guideline alignment";
    if (lower.includes("competitor") || lower.includes("market") || lower.includes("share")) return "competitive positioning";
    return "market signals";
  }));
  const downwardCategories = new Set(downwardDrivers.map(d => {
    const lower = d.name.toLowerCase();
    if (lower.includes("clinical") || lower.includes("evidence") || lower.includes("trial") || lower.includes("safety")) return "clinical concerns";
    if (lower.includes("payer") || lower.includes("access") || lower.includes("reimbursement") || lower.includes("authorization") || lower.includes("friction")) return "operational/access barriers";
    if (lower.includes("time") || lower.includes("horizon") || lower.includes("inertia") || lower.includes("adoption") || lower.includes("tempo")) return "adoption timing";
    if (lower.includes("competitor") || lower.includes("market")) return "competitive pressure";
    return "execution barriers";
  }));

  return (
    <div className="rounded-3xl border border-indigo-500/20 bg-gradient-to-b from-[#0B1A3E] to-[#0A1736] p-6 space-y-6">
      <div className="flex items-center gap-3 pb-3 border-b border-white/10">
        <div className="rounded-xl bg-indigo-500/15 p-2">
          <Lightbulb className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Situation Analysis</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">What the evidence tells us and what to do about it</p>
        </div>
      </div>

      <Section icon={<Target className="w-4 h-4 text-blue-400" />} title="Current Assessment">
        <p className="text-sm text-slate-200 leading-relaxed">{situationAssessment}</p>
      </Section>

      <Section icon={<ShieldAlert className="w-4 h-4 text-amber-400" />} title="What Is Holding This Back">
        {primaryConstraint ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                primaryConstraint.status === "unresolved" ? "bg-red-500/15 text-red-300" :
                primaryConstraint.status === "weak" ? "bg-amber-500/15 text-amber-300" :
                primaryConstraint.status === "moderate" ? "bg-yellow-500/15 text-yellow-300" :
                "bg-emerald-500/15 text-emerald-300"
              }`}>
                {statusLabel(primaryConstraint.status)}
              </span>
              <span className="text-sm font-semibold text-white">{primaryConstraint.gate_label}</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{primaryBarrierExplanation}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400 leading-relaxed">No single barrier has been identified as the primary limiting factor. All conditions are contributing evenly to the current outlook.</p>
        )}
      </Section>

      <Section icon={<Layers className="w-4 h-4 text-violet-400" />} title="Key Conditions">
        <div className="space-y-1.5">
          {sortedByImpact.map((g, i) => (
            <div key={g.gate_id} className="flex items-center gap-3 rounded-lg bg-white/[0.02] px-3 py-2">
              <span className="text-[10px] text-slate-500 w-4 text-right font-mono">{i + 1}.</span>
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                g.status === "unresolved" ? "bg-red-400" :
                g.status === "weak" ? "bg-amber-400" :
                g.status === "moderate" ? "bg-yellow-400" :
                "bg-emerald-400"
              }`} />
              <span className="text-xs text-slate-200 flex-1">{g.gate_label}</span>
              <span className={`text-[10px] font-semibold ${
                g.status === "unresolved" ? "text-red-400" :
                g.status === "weak" ? "text-amber-400" :
                g.status === "moderate" ? "text-yellow-400" :
                "text-emerald-400"
              }`}>
                {statusLabel(g.status)}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<TrendingDown className="w-4 h-4 text-rose-400" />} title="Why the Outlook Is Not Better">
        {notHigherReasons.length > 0 ? (
          <ul className="space-y-2">
            {notHigherReasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
                <span className="text-rose-400 shrink-0 mt-0.5">—</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400 leading-relaxed">All key conditions are progressing with no significant negative pressure identified. The outlook reflects the full weight of available evidence.</p>
        )}
      </Section>

      <Section icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} title="What Would Improve the Outlook">
        <ul className="space-y-2">
          {whatWouldHelp.map((lever, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="text-emerald-400 shrink-0 mt-0.5">&rarr;</span>
              <span>{lever}</span>
            </li>
          ))}
        </ul>
      </Section>

      {hasConflictingPressures && (
        <Section icon={<GitCompareArrows className="w-4 h-4 text-blue-400" />} title="Why Signals Can Seem Contradictory">
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            This outlook includes both positive and negative signals. This is not a contradiction — it reflects that different aspects of readiness are at different stages:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upwardDrivers.length > 0 && (
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1.5">Working in Favor</div>
                <div className="space-y-1">
                  {Array.from(upwardCategories).map(cat => (
                    <div key={cat} className="text-xs text-emerald-300/80">&bull; {cat}</div>
                  ))}
                </div>
              </div>
            )}
            {downwardDrivers.length > 0 && (
              <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3">
                <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider mb-1.5">Holding Things Back</div>
                <div className="space-y-1">
                  {Array.from(downwardCategories).map(cat => (
                    <div key={cat} className="text-xs text-rose-300/80">&bull; {cat}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Positive clinical or market signals and negative operational or access signals can coexist. The system is showing that different dimensions of readiness are at different stages.
          </p>
        </Section>
      )}

      <Section icon={<Crosshair className="w-4 h-4 text-indigo-400" />} title="What This Means for Planning">
        <p className="text-sm text-white font-medium leading-relaxed">{planningGuidance}</p>
      </Section>
    </div>
  );
});

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="pl-6">{children}</div>
    </div>
  );
}

export { DecisionLabSummary };
export type { DecisionLabSummaryProps };
