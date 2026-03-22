import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const discoveryCandidateSignalsTable = pgTable("discovery_candidate_signals", {
  id: serial("id").primaryKey(),
  signalId: text("signal_id").notNull().unique(),
  candidateId: text("candidate_id").notNull(),
  discoveryRunId: text("discovery_run_id").notNull(),
  signalType: text("signal_type").notNull(),
  direction: text("direction").notNull().default("positive"),
  strength: text("strength").notNull().default("medium"),
  reliability: text("reliability").notNull().default("medium"),
  signalScope: text("signal_scope").notNull().default("market"),
  sourceLabel: text("source_label"),
  sourceUrl: text("source_url"),
  evidenceSnippet: text("evidence_snippet"),
  observedAt: text("observed_at"),
  eventFamilyId: text("event_family_id"),
  status: text("status").notNull().default("candidate"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
