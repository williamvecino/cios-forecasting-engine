import { pgTable, text, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const calibrationLogTable = pgTable("calibration_log", {
  id: text("id").primaryKey(),
  forecastId: text("forecast_id").notNull().unique(),
  caseId: text("case_id").notNull(),
  predictionDate: timestamp("prediction_date").defaultNow(),
  predictedProbability: real("predicted_probability").notNull(),
  observedOutcome: real("observed_outcome"),
  brierComponent: real("brier_component"),
  forecastError: real("forecast_error"),
  notes: text("notes"),
  userFeedback: text("user_feedback"),
  reviewerComments: text("reviewer_comments"),
  snapshotJson: text("snapshot_json"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertCalibrationSchema = createInsertSchema(calibrationLogTable).omit({
  id: true,
  createdAt: true,
  predictionDate: true,
});
export type InsertCalibration = z.infer<typeof insertCalibrationSchema>;
export type CalibrationLog = typeof calibrationLogTable.$inferSelect;
