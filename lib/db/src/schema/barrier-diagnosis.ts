import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const barrierDiagnosisTable = pgTable("barrier_diagnosis", {
  id: text("id").primaryKey(),
  barrierId: text("barrier_id").notNull(),
  caseId: text("case_id").notNull(),
  segmentId: text("segment_id"),
  segmentName: text("segment_name"),

  barrierName: text("barrier_name").notNull(),
  barrierCategory: text("barrier_category").notNull(),

  barrierStrength: real("barrier_strength").notNull(),
  barrierConfidence: text("barrier_confidence").notNull(),
  barrierScope: text("barrier_scope"),

  primarySignals: text("primary_signals"),
  counterSignals: text("counter_signals"),

  whyItMatters: text("why_it_matters"),
  removalDifficulty: text("removal_difficulty"),
  isStructural: text("is_structural"),
  estimatedImpactIfResolved: real("estimated_impact_if_resolved"),

  priorityRank: integer("priority_rank"),
  priorityClass: text("priority_class"),
  rationaleSummary: text("rationale_summary"),

  signalCount: integer("signal_count"),
  counterSignalCount: integer("counter_signal_count"),

  derivedFrom: text("derived_from"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type BarrierDiagnosis = typeof barrierDiagnosisTable.$inferSelect;
export type InsertBarrierDiagnosis = typeof barrierDiagnosisTable.$inferInsert;
