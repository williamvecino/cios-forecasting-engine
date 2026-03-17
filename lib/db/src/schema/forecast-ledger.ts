import { pgTable, text, real, timestamp, integer } from "drizzle-orm/pg-core";

export const forecastLedgerTable = pgTable("forecast_ledger", {
  id: text("id").primaryKey(),
  predictionId: text("prediction_id").notNull().unique(),
  caseId: text("case_id").notNull(),
  strategicQuestion: text("strategic_question").notNull(),
  forecastProbability: real("forecast_probability").notNull(),
  forecastDate: timestamp("forecast_date").notNull().defaultNow(),
  timeHorizon: text("time_horizon").notNull(),
  expectedResolutionDate: timestamp("expected_resolution_date"),
  actualOutcome: integer("actual_outcome"),
  resolutionDate: timestamp("resolution_date"),
  predictionError: real("prediction_error"),
  calibrationBucket: text("calibration_bucket"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ForecastLedgerEntry = typeof forecastLedgerTable.$inferSelect;
export type InsertForecastLedgerEntry = typeof forecastLedgerTable.$inferInsert;
