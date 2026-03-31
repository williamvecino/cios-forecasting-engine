import { ARCHETYPE_LIBRARY, type Archetype } from "./archetype-library";

export interface SegmentProfile {
  segment_name: string;
  structural_description?: string;
  center_type?: string;
  trial_participation?: string;
  specialty_experience?: string;
  infrastructure_readiness?: string;
  staffing_capacity?: string;
  institutional_protocol_dependence?: string;
  guideline_dependence?: string;
  payer_friction?: string;
  reimbursement_uncertainty?: string;
  access_barriers?: string;
  switching_friction?: string;
  demand_for_long_term_evidence?: string;
  preference_for_established_standards?: string;
  practice_setting?: string;
  volume_experience?: string;
  infusion_capacity?: string;
  payer_environment?: string;
}

export interface ArchetypeScore {
  archetype_id: string;
  archetype_name: string;
  score: number;
  confidence: "high" | "moderate" | "low";
  reasons: string[];
}

export interface ArchetypeAssignment {
  segment_name: string;
  structural_description: string;
  primary_archetype: ArchetypeScore;
  secondary_archetype: ArchetypeScore | null;
  assignment_confidence: "high" | "moderate" | "low";
  why_assigned: string;
  likely_triggers: string[];
  likely_barriers: string[];
}

interface GateInfo {
  gate_label: string;
  status: string;
  reasoning?: string;
}

const SEGMENT_PRIORS: Record<string, { primary: string[]; secondary: string[] }> = {
  "early_adopters": {
    primary: ["evidence_driven_innovator"],
    secondary: ["operational_pragmatist"],
  },
  "persuadables": {
    primary: ["guideline_follower", "financial_gatekeeper"],
    secondary: ["operational_pragmatist"],
  },
  "late_movers": {
    primary: ["operational_pragmatist", "guideline_follower"],
    secondary: ["financial_gatekeeper"],
  },
  "resistant": {
    primary: ["skeptical_conservative"],
    secondary: ["guideline_follower"],
  },
};

function normalizeSegmentKey(name: string): string {
  const lower = name.toLowerCase().trim();
  if (lower.includes("early")) return "early_adopters";
  if (lower.includes("persuad")) return "persuadables";
  if (lower.includes("late")) return "late_movers";
  if (lower.includes("resist")) return "resistant";
  return lower.replace(/\s+/g, "_");
}

function h(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.toLowerCase();
  return v === "high" || v === "yes" || v === "strong" || v === "present" || v === "constrained" || v === "limited" || v === "restrictive";
}

function l(val: string | undefined): boolean {
  if (!val) return false;
  const v = val.toLowerCase();
  return v === "low" || v === "no" || v === "weak" || v === "absent" || v === "adequate" || v === "stable";
}

function isAcademic(profile: SegmentProfile): boolean {
  const ct = (profile.center_type || "").toLowerCase();
  return ct.includes("academic") || ct.includes("university") || ct.includes("research") || ct.includes("teaching");
}

function isCommunity(profile: SegmentProfile): boolean {
  const ct = (profile.center_type || "").toLowerCase();
  return ct.includes("community") || ct.includes("private") || ct.includes("independent");
}

function isHospitalSystem(profile: SegmentProfile): boolean {
  const ct = (profile.center_type || "").toLowerCase();
  const ps = (profile.practice_setting || "").toLowerCase();
  return ct.includes("hospital") || ct.includes("system") || ct.includes("institution") || ps.includes("hospital");
}

