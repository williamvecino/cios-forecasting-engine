type GateStatus = "strong" | "moderate" | "weak" | "unresolved";

interface EventGate {
  gate_id: string;
  gate_label: string;
  description: string;
  status: GateStatus;
  reasoning: string;
  constrains_probability_to: number;
}

interface SignalInput {
  id: string;
  text: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  reliability: "Confirmed" | "Probable" | "Speculative";
  category: string;
  signal_family?: string;
  accepted: boolean;
}

export interface SignalGateMapping {
  signal_id: string;
  signal_text: string;
  target_gate_id: string;
  target_gate_label: string;
  direction: "positive" | "negative" | "neutral";
  strength: "High" | "Medium" | "Low";
  confidence: "High" | "Medium" | "Low";
  evidence_weight: number;
  signal_type: string;
}

export interface GateImpact {
  gate_id: string;
  gate_label: string;
  previous_status: GateStatus;
  new_status: GateStatus;
  previous_cap: number;
  new_cap: number;
  changed: boolean;
  ceiling_hit: boolean;
  signal_count: number;
  net_evidence: number;
}

export interface SignalDiagnostic {
  signal_id: string;
  signal_text: string;
  signal_accepted: boolean;
  gate_affected: string;
  gate_affected_label: string;
  gate_change: { from: GateStatus; to: GateStatus } | null;
  forecast_change: { from: number; to: number } | null;
  ceiling_hit: boolean;
  evidence_weight: number;
}

export interface RecalculationResult {
  updated_gates: EventGate[];
  gate_impacts: GateImpact[];
  previous_forecast: number;
  new_forecast: number;
  diagnostics: SignalDiagnostic[];
}

const GATE_STATUS_ORDER: GateStatus[] = ["unresolved", "weak", "moderate", "strong"];

const GATE_STATUS_CAP_BAND: Record<GateStatus, [number, number]> = {
  unresolved: [0.10, 0.45],
  weak: [0.30, 0.55],
  moderate: [0.50, 0.75],
  strong: [0.70, 0.95],
};

const STRENGTH_WEIGHT: Record<string, number> = { High: 4, Medium: 2.5, Low: 1 };
const RELIABILITY_WEIGHT: Record<string, number> = { Confirmed: 3, Probable: 2, Speculative: 1 };

const CATEGORY_GATE_KEYWORDS: Record<string, string[]> = {
  evidence: ["clinical", "efficacy", "safety", "trial", "data", "evidence", "endpoint", "phase", "study", "tolerab", "biomark"],
  access: ["access", "payer", "formulary", "coverage", "reimburse", "prior auth", "step therapy", "tier", "insur", "cost"],
  competition: ["compet", "rival", "altern", "switch", "displace", "market share", "biosimilar", "generic"],
  guideline: ["guideline", "nccn", "asco", "recommendation", "standard of care", "protocol", "consensus", "label"],
  timing: ["timeline", "delay", "approval", "filing", "submission", "launch", "regulatory", "fda", "ema"],
  adoption: ["adopt", "prescrib", "physician", "provider", "kol", "utiliz", "uptake", "penetrat", "awareness", "comfort"],
};

const FAMILY_GATE_KEYWORDS: Record<string, string[]> = {
  brand_clinical_regulatory: ["clinical", "regulatory", "approval", "efficacy", "safety", "fda", "trial", "evidence"],
  payer_access: ["payer", "access", "coverage", "formulary", "reimburse", "cost", "tier"],
  competitor: ["compet", "rival", "market share", "switch", "displace", "biosimilar"],
  patient_demand: ["patient", "demand", "adherence", "compliance", "prefer", "quality of life", "burden"],
  provider_behavioral: ["provider", "prescrib", "physician", "kol", "comfort", "confidence", "adoption", "awareness"],
  system_operational: ["operational", "supply", "distribution", "infrastructure", "capacity", "site", "workflow"],
};

function computeMatchScore(gateText: string, keywords: string[]): number {
  const lower = gateText.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw.toLowerCase())) score += 1;
  }
  return score;
}

export function mapSignalToGate(signal: SignalInput, gates: EventGate[]): string | null {
  if (gates.length === 0) return null;

  const categoryKeywords = CATEGORY_GATE_KEYWORDS[signal.category] || [];
  const familyKeywords = FAMILY_GATE_KEYWORDS[signal.signal_family || ""] || [];
  const signalTextKeywords = signal.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);

  let bestGateId: string | null = null;
  let bestScore = 0;

  for (const gate of gates) {
    const gateText = `${gate.gate_label} ${gate.description}`.toLowerCase();
    let score = 0;
    score += computeMatchScore(gateText, categoryKeywords) * 3;
    score += computeMatchScore(gateText, familyKeywords) * 2;

    for (const word of signalTextKeywords) {
      if (gateText.includes(word)) score += 0.5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestGateId = gate.gate_id;
    }
  }

  if (bestScore < 1) {
    return null;
  }

  return bestGateId;
}

export function createSignalGateMapping(signal: SignalInput, gate: EventGate): SignalGateMapping {
  const rawWeight = (STRENGTH_WEIGHT[signal.strength] || 2) * (RELIABILITY_WEIGHT[signal.reliability] || 2);
  const confidence = signal.reliability === "Confirmed" ? "High" : signal.reliability === "Probable" ? "Medium" : "Low";
  const directionMultiplier = signal.direction === "negative" ? -1 : signal.direction === "neutral" ? 0 : 1;

  return {
    signal_id: signal.id,
    signal_text: signal.text,
    target_gate_id: gate.gate_id,
    target_gate_label: gate.gate_label,
    direction: signal.direction,
    strength: signal.strength,
    confidence,
    evidence_weight: rawWeight * directionMultiplier,
    signal_type: signal.category,
  };
}

