import { pgTable, serial, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const discoveryRunsTable = pgTable("discovery_runs", {
  id: serial("id").primaryKey(),
  runId: text("run_id").notNull().unique(),
  questionText: text("question_text").notNull(),
  parsedQuestionJson: jsonb("parsed_question_json"),
  geography: text("geography").notNull().default("USA"),
  therapyArea: text("therapy_area"),
  targetType: text("target_type").notNull().default("both"),
  specialty: text("specialty"),
  subspecialty: text("subspecialty"),
  timeHorizon: text("time_horizon"),
  runStatus: text("run_status").notNull().default("completed"),
  totalCandidatesFound: integer("total_candidates_found").notNull().default(0),
  totalSignalsFound: integer("total_signals_found").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
});
