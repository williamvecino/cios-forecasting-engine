import { pgTable, text, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const decisionArchetypeEnum = pgEnum("decision_archetype", [
  "launch_strategy",
  "adoption_risk",
  "market_access",
  "competitive_positioning",
  "operational_readiness",
  "resource_allocation",
  "stakeholder_behavior",
  "capability_gap",
  "vendor_selection",
  "portfolio_strategy",
  "evidence_positioning",
]);

export const classificationConfidenceEnum = pgEnum("classification_confidence", [
  "high",
  "moderate",
  "low",
]);

export const decisionClassificationsTable = pgTable("decision_classifications", {
  classificationId: text("classification_id").primaryKey(),
  caseId: text("case_id"),
  documentType: text("document_type").notNull(),
  domain: text("domain").notNull(),
  primaryArchetype: decisionArchetypeEnum("primary_archetype").notNull(),
  alternativeArchetype: text("alternative_archetype"),
  secondaryArchetypes: text("secondary_archetypes").default("[]"),
  primaryDecision: text("primary_decision").notNull(),
  secondaryDecisions: text("secondary_decisions").default("[]"),
  evidenceSpans: text("evidence_spans").default("[]"),
  confidence: classificationConfidenceEnum("confidence").notNull().default("moderate"),
  confidenceRationale: text("confidence_rationale"),
  guardrailApplied: text("guardrail_applied").default("false"),
  guardrailReason: text("guardrail_reason"),
  userConfirmedArchetype: text("user_confirmed_archetype"),
  sourceFileName: text("source_file_name"),
  ingestionPath: text("ingestion_path"),
  createdAt: timestamp("created_at").defaultNow(),
});

export type DecisionClassification = typeof decisionClassificationsTable.$inferSelect;