export function assignArchetypes(
  profile: SegmentProfile,
  gates: GateInfo[] = [],
): ArchetypeAssignment {
  const scores: ArchetypeScore[] = ARCHETYPE_LIBRARY.map(arch => ({
    archetype_id: arch.archetype_id,
    archetype_name: arch.archetype_name,
    score: 0,
    confidence: "low" as const,
    reasons: [],
  }));

  function addScore(id: string, points: number, reason: string) {
    const s = scores.find(s => s.archetype_id === id);
    if (s) {
      s.score += points;
      s.reasons.push(reason);
    }
  }

  const segKey = normalizeSegmentKey(profile.segment_name);
  const priors = SEGMENT_PRIORS[segKey];
  if (priors) {
    priors.primary.forEach(id => addScore(id, 3, `Segment "${profile.segment_name}" has prior affinity`));
    priors.secondary.forEach(id => addScore(id, 1, `Secondary prior from segment "${profile.segment_name}"`));
  }

  if (isAcademic(profile)) {
    addScore("evidence_driven_innovator", 3, "Academic center type");
  }
  if (h(profile.trial_participation)) {
    addScore("evidence_driven_innovator", 3, "High trial participation");
  }
  if (h(profile.specialty_experience) || h(profile.volume_experience)) {
    addScore("evidence_driven_innovator", 2, "High specialty/volume experience");
  }

  if (isCommunity(profile)) {
    addScore("operational_pragmatist", 2, "Community practice setting");
  }
  if (h(profile.infrastructure_readiness) === false && profile.infrastructure_readiness) {
    if (l(profile.infrastructure_readiness) || profile.infrastructure_readiness.toLowerCase().includes("limited")) {
      addScore("operational_pragmatist", 3, "Limited infrastructure readiness");
    }
  }
  if (h(profile.staffing_capacity) === false && profile.staffing_capacity) {
    if (l(profile.staffing_capacity) || profile.staffing_capacity.toLowerCase().includes("constrained")) {
      addScore("operational_pragmatist", 3, "Constrained staffing capacity");
    }
  }
  if (profile.infusion_capacity && (profile.infusion_capacity.toLowerCase().includes("limited") || profile.infusion_capacity.toLowerCase().includes("constrained"))) {
    addScore("operational_pragmatist", 2, "Limited infusion capacity");
  }

  if (h(profile.institutional_protocol_dependence)) {
    addScore("guideline_follower", 3, "High institutional protocol dependence");
  }
  if (h(profile.guideline_dependence)) {
    addScore("guideline_follower", 3, "High guideline dependence");
  }
  if (isHospitalSystem(profile)) {
    addScore("guideline_follower", 2, "Hospital/institutional system setting");
  }

  if (h(profile.payer_friction)) {
    addScore("financial_gatekeeper", 3, "High payer friction");
  }
  if (h(profile.reimbursement_uncertainty)) {
    addScore("financial_gatekeeper", 3, "High reimbursement uncertainty");
  }
  if (h(profile.access_barriers)) {
    addScore("financial_gatekeeper", 2, "Access barriers present");
  }
  if (profile.payer_environment && (profile.payer_environment.toLowerCase().includes("restrictive") || profile.payer_environment.toLowerCase().includes("mixed"))) {
    addScore("financial_gatekeeper", 2, "Restrictive payer environment");
  }

  if (h(profile.switching_friction)) {
    addScore("skeptical_conservative", 3, "High switching friction");
  }
  if (h(profile.demand_for_long_term_evidence)) {
    addScore("skeptical_conservative", 3, "High demand for long-term evidence");
  }
  if (h(profile.preference_for_established_standards)) {
    addScore("skeptical_conservative", 2, "Preference for established standards");
  }

  const hasPayerGateWeak = gates.some(g =>
    (g.gate_label.toLowerCase().includes("payer") || g.gate_label.toLowerCase().includes("coverage") || g.gate_label.toLowerCase().includes("reimbursement")) &&
    (g.status === "weak" || g.status === "unresolved")
  );
  if (hasPayerGateWeak) {
    addScore("financial_gatekeeper", 2, "Payer/coverage gate is weak or unresolved");
  }

  const hasGuidelineGateWeak = gates.some(g =>
    (g.gate_label.toLowerCase().includes("guideline") || g.gate_label.toLowerCase().includes("protocol") || g.gate_label.toLowerCase().includes("consensus")) &&
    (g.status === "weak" || g.status === "unresolved")
  );
  if (hasGuidelineGateWeak) {
    addScore("guideline_follower", 2, "Guideline/protocol gate is weak or unresolved");
  }

  const hasOpsGateWeak = gates.some(g =>
    (g.gate_label.toLowerCase().includes("operational") || g.gate_label.toLowerCase().includes("infrastructure") || g.gate_label.toLowerCase().includes("manufacturing") || g.gate_label.toLowerCase().includes("supply") || g.gate_label.toLowerCase().includes("capacity")) &&
    (g.status === "weak" || g.status === "unresolved")
  );
  if (hasOpsGateWeak) {
    addScore("operational_pragmatist", 2, "Operational/infrastructure gate is weak");
  }

  scores.sort((a, b) => b.score - a.score);

  const primary = scores[0];
  const secondary = scores[1]?.score > 0 ? scores[1] : null;

  primary.confidence = primary.score >= 6 ? "high" : primary.score >= 3 ? "moderate" : "low";
  if (secondary) {
    secondary.confidence = secondary.score >= 5 ? "high" : secondary.score >= 3 ? "moderate" : "low";
  }

  const overallConfidence = primary.confidence;

  const archetype = ARCHETYPE_LIBRARY.find(a => a.archetype_id === primary.archetype_id)!;

  const triggers = buildTriggers(primary, secondary, archetype);
  const barriers = buildBarriers(primary, secondary, archetype, gates);

  const whyParts = primary.reasons.slice(0, 3);
  const why = `Assigned as ${archetype.archetype_name} because: ${whyParts.join("; ")}.`;

  return {
    segment_name: profile.segment_name,
    structural_description: profile.structural_description || "",
    primary_archetype: primary,
    secondary_archetype: secondary,
    assignment_confidence: overallConfidence,
    why_assigned: why,
    likely_triggers: triggers,
    likely_barriers: barriers,
  };
}

