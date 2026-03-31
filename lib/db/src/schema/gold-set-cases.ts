import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const goldSetCasesTable = pgTable("gold_set_cases", {
  id: text("id").primaryKey(),
  caseName: text("case_name").notNull(),
  sourceType: text("source_type").notNull(),
  sourceReference: text("source_reference"),
  sourceText: text("source_text"),
  expectedDecisionClassification: text("expected_decision_classification"),
  expectedPrimaryQuestion: text("expected_primary_question"),
  expectedTopSignalFamilies: jsonb("expected_top_signal_families").$type<string[]>(),
  expectedStrongSignals: jsonb("expected_strong_signals").$type<string[]>(),
  expectedDuplicateTraps: jsonb("expected_duplicate_traps").$type<string[]>(),
  expectedNoiseSignals: jsonb("expected_noise_signals").$type<string[]>(),
  expectedNotes: text("expected_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertGoldSetCaseSchema = createInsertSchema(goldSetCasesTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertGoldSetCase = z.infer<typeof insertGoldSetCaseSchema>;
export type GoldSetCase = typeof goldSetCasesTable.$inferSelect;
