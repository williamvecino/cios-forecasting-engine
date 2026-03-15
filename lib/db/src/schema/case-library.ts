import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const caseLibraryTable = pgTable("case_library", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  therapyArea: text("therapy_area").notNull(),
  productType: text("product_type").notNull(),
  specialty: text("specialty").notNull(),
  evidenceType: text("evidence_type"),
  lifecycleStage: text("lifecycle_stage"),
  actorMix: text("actor_mix"),
  marketAccessConditions: text("market_access_conditions"),
  outcomePattern: text("outcome_pattern"),
  adoptionTrajectory: text("adoption_trajectory"),
  keyInflectionSignals: text("key_inflection_signals"),
  finalObservedOutcome: text("final_observed_outcome"),
  finalProbability: real("final_probability"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCaseLibrarySchema = createInsertSchema(caseLibraryTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCaseLibrary = z.infer<typeof insertCaseLibrarySchema>;
export type CaseLibrary = typeof caseLibraryTable.$inferSelect;
