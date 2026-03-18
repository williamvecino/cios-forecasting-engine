import { pgTable, pgEnum, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scopeEnum = pgEnum("signal_scope", ["local", "regional", "national", "global"]);
export const timingEnum = pgEnum("signal_timing", ["early", "current", "late"]);

export const signalsTable = pgTable("signals", {
  id: text("id").primaryKey(),
  signalId: text("signal_id").notNull(),
  caseId: text("case_id").notNull(),
  candidateId: text("candidate_id"),
  brand: text("brand"),
  signalDescription: text("signal_description").notNull(),
  signalType: text("signal_type").notNull(),
  direction: text("direction").notNull(),
  strengthScore: real("strength_score").notNull(),
  reliabilityScore: real("reliability_score").notNull(),
  likelihoodRatio: real("likelihood_ratio").notNull(),
  scope: scopeEnum("scope").default("national"),
  timing: timingEnum("timing").default("current"),
  route: text("route"),
  targetPopulation: text("target_population"),
  miosFlag: text("mios_flag").default("No"),
  ohosFlag: text("ohos_flag").default("No"),
  weightedSignalScore: real("weighted_signal_score"),
  actorAdjustedImpact: real("actor_adjusted_impact"),
  activeLikelihoodRatio: real("active_likelihood_ratio"),
  absoluteImpact: real("absolute_impact"),
  correlationGroup: text("correlation_group"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
