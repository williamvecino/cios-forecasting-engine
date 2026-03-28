import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const assumptionCategoryEnum = pgEnum("assumption_category", [
  "regulatory",
  "payer",
  "supply",
  "workflow",
  "clinical",
  "competitive",
  "operational",
  "timeline",
]);

export const assumptionStatusEnum = pgEnum("assumption_status", [
  "active",
  "validated",
  "invalidated",
  "unknown",
]);

export const assumptionConfidenceEnum = pgEnum("assumption_confidence", [
  "high",
  "moderate",
  "low",
]);

export const assumptionSourceTypeEnum = pgEnum("assumption_source_type", [
  "signal",
  "inference",
  "external_data",
  "user_input",
  "historical_pattern",
]);

export const assumptionImpactEnum = pgEnum("assumption_impact", [
  "high",
  "moderate",
  "low",
]);

export const assumptionRegistryTable = pgTable("assumption_registry", {
  assumptionId: text("assumption_id").primaryKey(),
  caseId: text("case_id").notNull(),
  assumptionStatement: text("assumption_statement").notNull(),
  assumptionCategory: assumptionCategoryEnum("assumption_category").notNull(),
  assumptionStatus: assumptionStatusEnum("assumption_status").notNull().default("active"),
  confidenceLevel: assumptionConfidenceEnum("confidence_level").notNull().default("moderate"),
  sourceType: assumptionSourceTypeEnum("source_type").notNull().default("inference"),
  impactLevel: assumptionImpactEnum("impact_level").notNull().default("moderate"),
  owner: text("owner").default("system"),
  linkedGates: text("linked_gates").default("[]"),
  invalidationReason: text("invalidation_reason"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAssumptionSchema = createInsertSchema(assumptionRegistryTable).omit({
  createdAt: true,
  lastUpdated: true,
});
export type InsertAssumption = z.infer<typeof insertAssumptionSchema>;
export type Assumption = typeof assumptionRegistryTable.$inferSelect;
