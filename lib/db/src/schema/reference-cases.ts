import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const referenceCasesTable = pgTable("reference_cases", {
  id: text("id").primaryKey(),
  referenceCaseId: text("reference_case_id").notNull().unique(),
  caseName: text("case_name").notNull(),
  decisionDomain: text("decision_domain"),
  questionText: text("question_text").notNull(),
  comparisonGroups: text("comparison_groups"),
  forecastHorizon: text("forecast_horizon"),
  initialForecast: real("initial_forecast"),
  finalForecast: real("final_forecast"),
  confidenceLevel: text("confidence_level"),
  evidenceDiversityScore: real("evidence_diversity_score"),
  posteriorFragilityScore: real("posterior_fragility_score"),
  concentrationPenalty: real("concentration_penalty"),
  independentEvidenceFamilyCount: integer("independent_evidence_family_count"),
  keyDrivers: text("key_drivers"),
  keyConstraints: text("key_constraints"),
  majorLineageClusters: text("major_lineage_clusters"),
  outcome: text("outcome"),
  resolutionType: text("resolution_type"),
  brierScore: real("brier_score"),
  calibrationLesson: text("calibration_lesson"),
  biasPattern: text("bias_pattern"),
  structuralTags: text("structural_tags"),
  caseSummary: text("case_summary"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ReferenceCase = typeof referenceCasesTable.$inferSelect;
export type InsertReferenceCase = typeof referenceCasesTable.$inferInsert;
