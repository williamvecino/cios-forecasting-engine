import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const growthFeasibilityTable = pgTable("growth_feasibility", {
  id: text("id").primaryKey(),
  feasibilityId: text("feasibility_id").notNull(),
  caseId: text("case_id").notNull(),

  scope: text("scope").notNull(),
  segmentName: text("segment_name"),
  segmentType: text("segment_type"),

  feasibilityScore: real("feasibility_score").notNull(),
  feasibilityTier: text("feasibility_tier").notNull(),

  nearTermPotential: real("near_term_potential").notNull(),
  nearTermLabel: text("near_term_label").notNull(),
  mediumTermPotential: real("medium_term_potential").notNull(),
  mediumTermLabel: text("medium_term_label").notNull(),

  topUnlocks: text("top_unlocks"),
  topConstraints: text("top_constraints"),

  adoptionLikelihood: real("adoption_likelihood"),
  barrierLoad: real("barrier_load"),
  readinessScore: real("readiness_score"),
  competitiveRiskLoad: real("competitive_risk_load"),

  scalabilityRating: text("scalability_rating"),
  revenueTranslation: text("revenue_translation"),

  rationale: text("rationale"),
  confidenceLevel: text("confidence_level").notNull(),

  priorityRank: integer("priority_rank"),

  derivedFrom: text("derived_from"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type GrowthFeasibility = typeof growthFeasibilityTable.$inferSelect;
export type InsertGrowthFeasibility = typeof growthFeasibilityTable.$inferInsert;
