import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const bucketCorrectionsTable = pgTable("bucket_corrections", {
  id: text("id").primaryKey(),
  bucket: text("bucket").notNull(),
  correctionPp: real("correction_pp").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  meanForecastError: real("mean_forecast_error"),
  direction: text("direction"),
  appliedAt: timestamp("applied_at").defaultNow(),
  reason: text("reason"),
});

export type BucketCorrection = typeof bucketCorrectionsTable.$inferSelect;
