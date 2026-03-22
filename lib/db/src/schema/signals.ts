import { pgTable, pgEnum, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const scopeEnum = pgEnum("signal_scope", ["local", "regional", "national", "global"]);
export const timingEnum = pgEnum("signal_timing", ["early", "current", "late"]);

export const SIGNAL_STATUSES = ["candidate", "reviewed", "validated", "active", "archived", "rejected"] as const;
export type SignalStatus = typeof SIGNAL_STATUSES[number];

export const CREATED_BY_TYPES = ["human", "agent", "system"] as const;
export type CreatedByType = typeof CREATED_BY_TYPES[number];

export const VALID_TRANSITIONS: Record<string, string[]> = {
  candidate: ["reviewed", "rejected"],
  reviewed: ["validated", "rejected", "candidate"],
  validated: ["active", "rejected", "candidate"],
  active: ["archived", "rejected"],
  archived: ["candidate"],
  rejected: ["candidate"],
};

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

  // Target resolution scope
  signalScope: text("signal_scope").default("market"),
  appliesToTargetId: text("applies_to_target_id"),
  appliesToSpecialty: text("applies_to_specialty"),
  appliesToSubspecialty: text("applies_to_subspecialty"),
  appliesToInstitutionId: text("applies_to_institution_id"),
  appliesToGeography: text("applies_to_geography"),
  eventFamilyId: text("event_family_id"),

  // Signal lifecycle
  status: text("status").default("active").notNull(),
  createdByType: text("created_by_type").default("human"),
  createdById: text("created_by_id"),

  // Structured evidence fields
  strength: text("strength"),
  reliability: text("reliability"),
  sourceLabel: text("source_label"),
  sourceUrl: text("source_url"),
  evidenceSnippet: text("evidence_snippet"),
  observedAt: timestamp("observed_at"),
  notes: text("notes"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSignalSchema = createInsertSchema(signalsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSignal = z.infer<typeof insertSignalSchema>;
export type Signal = typeof signalsTable.$inferSelect;
