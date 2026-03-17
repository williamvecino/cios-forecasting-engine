import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";

export const competitorBehaviorsTable = pgTable("competitor_behaviors", {
  id: text("id").primaryKey(),
  behaviorId: text("behavior_id").notNull().unique(),
  competitorName: text("competitor_name").notNull(),
  assetName: text("asset_name").notNull(),
  behaviorType: text("behavior_type").notNull(),
  behaviorDescription: text("behavior_description"),
  likelihoodEstimate: real("likelihood_estimate"),
  strategicImpact: text("strategic_impact"),
  expectedTiming: text("expected_timing"),
  relatedCaseId: text("related_case_id"),
  sourceBasis: text("source_basis"),
  status: text("status").notNull().default("Proposed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CompetitorBehavior = typeof competitorBehaviorsTable.$inferSelect;
export type InsertCompetitorBehavior = typeof competitorBehaviorsTable.$inferInsert;
