import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const casesTable = pgTable("cases", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull().unique(),
  strategicQuestion: text("strategic_question").notNull(),
  outcomeDefinition: text("outcome_definition"),
  timeHorizon: text("time_horizon"),
  priorProbability: real("prior_probability").notNull().default(0.45),
  currentProbability: real("current_probability"),
  confidenceLevel: text("confidence_level"),
  primaryBrand: text("primary_brand"),
  primarySpecialtyProfile: text("primary_specialty_profile").default("General"),
  payerEnvironment: text("payer_environment").default("Balanced"),
  guidelineLeverage: text("guideline_leverage").default("Medium"),
  competitorProfile: text("competitor_profile").default("Entrenched standard of care"),
  topSupportiveActor: text("top_supportive_actor"),
  topConstrainingActor: text("top_constraining_actor"),
  miosRoutingCheck: text("mios_routing_check"),
  ohosRoutingCheck: text("ohos_routing_check"),
  lastUpdate: timestamp("last_update").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCaseSchema = createInsertSchema(casesTable).omit({
  id: true,
  createdAt: true,
  lastUpdate: true,
});
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof casesTable.$inferSelect;
