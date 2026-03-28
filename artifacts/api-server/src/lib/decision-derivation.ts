export type DecisionType = "barrier" | "action" | "segment_assignment" | "trigger_event" | "monitoring_item";
export type GateStatus = "strong" | "moderate" | "weak" | "unresolved";
export type BarrierSeverity = "High" | "Moderate" | "Low";
export type SegmentTier = "early_adopter" | "persuadable" | "late_mover" | "resistant";

export interface ForecastGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: GateStatus;
  reasoning: string;
  constrains_probability_to: number;
}

export interface DecisionItem {
  decision_id: string;
  decision_type: DecisionType;
  title: string;
  rationale: string;
  source_gate_id: string;
  source_gate_label: string;
  source_gate_status: GateStatus;
  forecast_dependency: string;
  severity_or_priority: string;
  derived_from_forecast: true;
}

export interface DerivedDecisions {
  barriers: DecisionItem[];
  actions: DecisionItem[];
  segments: DecisionItem[];
  trigger_events: DecisionItem[];
  monitoring: DecisionItem[];
}

const GATE_STATUS_RANK: Record<GateStatus, number> = { unresolved: 0, weak: 1, moderate: 2, strong: 3 };

function gateToBarrierSeverity(status: GateStatus): BarrierSeverity {
  if (status === "strong") return "Low";
  if (status === "moderate") return "Moderate";
  return "High";
}

function gateToPriority(status: GateStatus): string {
  if (status === "unresolved") return "Critical";
  if (status === "weak") return "High";
  if (status === "moderate") return "Medium";
  return "Low";
}

function gateToSegmentTier(gates: ForecastGate[]): { tier: SegmentTier; rationale: string }[] {
  const sorted = [...gates].sort((a, b) => GATE_STATUS_RANK[a.status] - GATE_STATUS_RANK[b.status]);
  const weakCount = gates.filter(g => g.status === "weak" || g.status === "unresolved").length;
  const strongCount = gates.filter(g => g.status === "strong").length;
  const totalGates = gates.length;

  const segments: { tier: SegmentTier; rationale: string }[] = [];

  if (strongCount >= Math.ceil(totalGates * 0.6)) {
    segments.push({
      tier: "early_adopter",
      rationale: `${strongCount} of ${totalGates} gates are strong — providers with infrastructure and familiarity will move first.`,
    });
  }

  if (strongCount > 0 && weakCount > 0) {
    segments.push({
      tier: "persuadable",
      rationale: `Mixed gate profile (${strongCount} strong, ${weakCount} weak/unresolved) — some providers can be convinced if key barriers are addressed.`,
    });
  }

  if (weakCount >= 2) {
    segments.push({
      tier: "late_mover",
      rationale: `${weakCount} gates are weak or unresolved — providers without infrastructure or coverage will wait.`,
    });
  }

  if (weakCount >= Math.ceil(totalGates * 0.6)) {
    segments.push({
      tier: "resistant",
      rationale: `Most gates (${weakCount}/${totalGates}) are weak or unresolved — providers in this profile will not adopt without major changes.`,
    });
  }

  if (segments.length === 0) {
    segments.push({
      tier: "persuadable",
      rationale: `Gate profile is mixed — adoption depends on resolving remaining moderate barriers.`,
    });
  }

  return segments;
}

