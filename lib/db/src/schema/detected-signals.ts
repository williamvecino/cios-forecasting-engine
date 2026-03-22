import { pgTable, serial, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const detectionRunsTable = pgTable("detection_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  sourceListJson: jsonb("source_list_json"),
  filtersJson: jsonb("filters_json"),
  totalSignalsDetected: serial("total_signals_detected"),
  totalCaseSuggestions: serial("total_case_suggestions"),
  runStatus: text("run_status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const DETECTION_SIGNAL_TYPES = [
  "Clinical", "Access", "Regulatory", "KOL", "Operational",
  "Competitor", "Safety", "InstitutionalReadiness", "ReferralBehavior",
] as const;
export type DetectionSignalType = (typeof DETECTION_SIGNAL_TYPES)[number];

export const detectedSignalsTable = pgTable("detected_signals", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url"),
  detectedDate: text("detected_date"),
  signalType: text("signal_type").notNull(),
  suggestedDirection: text("suggested_direction").notNull().default("neutral"),
  suggestedStrength: text("suggested_strength").notNull().default("medium"),
  suggestedScope: text("suggested_scope").notNull().default("market"),
  possibleEventFamily: text("possible_event_family"),
  extractionConfidence: text("extraction_confidence").notNull().default("medium"),
  evidenceSnippet: text("evidence_snippet").notNull(),
  therapyArea: text("therapy_area"),
  geography: text("geography"),
  specialty: text("specialty"),
  subspecialty: text("subspecialty"),
  institutionName: text("institution_name"),
  physicianName: text("physician_name"),
  status: text("status").notNull().default("candidate"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at"),
});

export const signalCaseSuggestionsTable = pgTable("signal_case_suggestions", {
  id: text("id").primaryKey(),
  detectedSignalId: text("detected_signal_id").notNull(),
  caseId: text("case_id").notNull(),
  matchConfidence: text("match_confidence").notNull().default("medium"),
  matchReason: text("match_reason"),
  createdAt: timestamp("created_at").defaultNow(),
});
