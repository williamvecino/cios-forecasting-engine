import { pgTable, text, real, integer, timestamp, uuid } from "drizzle-orm/pg-core";

export const CANDIDATE_DOMAINS = [
  "clinical_efficacy",
  "safety_tolerability",
  "delivery_convenience",
  "adherence_impact",
  "physician_perception",
  "specialist_concentration",
  "guideline_endorsement",
  "payer_reimbursement",
  "hospital_workflow",
  "competitor_pressure",
  "kol_endorsement",
  "real_world_evidence",
  "regulatory_status",
  "patient_segmentation",
] as const;

export type CandidateDomain = (typeof CANDIDATE_DOMAINS)[number];

export const DOMAIN_LABELS: Record<CandidateDomain, string> = {
  clinical_efficacy: "Clinical Efficacy",
  safety_tolerability: "Safety & Tolerability",
  delivery_convenience: "Delivery & Convenience",
  adherence_impact: "Adherence & Persistence",
  physician_perception: "Physician Perception",
  specialist_concentration: "Specialist Concentration",
  guideline_endorsement: "Guideline & Society Endorsement",
  payer_reimbursement: "Payer & Reimbursement",
  hospital_workflow: "Hospital & Workflow",
  competitor_pressure: "Competitor Pressure",
  kol_endorsement: "KOL Endorsement",
  real_world_evidence: "Real-World Evidence",
  regulatory_status: "Regulatory Status",
  patient_segmentation: "Patient Segmentation",
};

export const DOMAIN_TO_SIGNAL_TYPE: Record<CandidateDomain, string> = {
  clinical_efficacy: "Phase III clinical",
  safety_tolerability: "Regulatory / clinical",
  delivery_convenience: "Field intelligence",
  adherence_impact: "Field intelligence",
  physician_perception: "Field intelligence",
  specialist_concentration: "Field intelligence",
  guideline_endorsement: "Guideline inclusion",
  payer_reimbursement: "Access / commercial",
  hospital_workflow: "Operational friction",
  competitor_pressure: "Competitor counteraction",
  kol_endorsement: "KOL endorsement",
  real_world_evidence: "Phase III clinical",
  regulatory_status: "Regulatory / clinical",
  patient_segmentation: "Field intelligence",
};

export const candidateSignalsTable = pgTable("candidate_signals", {
  id: uuid("id").primaryKey().defaultRandom(),
  caseId: text("case_id").notNull(),
  status: text("status").notNull().default("pending"),
  signalDescription: text("signal_description").notNull(),
  signalType: text("signal_type").notNull(),
  direction: text("direction").notNull().default("Positive"),
  strengthScore: integer("strength_score").notNull().default(3),
  reliabilityScore: integer("reliability_score").notNull().default(3),
  scope: text("scope").notNull().default("national"),
  timing: text("timing").notNull().default("current"),
  likelihoodRatio: real("likelihood_ratio").notNull().default(1.0),
  domain: text("domain").notNull(),
  promotedSignalId: text("promoted_signal_id"),
  createdAt: timestamp("created_at").defaultNow(),
});
