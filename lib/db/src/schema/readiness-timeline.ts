import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const readinessTimelineTable = pgTable("readiness_timeline", {
  id: text("id").primaryKey(),
  readinessId: text("readiness_id").notNull(),
  caseId: text("case_id").notNull(),
  segmentId: text("segment_id"),
  segmentName: text("segment_name"),

  milestoneName: text("milestone_name").notNull(),
  milestoneCategory: text("milestone_category").notNull(),

  expectedTimeWindow: text("expected_time_window").notNull(),
  currentStatus: text("current_status").notNull(),
  readinessScore: real("readiness_score").notNull(),

  gatingBarriers: text("gating_barriers"),
  requiredSignals: text("required_signals"),
  supportingSignals: text("supporting_signals"),
  counterSignals: text("counter_signals"),

  accelerators: text("accelerators"),
  delayRisks: text("delay_risks"),

  estimatedImpactOnAdoption: real("estimated_impact_on_adoption"),
  confidenceLevel: text("confidence_level").notNull(),
  priorityRank: integer("priority_rank"),

  dependsOnMilestones: text("depends_on_milestones"),

  rationaleSummary: text("rationale_summary"),
  derivedFrom: text("derived_from"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ReadinessTimeline = typeof readinessTimelineTable.$inferSelect;
export type InsertReadinessTimeline = typeof readinessTimelineTable.$inferInsert;
