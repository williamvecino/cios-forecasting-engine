import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const caseSignalStateTable = pgTable("case_signal_state", {
  caseId: text("case_id").primaryKey(),
  signalData: jsonb("signal_data").notNull(),
  contextKey: text("context_key"),
  updatedAt: timestamp("updated_at").defaultNow(),
});
