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



function gateStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
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

  let executiveDiagnosis = "";
  if (brandHigh && forecastLow) {
    executiveDiagnosis = `The therapy demonstrates strong clinical positioning (${brandOutlookPct}% brand outlook), but the current forecast stands at only ${finalForecastPct}%. This ${executionGap}-point gap indicates that execution barriers — not product weakness — are preventing the forecast from reflecting the underlying brand strength.`;
    if (primaryConstraint) {
      executiveDiagnosis += ` The primary bottleneck is "${primaryConstraint.gate_label}" (${gateStatusLabel(primaryConstraint.status)}), which is placing the strongest ceiling on achievable probability.`;
    }
  } else if (brandHigh && forecastModerate) {
    executiveDiagnosis = `The therapy has strong upstream signals (${brandOutlookPct}% brand outlook), but event gates are partially constraining the forecast to ${finalForecastPct}%.`;
    if (primaryConstraint && (primaryConstraint.status === "weak" || primaryConstraint.status === "unresolved")) {
      executiveDiagnosis += ` Clearing the "${primaryConstraint.gate_label}" constraint could allow the forecast to better align with brand strength.`;
    }
  } else if (brandHigh && forecastHigh) {
    executiveDiagnosis = `Both evidence strength and operational readiness support adoption at ${finalForecastPct}%. The clinical profile is strong and key conditions for market uptake are largely in place. The execution gap is minimal (${executionGap} pts).`;
  } else if (forecastLow && !brandHigh) {
    executiveDiagnosis = `Both clinical evidence strength and operational readiness remain limited. The forecast of ${finalForecastPct}% reflects genuine uncertainty — regulatory, clinical, or competitive factors have not yet resolved favorably.`;
  } else if (forecastModerate) {
    executiveDiagnosis = `Adoption depends on resolving remaining barriers. The therapy has a ${brandModerate ? "moderate" : "developing"} evidence base at ${brandOutlookPct}% brand outlook, but key gating conditions have not fully cleared, holding the forecast at ${finalForecastPct}%.`;
  } else {
    executiveDiagnosis = `The forecast of ${finalForecastPct}% reflects the current balance between evidence strength (${brandOutlookPct}% brand outlook) and operational readiness. Monitor the primary constraint below for shifts.`;
  }

  let primaryConstraintExplanation = "";
  if (primaryConstraint) {
    primaryConstraintExplanation = `The primary constraint is "${primaryConstraint.gate_label}" (${gateStatusLabel(primaryConstraint.status)}). This is the factor currently placing the strongest ceiling on the forecast`;
    if (primaryConstraint.constrains_probability_to < 1) {
      primaryConstraintExplanation += `, capping achievable probability at ${Math.round(primaryConstraint.constrains_probability_to * 100)}%`;
    }
    primaryConstraintExplanation += `, even though other conditions may be favorable.`;
  }

  const notHigherReasons: string[] = [];
  for (const g of weakGates) {
    notHigherReasons.push(`"${g.gate_label}" remains ${gateStatusLabel(g.status).toLowerCase()}, constraining the forecast to ≤${Math.round(g.constrains_probability_to * 100)}%.`);
  }
  for (const g of moderateGates) {
    notHigherReasons.push(`"${g.gate_label}" is only moderate — full resolution would unlock additional upside.`);
  }
  if (downwardDrivers.length > 0) {
    const topDown = [...downwardDrivers].sort((a, b) => a.contributionPoints - b.contributionPoints);
    const themes = topDown.slice(0, 3).map(d => d.name);
    notHigherReasons.push(`Downward pressure from: ${themes.join(", ")} (total: -${downsideTotal} pts).`);
  }
  if (largeGap && notHigherReasons.length === 0) {
    notHigherReasons.push(`A ${executionGap}-point execution gap between brand strength and forecast suggests unresolved operational or market barriers.`);
  }

  const increaseLevers: string[] = [];
  if (primaryConstraint && (primaryConstraint.status === "weak" || primaryConstraint.status === "unresolved")) {
    const potentialGain = topGateDriverDelta > 0 ? ` (estimated +${topGateDriverDelta} pts)` : "";
    increaseLevers.push(`Resolve the primary constraint "${primaryConstraint.gate_label}"${potentialGain}. This is the single highest-leverage change.`);
  }
  for (const g of weakGates.filter(g => g.gate_id !== primaryConstraint?.gate_id).slice(0, 2)) {
    increaseLevers.push(`Address "${g.gate_label}" — currently ${gateStatusLabel(g.status).toLowerCase()}, improving this would raise the probability cap.`);
  }
  for (const g of moderateGates.slice(0, 1)) {
    increaseLevers.push(`Strengthen "${g.gate_label}" from moderate to strong to unlock the remaining cap it imposes.`);
  }
  if (increaseLevers.length === 0) {
    increaseLevers.push("All gates are currently strong or moderate. Focus on strengthening signal evidence to increase the Bayesian posterior.");
  }

  let decisionImplication = "";
  if (brandHigh && forecastLow && largeGap) {
    decisionImplication = "The product appears viable, but success within the selected timeframe depends more on removing execution friction than on improving clinical positioning. Prioritize operational and access barrier resolution.";
  } else if (brandHigh && forecastModerate) {
    decisionImplication = "The therapy is well-positioned clinically. Forecast improvement is achievable by addressing the remaining gate constraints. Focus resources on the primary bottleneck.";
  } else if (forecastHigh) {
    decisionImplication = "Conditions are favorable for adoption within the forecast window. Shift focus to monitoring for emerging headwinds and sustaining current momentum.";
  } else if (forecastLow && !brandHigh) {
    decisionImplication = "Both product positioning and execution readiness need improvement before committing to aggressive adoption targets. Consider extending the time horizon or addressing fundamental evidence gaps.";
  } else {
    decisionImplication = "The forecast is in a transitional range. The most impactful action is resolving the primary constraint identified above.";
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
          <h2 className="text-sm font-bold text-white uppercase tracking-wider">Decision Lab Summary</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Deterministic interpretation of forecast outputs</p>
        </div>
      </div>

      <Section icon={<Target className="w-4 h-4 text-blue-400" />} title="Executive Diagnosis">
        <p className="text-sm text-slate-200 leading-relaxed">{executiveDiagnosis}</p>
      </Section>

      <Section icon={<ShieldAlert className="w-4 h-4 text-amber-400" />} title="Primary Constraint">
        {primaryConstraint ? (
          <>
            <div className="flex items-center gap-3 mb-2">
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                primaryConstraint.status === "unresolved" ? "bg-red-500/15 text-red-300" :
                primaryConstraint.status === "weak" ? "bg-amber-500/15 text-amber-300" :
                primaryConstraint.status === "moderate" ? "bg-yellow-500/15 text-yellow-300" :
                "bg-emerald-500/15 text-emerald-300"
              }`}>
                {gateStatusLabel(primaryConstraint.status)}
              </span>
              <span className="text-sm font-semibold text-white">{primaryConstraint.gate_label}</span>
              <span className="text-[10px] text-slate-500">cap: ≤{Math.round(primaryConstraint.constrains_probability_to * 100)}%</span>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed">{primaryConstraintExplanation}</p>
          </>
        ) : (
          <p className="text-sm text-slate-400 leading-relaxed">No individual gate has been identified as the primary constraint. All gates are contributing evenly to the current forecast level.</p>
        )}
      </Section>

      <Section icon={<Layers className="w-4 h-4 text-violet-400" />} title="Constraint Hierarchy">
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
                {gateStatusLabel(g.status)}
              </span>
              <span className="text-[10px] text-slate-500">≤{Math.round(g.constrains_probability_to * 100)}%</span>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<TrendingDown className="w-4 h-4 text-rose-400" />} title="Why the Forecast Is Not Higher">
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
          <p className="text-sm text-slate-400 leading-relaxed">All gates are currently at moderate or strong status with no significant downward pressure identified. The forecast reflects the full weight of available evidence.</p>
        )}
      </Section>

      <Section icon={<TrendingUp className="w-4 h-4 text-emerald-400" />} title="What Would Increase the Forecast">
        <ul className="space-y-2">
          {increaseLevers.map((lever, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300 leading-relaxed">
              <span className="text-emerald-400 shrink-0 mt-0.5">→</span>
              <span>{lever}</span>
            </li>
          ))}
        </ul>
      </Section>

      {hasConflictingPressures && (
        <Section icon={<GitCompareArrows className="w-4 h-4 text-blue-400" />} title="Why Signals Can Seem Contradictory">
          <p className="text-sm text-slate-300 leading-relaxed mb-3">
            This forecast includes both upward pressure (+{upsideTotal} pts) and downward pressure (-{downsideTotal} pts). This is not a model contradiction — it reflects asynchronous readiness across different adoption domains:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upwardDrivers.length > 0 && (
              <div className="rounded-xl bg-emerald-500/5 border border-emerald-500/15 p-3">
                <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1.5">Favorable Domains</div>
                <div className="space-y-1">
                  {Array.from(upwardCategories).map(cat => (
                    <div key={cat} className="text-xs text-emerald-300/80">• {cat}</div>
                  ))}
                </div>
              </div>
            )}
            {downwardDrivers.length > 0 && (
              <div className="rounded-xl bg-rose-500/5 border border-rose-500/15 p-3">
                <div className="text-[10px] text-rose-400 font-semibold uppercase tracking-wider mb-1.5">Constraining Domains</div>
                <div className="space-y-1">
                  {Array.from(downwardCategories).map(cat => (
                    <div key={cat} className="text-xs text-rose-300/80">• {cat}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-3 leading-relaxed">
            Positive clinical, evidence, or market signals and negative operational, access, or behavioral signals can coexist legitimately. The system is detecting that different dimensions of adoption readiness are at different stages of maturity.
          </p>
        </Section>
      )}

      <Section icon={<Crosshair className="w-4 h-4 text-indigo-400" />} title="Decision Implication">
        <p className="text-sm text-white font-medium leading-relaxed">{decisionImplication}</p>
      </Section>

      <div className="pt-3 border-t border-white/10 flex items-center gap-2 text-[10px] text-slate-600">
        <span>Deterministic template logic</span>
        <span>·</span>
        <span>No generative text</span>
        <span>·</span>
        <span>Derived from forecast outputs</span>
      </div>
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
