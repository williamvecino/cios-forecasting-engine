import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const casesTable = pgTable("cases", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().unique(),

  // Structured asset metadata — disease-agnostic inputs
  assetName: text("asset_name"),
  assetType: text("asset_type").default("Medication"),
  therapeuticArea: text("therapeutic_area"),
  diseaseState: text("disease_state"),
  specialty: text("specialty"),
  geography: text("geography").default("US"),

  // Target resolution hierarchy
  targetType: text("target_type").default("market"),
  targetId: text("target_id"),
  subspecialty: text("subspecialty"),
  institutionName: text("institution_name"),

  // Strategic question framing
  strategicQuestion: text("strategic_question").notNull(),
  outcomeDefinition: text("outcome_definition"),
  timeHorizon: text("time_horizon").default("12 months"),

  // Bayesian engine inputs
  priorProbability: real("prior_probability").notNull().default(0.45),

  // Actor environment context
  primarySpecialtyProfile: text("primary_specialty_profile").default("General"),
  payerEnvironment: text("payer_environment").default("Balanced"),
  guidelineLeverage: text("guideline_leverage").default("Medium"),
  competitorProfile: text("competitor_profile").default("Entrenched standard of care"),

  // Environment adjustment fields
  accessFrictionIndex: real("access_friction_index").default(0.5),
  adoptionPhase: text("adoption_phase").default("early_adoption"),
  forecastHorizonMonths: integer("forecast_horizon_months").default(12),

  // Computed engine outputs (written back after forecast run)
  currentProbability: real("current_probability"),
  confidenceLevel: text("confidence_level"),
  topSupportiveActor: text("top_supportive_actor"),
  topConstrainingActor: text("top_constraining_actor"),
  miosRoutingCheck: text("mios_routing_check"),
  ohosRoutingCheck: text("ohos_routing_check"),

  // Backward-compat alias kept for codegen consumers
  primaryBrand: text("primary_brand"),

  lastUpdate: timestamp("last_update").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  isDemo: text("is_demo").default("false"),

  // Outcome recording (filled in after the fact)
  actualAdoptionRate: real("actual_adoption_rate"),
  actualOutcomeNotes: text("actual_outcome_notes"),
  outcomeRecordedAt: timestamp("outcome_recorded_at"),
  outcomePublishedToLibrary: text("outcome_published_to_library").default("false"),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({
  id: true,
  createdAt: true,
  lastUpdate: true,
});
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
