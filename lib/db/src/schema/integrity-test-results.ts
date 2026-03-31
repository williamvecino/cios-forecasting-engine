import { pgTable, text, real, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";

export const integrityTestResultsTable = pgTable("integrity_test_results", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  runId: text("run_id").notNull(),
  invariantName: text("invariant_name").notNull(),
  passed: boolean("passed").notNull(),
  expectedBehavior: text("expected_behavior").notNull(),
  actualBehavior: text("actual_behavior").notNull(),
  details: jsonb("details"),
  forecastProbability: real("forecast_probability"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
