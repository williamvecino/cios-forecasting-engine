export interface Archetype {
  archetype_id: string;
  archetype_name: string;
  primary_driver: string;
  evidence_sensitivity: "high" | "moderate" | "low";
  operational_sensitivity: "high" | "moderate" | "low";
  financial_sensitivity: "high" | "moderate" | "low";
  guideline_dependence: "high" | "moderate" | "low";
  risk_tolerance: "high" | "moderate" | "low" | "very_low";
  adoption_timing_tendency: "early" | "mid" | "late" | "very_late";
  influence_level: "high" | "moderate" | "low";
  preferred_evidence_type: string;
  reaction_pattern_summary: string;
}

export const ARCHETYPE_LIBRARY: Archetype[] = [
  {
    archetype_id: "evidence_driven_innovator",
    archetype_name: "Evidence-Driven Innovator",
    primary_driver: "Clinical evidence quality",
    evidence_sensitivity: "high",
    operational_sensitivity: "low",
    financial_sensitivity: "low",
    guideline_dependence: "low",
    risk_tolerance: "high",
    adoption_timing_tendency: "early",
    influence_level: "high",
    preferred_evidence_type: "Phase III survival data, peer-reviewed efficacy",
    reaction_pattern_summary: "Adopts early when efficacy or survival signal is strong. Low guideline dependence. Willing to tolerate operational friction if clinical case is compelling.",
  },
  {
    archetype_id: "operational_pragmatist",
    archetype_name: "Operational Pragmatist",
    primary_driver: "Workflow feasibility and implementation burden",
    evidence_sensitivity: "moderate",
    operational_sensitivity: "high",
    financial_sensitivity: "moderate",
    guideline_dependence: "low",
    risk_tolerance: "moderate",
    adoption_timing_tendency: "mid",
    influence_level: "moderate",
    preferred_evidence_type: "Real-world implementation data, workflow evidence",
    reaction_pattern_summary: "Interested in innovation but delays adoption if staffing, logistics, or infrastructure are weak. Moves when operational path is clear.",
  },
  {
    archetype_id: "guideline_follower",
    archetype_name: "Guideline Follower",
    primary_driver: "Formal consensus, institutional protocol, guideline endorsement",
    evidence_sensitivity: "moderate",
    operational_sensitivity: "moderate",
    financial_sensitivity: "moderate",
    guideline_dependence: "high",
    risk_tolerance: "low",
    adoption_timing_tendency: "late",
    influence_level: "moderate",
    preferred_evidence_type: "NCCN inclusion, society guidelines, institutional protocols",
    reaction_pattern_summary: "Waits for formal guideline endorsement or institutional protocol inclusion before meaningful use. Conference data raises interest but does not trigger adoption.",
  },
  {
    archetype_id: "financial_gatekeeper",
    archetype_name: "Financial Gatekeeper",
    primary_driver: "Reimbursement clarity, payer behavior, cost exposure",
    evidence_sensitivity: "moderate",
    operational_sensitivity: "moderate",
    financial_sensitivity: "high",
    guideline_dependence: "moderate",
    risk_tolerance: "low",
    adoption_timing_tendency: "late",
    influence_level: "moderate",
    preferred_evidence_type: "HEOR data, coverage decisions, cost-effectiveness",
    reaction_pattern_summary: "Delays adoption until coverage is stable and access friction is low. Efficacy alone does not move behavior if reimbursement is uncertain.",
  },
  {
    archetype_id: "skeptical_conservative",
    archetype_name: "Skeptical Conservative",
    primary_driver: "Long-term safety, real-world evidence, proven durability",
    evidence_sensitivity: "moderate",
    operational_sensitivity: "moderate",
    financial_sensitivity: "moderate",
    guideline_dependence: "moderate",
    risk_tolerance: "very_low",
    adoption_timing_tendency: "very_late",
    influence_level: "low",
    preferred_evidence_type: "Post-launch safety data, long-term outcomes, real-world evidence",
    reaction_pattern_summary: "Resists adoption until post-launch evidence accumulates. Requires demonstrated durability and safety track record before switching from established treatments.",
  },
];

export function getArchetypeById(id: string): Archetype | undefined {
  return ARCHETYPE_LIBRARY.find(a => a.archetype_id === id);
}

export function getArchetypeByName(name: string): Archetype | undefined {
  return ARCHETYPE_LIBRARY.find(a => a.archetype_name.toLowerCase() === name.toLowerCase());
}
