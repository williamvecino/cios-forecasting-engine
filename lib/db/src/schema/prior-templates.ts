import { pgTable, text, real, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const priorTemplatesTable = pgTable("prior_templates", {
  id: text("id").primaryKey(),
  archetypeName: text("archetype_name").notNull().unique(),
  defaultPriorProbability: real("default_prior_probability").notNull(),
  priorRationale: text("prior_rationale").notNull(),
  typicalPositiveFamilies: jsonb("typical_positive_families").$type<string[]>().notNull(),
  typicalNegativeFamilies: jsonb("typical_negative_families").$type<string[]>().notNull(),
  commonTraps: text("common_traps"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertPriorTemplateSchema = createInsertSchema(priorTemplatesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertPriorTemplate = z.infer<typeof insertPriorTemplateSchema>;
export type PriorTemplate = typeof priorTemplatesTable.$inferSelect;
