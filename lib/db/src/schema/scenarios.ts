import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scenariosTable = pgTable("scenarios", {
  id: text("id").primaryKey(),
  scenarioId: text("scenario_id").notNull(),
  caseId: text("case_id").notNull(),
  hypotheticalSignal: text("hypothetical_signal").notNull(),
  direction: text("direction").notNull(),
  estimatedImpact: real("estimated_impact").notNull(),
  newProbability: real("new_probability"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertScenarioSchema = createInsertSchema(scenariosTable).omit({
  id: true,
  createdAt: true,
});
export type InsertScenario = z.infer<typeof insertScenarioSchema>;
export type Scenario = typeof scenariosTable.$inferSelect;
