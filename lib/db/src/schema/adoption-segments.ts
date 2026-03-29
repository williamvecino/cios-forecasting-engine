import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const adoptionSegmentsTable = pgTable("adoption_segments", {
  id: text("id").primaryKey(),
  segmentId: text("segment_id").notNull(),
  caseId: text("case_id").notNull(),
  segmentName: text("segment_name").notNull(),
  segmentType: text("segment_type").notNull(),

  adoptionLikelihood: real("adoption_likelihood").notNull(),
  confidenceLevel: text("confidence_level"),
  evidenceDiversityScore: real("evidence_diversity_score"),
  posteriorFragilityScore: real("posterior_fragility_score"),

  primaryDrivers: text("primary_drivers"),
  primaryBarriers: text("primary_barriers"),
  operationalConstraints: text("operational_constraints"),
  accessConstraints: text("access_constraints"),
  behavioralSignals: text("behavioral_signals"),

  forecastHorizon: text("forecast_horizon"),
  priorityRank: integer("priority_rank"),
  priorityTier: text("priority_tier"),
  rationaleSummary: text("rationale_summary"),

  upwardLevers: text("upward_levers"),
  movementBlockers: text("movement_blockers"),

  signalCount: integer("signal_count"),
  positiveSignalCount: integer("positive_signal_count"),
  negativeSignalCount: integer("negative_signal_count"),

  derivedFrom: text("derived_from"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type AdoptionSegment = typeof adoptionSegmentsTable.$inferSelect;
export type InsertAdoptionSegment = typeof adoptionSegmentsTable.$inferInsert;
