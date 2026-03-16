import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const lrCorrectionsTable = pgTable("lr_corrections", {
  id: text("id").primaryKey(),
  signalType: text("signal_type").notNull(),
  correctionFactor: real("correction_factor").notNull().default(1.0),
  sampleSize: integer("sample_size").notNull().default(0),
  meanForecastError: real("mean_forecast_error"),
  direction: text("direction"),
  appliedAt: timestamp("applied_at").defaultNow(),
  reason: text("reason"),
});

export type LrCorrection = typeof lrCorrectionsTable.$inferSelect;