export function deriveDecisions(
  gates: ForecastGate[],
  brandOutlook: number | null,
  constrainedProb: number | null,
): DerivedDecisions {
  const barriers: DecisionItem[] = [];
  const actions: DecisionItem[] = [];
  const segments: DecisionItem[] = [];
  const triggerEvents: DecisionItem[] = [];
  const monitoring: DecisionItem[] = [];

  const sorted = [...gates].sort((a, b) => GATE_STATUS_RANK[a.status] - GATE_STATUS_RANK[b.status]);
  const weakestGate = sorted[0];
  const brandPct = brandOutlook != null ? Math.round(brandOutlook * 100) : null;
  const finalPct = constrainedProb != null ? Math.round(constrainedProb * 100) : null;
  const brandStrongFinalLow = brandPct != null && finalPct != null && brandPct >= 60 && finalPct < 40;

  for (const gate of gates) {
    const severity = gateToBarrierSeverity(gate.status);
    const priority = gateToPriority(gate.status);
    const capPct = Math.round(gate.constrains_probability_to * 100);

    if (gate.status !== "strong") {
      barriers.push({
        decision_id: `barrier_${gate.gate_id}`,
        decision_type: "barrier",
        title: `${gate.gate_label} barrier`,
        rationale: gate.reasoning,
        source_gate_id: gate.gate_id,
        source_gate_label: gate.gate_label,
        source_gate_status: gate.status,
        forecast_dependency: `This gate constrains the forecast to ≤${capPct}%. Status: ${gate.status}.`,
        severity_or_priority: severity,
        derived_from_forecast: true,
      });
    }

    if (gate.status === "weak" || gate.status === "unresolved") {
      actions.push({
        decision_id: `action_${gate.gate_id}`,
        decision_type: "action",
        title: `Address: ${gate.gate_label}`,
        rationale: `This gate is ${gate.status} and is the ${gate === weakestGate ? "primary" : "a contributing"} constraint on the forecast.`,
        source_gate_id: gate.gate_id,
        source_gate_label: gate.gate_label,
        source_gate_status: gate.status,
        forecast_dependency: `Resolving this gate could lift the forecast cap from ${capPct}% toward the brand outlook${brandPct != null ? ` of ${brandPct}%` : ""}.`,
        severity_or_priority: priority,
        derived_from_forecast: true,
      });

      triggerEvents.push({
        decision_id: `trigger_${gate.gate_id}`,
        decision_type: "trigger_event",
        title: `Watch for: ${gate.gate_label} resolution`,
        rationale: `Gate is ${gate.status}. Resolution would remove a ${capPct}% probability ceiling.`,
        source_gate_id: gate.gate_id,
        source_gate_label: gate.gate_label,
        source_gate_status: gate.status,
        forecast_dependency: `This is a gating condition — its resolution is required for the forecast to exceed ${capPct}%.`,
        severity_or_priority: priority,
        derived_from_forecast: true,
      });
    }

    if (gate.status === "moderate") {
      actions.push({
        decision_id: `action_moderate_${gate.gate_id}`,
        decision_type: "action",
        title: `Strengthen: ${gate.gate_label}`,
        rationale: `This gate is moderate — strengthening it would widen the adoption ceiling.`,
        source_gate_id: gate.gate_id,
        source_gate_label: gate.gate_label,
        source_gate_status: gate.status,
        forecast_dependency: `Moving this gate from moderate to strong could improve the forecast cap from ${capPct}% toward ${Math.min(capPct + 20, 95)}%.`,
        severity_or_priority: "Medium",
        derived_from_forecast: true,
      });
    }

    if (gate.status === "strong") {
      monitoring.push({
        decision_id: `monitor_${gate.gate_id}`,
        decision_type: "monitoring_item",
        title: `Protect: ${gate.gate_label}`,
        rationale: `This gate is strong — protect it from regression.`,
        source_gate_id: gate.gate_id,
        source_gate_label: gate.gate_label,
        source_gate_status: gate.status,
        forecast_dependency: `This gate supports the current forecast. If it weakens, the forecast will decline.`,
        severity_or_priority: "Low",
        derived_from_forecast: true,
      });
    }
  }

  if (brandStrongFinalLow && weakestGate) {
    const existing = actions.find(a => a.source_gate_id === weakestGate.gate_id);
    if (existing) {
      existing.rationale = `Brand outlook is strong (${brandPct}%) but the forecast is constrained to ${finalPct}%. The gap is caused by this gate, not product weakness. Prioritize execution over evidence.`;
    }
  }

  const segmentDerivations = gateToSegmentTier(gates);
  for (const seg of segmentDerivations) {
    const refGate = seg.tier === "early_adopter" || seg.tier === "persuadable"
      ? gates.find(g => g.status === "strong") || gates[0]
      : sorted[0];
    segments.push({
      decision_id: `segment_${seg.tier}`,
      decision_type: "segment_assignment",
      title: seg.tier.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      rationale: seg.rationale,
      source_gate_id: refGate.gate_id,
      source_gate_label: refGate.gate_label,
      source_gate_status: refGate.status,
      forecast_dependency: `Segment assignment derived from gate profile: ${gates.map(g => `${g.gate_label}=${g.status}`).join(", ")}.`,
      severity_or_priority: seg.tier === "early_adopter" ? "Primary" : seg.tier === "persuadable" ? "Secondary" : "Tertiary",
      derived_from_forecast: true,
    });
  }

  return { barriers, actions, segments, trigger_events: triggerEvents, monitoring };
}
