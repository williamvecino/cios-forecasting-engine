import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const competitiveRiskTable = pgTable("competitive_risk", {
  id: text("id").primaryKey(),
  competitiveRiskId: text("competitive_risk_id").notNull(),
  caseId: text("case_id").notNull(),
  segmentId: text("segment_id"),
  segmentName: text("segment_name"),

  riskName: text("risk_name").notNull(),
  riskCategory: text("risk_category").notNull(),

  riskStrength: real("risk_strength").notNull(),
  riskConfidence: text("risk_confidence").notNull(),
  riskScope: text("risk_scope"),

  primarySignals: text("primary_signals"),
  counterSignals: text("counter_signals"),

  threatMechanism: text("threat_mechanism"),
  whyItMatters: text("why_it_matters"),

  structuralVsEmerging: text("structural_vs_emerging").notNull(),
  estimatedForecastImpact: real("estimated_forecast_impact"),

  priorityRank: integer("priority_rank"),
  priorityClass: text("priority_class"),
  rationaleSummary: text("rationale_summary"),

  signalCount: integer("signal_count"),
  counterSignalCount: integer("counter_signal_count"),

  derivedFrom: text("derived_from"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CompetitiveRisk = typeof competitiveRiskTable.$inferSelect;
export type InsertCompetitiveRisk = typeof competitiveRiskTable.$inferInsert;
