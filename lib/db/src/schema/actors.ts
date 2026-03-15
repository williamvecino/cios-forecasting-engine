import { pgTable, text, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const actorsTable = pgTable("actors", {
  id: text("id").primaryKey(),
  actorName: text("actor_name").notNull(),
  influenceWeight: real("influence_weight").notNull(),
  positiveResponseFactor: real("positive_response_factor").notNull(),
  negativeResponseFactor: real("negative_response_factor").notNull(),
  outcomeOrientation: integer("outcome_orientation").notNull().default(1),
  roleInSystem: text("role_in_system"),
  baseInfluenceWeight: real("base_influence_weight").notNull(),
  specialtyModifier: real("specialty_modifier").default(1),
  payerModifier: real("payer_modifier").default(1),
  guidelineModifier: real("guideline_modifier").default(1),
  competitorModifier: real("competitor_modifier").default(1),
  rawWeight: real("raw_weight"),
  basePositiveResponseFactor: real("base_positive_response_factor"),
  baseNegativeResponseFactor: real("base_negative_response_factor"),
  canonicalActor: text("canonical_actor"),
  specialtyProfile: text("specialty_profile").default("General"),
  slotIndex: integer("slot_index").notNull().default(0),
});

export const insertActorSchema = createInsertSchema(actorsTable).omit({
  id: true,
});
export type InsertActor = z.infer<typeof insertActorSchema>;
export type Actor = typeof actorsTable.$inferSelect;

export const specialtyActorSetsTable = pgTable("specialty_actor_sets", {
  id: text("id").primaryKey(),
  primarySpecialtyProfile: text("primary_specialty_profile").notNull(),
  actorSlot: integer("actor_slot").notNull(),
  displayActor: text("display_actor").notNull(),
  canonicalActor: text("canonical_actor").notNull(),
  roleInSystem: text("role_in_system"),
  baseInfluenceWeight: real("base_influence_weight").notNull(),
  basePositiveResponseFactor: real("base_positive_response_factor").notNull(),
  baseNegativeResponseFactor: real("base_negative_response_factor").notNull(),
  outcomeOrientation: integer("outcome_orientation").notNull().default(1),
});
export type SpecialtyActorSet = typeof specialtyActorSetsTable.$inferSelect;
