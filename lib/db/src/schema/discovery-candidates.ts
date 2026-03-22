import { pgTable, serial, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const discoveryCandidatesTable = pgTable("discovery_candidates", {
  id: serial("id").primaryKey(),
  candidateId: text("candidate_id").notNull().unique(),
  discoveryRunId: text("discovery_run_id").notNull(),
  candidateType: text("candidate_type").notNull(),
  candidateName: text("candidate_name").notNull(),
  specialty: text("specialty"),
  subspecialty: text("subspecialty"),
  institutionName: text("institution_name"),
  geography: text("geography"),
  sourceConfidence: text("source_confidence").notNull().default("medium"),
  evidenceCompleteness: real("evidence_completeness").notNull().default(0),
  prepScore: real("prep_score").notNull().default(0),
  suggestedAction: text("suggested_action").notNull().default("needs review"),
  positiveSignals: integer("positive_signals").notNull().default(0),
  negativeSignals: integer("negative_signals").notNull().default(0),
  neutralSignals: integer("neutral_signals").notNull().default(0),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
