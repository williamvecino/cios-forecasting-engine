import { pgTable, text, timestamp, boolean, integer, real } from "drizzle-orm/pg-core";

export const signalInterpretationsTable = pgTable("signal_interpretations", {
  interpretationId: text("interpretation_id").primaryKey(),
  caseId: text("case_id").notNull(),
  classificationId: text("classification_id"),
  sourceDocumentId: text("source_document_id"),
  sourceSpan: text("source_span"),
  sourceType: text("source_type"),
  factIndex: integer("fact_index").notNull(),
  factText: text("fact_text").notNull(),
  factSource: text("fact_source"),
  factCategory: text("fact_category"),

  decisionRelevance: text("decision_relevance").notNull(),
  causalPathway: text("causal_pathway"),
  direction: text("direction").notNull(),
  impactEstimate: text("impact_estimate").notNull(),
  independenceClassification: text("independence_classification").notNull(),
  dependsOnFactIndex: integer("depends_on_fact_index"),
  rootEvidenceId: text("root_evidence_id"),
  confidence: text("confidence").notNull(),

  recommendedSignal: boolean("recommended_signal").notNull().default(false),
  recommendationReason: text("recommendation_reason"),
  rejectionReason: text("rejection_reason"),

  suggestedSignalType: text("suggested_signal_type"),
  suggestedStrength: real("suggested_strength"),
  suggestedReliability: real("suggested_reliability"),

  reviewerStatus: text("reviewer_status").notNull().default("Pending"),
  userOverride: boolean("user_override").default(false),
  linkedSignalId: text("linked_signal_id"),

  decisionContextQuestion: text("decision_context_question"),
  decisionContextDomain: text("decision_context_domain"),
  decisionContextArchetype: text("decision_context_archetype"),
  decisionContextPrimaryDecision: text("decision_context_primary_decision"),

  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SignalInterpretation = typeof signalInterpretationsTable.$inferSelect;
