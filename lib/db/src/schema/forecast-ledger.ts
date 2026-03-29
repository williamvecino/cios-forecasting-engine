import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";

export const forecastLedgerTable = pgTable("forecast_ledger", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull().unique(),
  caseId: text("case_id").notNull(),
  strategicQuestion: text("strategic_question").notNull(),
  decisionDomain: text("decision_domain"),
  forecastProbability: real("forecast_probability").notNull(),
  forecastDate: timestamp("forecast_date").notNull().defaultNow(),
  timeHorizon: text("time_horizon").notNull(),
  forecastHorizonMonths: integer("forecast_horizon_months"),
  expectedResolutionDate: timestamp("expected_resolution_date"),

  priorProbability: real("prior_probability"),
  confidenceLevel: text("confidence_level"),
  confidenceCeilingApplied: real("confidence_ceiling_applied"),
  confidenceCeilingReason: text("confidence_ceiling_reason"),
  evidenceDiversityScore: real("evidence_diversity_score"),
  posteriorFragilityScore: real("posterior_fragility_score"),
  concentrationPenalty: real("concentration_penalty"),
  independentEvidenceFamilyCount: integer("independent_evidence_family_count"),
  rawSignalCount: integer("raw_signal_count"),
  compressedSignalCount: integer("compressed_signal_count"),

  keyDriversSummary: text("key_drivers_summary"),
  topLineageClusters: text("top_lineage_clusters"),
  counterSignalsSummary: text("counter_signals_summary"),
  environmentAdjustments: text("environment_adjustments"),

  updateVersion: integer("update_version").notNull().default(1),
  updateRationale: text("update_rationale"),
  previousPredictionId: text("previous_prediction_id"),

  resolutionStatus: text("resolution_status").default("open"),
  resolutionDate: timestamp("resolution_date"),
  resolvedOutcome: real("resolved_outcome"),
  actualOutcome: real("actual_outcome"),

  brierScore: real("brier_score"),
  calibrationBucket: text("calibration_bucket"),
  predictionError: real("prediction_error"),

  snapshotJson: text("snapshot_json"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ForecastLedgerEntry = typeof forecastLedgerTable.$inferSelect;
export type InsertForecastLedgerEntry = typeof forecastLedgerTable.$inferInsert;