function buildTriggers(primary: ArchetypeScore, secondary: ArchetypeScore | null, arch: Archetype): string[] {
  const triggers: string[] = [];

  switch (arch.archetype_id) {
    case "evidence_driven_innovator":
      triggers.push("Strong peer-reviewed survival or efficacy data release");
      triggers.push("Positive conference presentation with novel mechanism data");
      break;
    case "operational_pragmatist":
      triggers.push("Workflow simplification or implementation support program");
      triggers.push("Staffing or infrastructure constraint resolution");
      break;
    case "guideline_follower":
      triggers.push("Professional society guideline inclusion or update");
      triggers.push("Institutional protocol committee approval");
      break;
    case "financial_gatekeeper":
      triggers.push("National or regional coverage decision");
      triggers.push("Access support program or reimbursement clarification");
      break;
    case "skeptical_conservative":
      triggers.push("Post-launch real-world safety data publication");
      triggers.push("Long-term durability evidence from extended follow-up");
      break;
  }

  if (secondary) {
    const secArch = ARCHETYPE_LIBRARY.find(a => a.archetype_id === secondary.archetype_id);
    if (secArch?.archetype_id === "financial_gatekeeper") {
      triggers.push("Coverage stability improvement");
    } else if (secArch?.archetype_id === "operational_pragmatist") {
      triggers.push("Operational readiness improvement");
    }
  }

  return triggers;
}

function buildBarriers(primary: ArchetypeScore, secondary: ArchetypeScore | null, arch: Archetype, gates: GateInfo[]): string[] {
  const barriers: string[] = [];

  switch (arch.archetype_id) {
    case "evidence_driven_innovator":
      barriers.push("Insufficient or ambiguous efficacy signal");
      if (gates.some(g => g.status === "weak" || g.status === "unresolved")) {
        barriers.push("Unresolved operational or access gates limiting routine use");
      }
      break;
    case "operational_pragmatist":
      barriers.push("High implementation burden or staffing gaps");
      barriers.push("Insufficient infrastructure for new treatment administration");
      break;
    case "guideline_follower":
      barriers.push("Absence of formal guideline endorsement");
      barriers.push("Pending institutional protocol committee review");
      break;
    case "financial_gatekeeper":
      barriers.push("Unresolved payer coverage or reimbursement uncertainty");
      barriers.push("High patient cost exposure or access friction");
      break;
    case "skeptical_conservative":
      barriers.push("Lack of post-launch real-world evidence");
      barriers.push("Insufficient long-term safety track record");
      break;
  }

  return barriers;
}