function statusIndex(status: GateStatus): number {
  return GATE_STATUS_ORDER.indexOf(status);
}

function clampStatus(idx: number): GateStatus {
  return GATE_STATUS_ORDER[Math.max(0, Math.min(GATE_STATUS_ORDER.length - 1, idx))];
}

function capForStatus(status: GateStatus, positionInBand: number = 0.5): number {
  const band = GATE_STATUS_CAP_BAND[status];
  const p = Math.max(0, Math.min(1, positionInBand));
  return band[0] + p * (band[1] - band[0]);
}

function computeConstrainedProbability(gates: EventGate[], brandOutlook: number): number {
  if (gates.length === 0) return brandOutlook;
  const caps = gates.map(g => typeof g.constrains_probability_to === "number" ? Math.max(0, Math.min(1, g.constrains_probability_to)) : 0.5);
  const minCap = Math.min(...caps);
  const hasWeakOrUnresolved = gates.some(g => g.status === "weak" || g.status === "unresolved");
  const constrained = hasWeakOrUnresolved ? Math.min(minCap, 0.70) : minCap;
  return Math.min(constrained, brandOutlook);
}

export function recalculateGatesFromSignals(
  baseGates: EventGate[],
  acceptedSignals: SignalInput[],
  brandOutlook: number
): RecalculationResult {
  const signalsByGate = new Map<string, SignalGateMapping[]>();
  const allMappings: SignalGateMapping[] = [];

  for (const signal of acceptedSignals) {
    if (!signal.accepted) continue;
    const targetGateId = mapSignalToGate(signal, baseGates);
    if (!targetGateId) continue;
    const gate = baseGates.find(g => g.gate_id === targetGateId);
    if (!gate) continue;
    const mapping = createSignalGateMapping(signal, gate);
    allMappings.push(mapping);
    if (!signalsByGate.has(targetGateId)) signalsByGate.set(targetGateId, []);
    signalsByGate.get(targetGateId)!.push(mapping);
  }

  const previousForecast = Math.round(computeConstrainedProbability(baseGates, brandOutlook) * 100);

  const updatedGates: EventGate[] = [];
  const gateImpacts: GateImpact[] = [];

  for (const gate of baseGates) {
    const signals = signalsByGate.get(gate.gate_id) || [];
    const netEvidence = signals.reduce((sum, s) => sum + s.evidence_weight, 0);

    const signalCount = signals.filter(s => s.evidence_weight !== 0).length;
    let statusShift = 0;
    if (netEvidence >= 20 && signalCount >= 3) statusShift = 2;
    else if (netEvidence >= 8) statusShift = 1;
    else if (netEvidence <= -20 && signalCount >= 3) statusShift = -2;
    else if (netEvidence <= -8) statusShift = -1;

    const currentIdx = statusIndex(gate.status);
    const newIdx = Math.max(0, Math.min(GATE_STATUS_ORDER.length - 1, currentIdx + statusShift));
    const newStatus = GATE_STATUS_ORDER[newIdx];

    const currentBand = GATE_STATUS_CAP_BAND[gate.status];
    const posInBand = currentBand[1] > currentBand[0]
      ? (gate.constrains_probability_to - currentBand[0]) / (currentBand[1] - currentBand[0])
      : 0.5;

    const newCap = capForStatus(newStatus, Math.max(0, Math.min(1, posInBand)));

    const changed = newStatus !== gate.status;
    const ceilingHit = gate.status === "strong" && statusShift >= 0 && signals.length > 0;

    updatedGates.push({
      ...gate,
      status: newStatus,
      constrains_probability_to: newCap,
      reasoning: changed
        ? `${gate.reasoning} [Updated: ${signals.length} signal(s) moved gate from ${gate.status} to ${newStatus}]`
        : gate.reasoning,
    });

    gateImpacts.push({
      gate_id: gate.gate_id,
      gate_label: gate.gate_label,
      previous_status: gate.status,
      new_status: newStatus,
      previous_cap: gate.constrains_probability_to,
      new_cap: newCap,
      changed,
      ceiling_hit: ceilingHit,
      signal_count: signals.length,
      net_evidence: netEvidence,
    });
  }

  const newForecast = Math.round(computeConstrainedProbability(updatedGates, brandOutlook) * 100);

  const diagnostics: SignalDiagnostic[] = allMappings.map(mapping => {
    const impact = gateImpacts.find(gi => gi.gate_id === mapping.target_gate_id);
    return {
      signal_id: mapping.signal_id,
      signal_text: mapping.signal_text,
      signal_accepted: true,
      gate_affected: mapping.target_gate_id,
      gate_affected_label: mapping.target_gate_label,
      gate_change: impact && impact.changed
        ? { from: impact.previous_status, to: impact.new_status }
        : null,
      forecast_change: newForecast !== previousForecast
        ? { from: previousForecast, to: newForecast }
        : null,
      ceiling_hit: impact?.ceiling_hit || false,
      evidence_weight: mapping.evidence_weight,
    };
  });

  return {
    updated_gates: updatedGates,
    gate_impacts: gateImpacts,
    previous_forecast: previousForecast,
    new_forecast: newForecast,
    diagnostics,
  };
}