export function assignArchetypesForSegmentation(
  segmentation: {
    early_adopters?: { segments: string[]; reason: string };
    persuadables?: { segments: string[]; reason: string };
    late_movers?: { segments: string[]; reason: string };
    resistant?: { segments: string[]; reason: string };
  },
  gates: GateInfo[] = [],
): ArchetypeAssignment[] {
  const results: ArchetypeAssignment[] = [];

  const tiers: { key: string; label: string }[] = [
    { key: "early_adopters", label: "Early Adopters" },
    { key: "persuadables", label: "Persuadables" },
    { key: "late_movers", label: "Late Movers" },
    { key: "resistant", label: "Resistant" },
  ];

  for (const tier of tiers) {
    const data = segmentation[tier.key as keyof typeof segmentation];
    if (!data?.segments?.length) continue;

    const profile: SegmentProfile = {
      segment_name: tier.label,
      structural_description: `${data.segments.join(", ")} — ${data.reason}`,
    };

    const reason = (data.reason || "").toLowerCase();
    const segs = data.segments.map(s => s.toLowerCase()).join(" ");
    const combined = reason + " " + segs;

    if (combined.includes("academic") || combined.includes("university") || combined.includes("research") || combined.includes("teaching")) {
      profile.center_type = "academic";
    } else if (combined.includes("community") || combined.includes("private") || combined.includes("independent")) {
      profile.center_type = "community";
    } else if (combined.includes("hospital") || combined.includes("system") || combined.includes("institution")) {
      profile.center_type = "hospital_system";
    }

    if (combined.includes("trial") || combined.includes("kol") || combined.includes("investigator")) {
      profile.trial_participation = "high";
    }

    if (combined.includes("infrastructure") && (combined.includes("limited") || combined.includes("lack") || combined.includes("constrained"))) {
      profile.infrastructure_readiness = "limited";
    }

    if (combined.includes("staffing") && (combined.includes("limited") || combined.includes("shortage") || combined.includes("constrained"))) {
      profile.staffing_capacity = "constrained";
    }

    if (combined.includes("guideline") || combined.includes("protocol") || combined.includes("committee") || combined.includes("nccn")) {
      profile.guideline_dependence = "high";
    }
    if (combined.includes("institutional") && (combined.includes("protocol") || combined.includes("committee"))) {
      profile.institutional_protocol_dependence = "high";
    }

    if (combined.includes("payer") || combined.includes("reimbursement") || combined.includes("coverage")) {
      if (combined.includes("restrict") || combined.includes("uncertain") || combined.includes("pending") || combined.includes("wait")) {
        profile.payer_friction = "high";
        profile.reimbursement_uncertainty = "high";
      }
    }
    if (combined.includes("access") && (combined.includes("barrier") || combined.includes("limit") || combined.includes("restrict"))) {
      profile.access_barriers = "present";
    }

    if (combined.includes("conservative") || combined.includes("established") || combined.includes("reluctant") || combined.includes("proven")) {
      profile.preference_for_established_standards = "high";
    }
    if (combined.includes("safety") || combined.includes("long-term") || combined.includes("real-world") || combined.includes("durability")) {
      profile.demand_for_long_term_evidence = "high";
    }
    if (combined.includes("switch") && (combined.includes("reluct") || combined.includes("resist") || combined.includes("friction"))) {
      profile.switching_friction = "high";
    }

    if (combined.includes("infusion") && (combined.includes("limited") || combined.includes("constrained") || combined.includes("capacity"))) {
      profile.infusion_capacity = "limited";
    }

    const assignment = assignArchetypes(profile, gates);
    results.push(assignment);
  }

  return results;
}
