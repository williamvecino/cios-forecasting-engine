import { pgTable, text, real, integer, boolean, timestamp } from "drizzle-orm/pg-core";

export const bucketCorrectionsTable = pgTable("bucket_corrections", {
  id: text("id").primaryKey(),
  bucket: text("bucket").notNull(),
  correctionPp: real("correction_pp").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0),
  meanForecastError: real("mean_forecast_error"),
  meanAbsoluteError: real("mean_absolute_error"),
  direction: text("direction"),
  previousDirection: text("previous_direction"),
  flipCount: integer("flip_count").notNull().default(0),
  lowSampleWarning: boolean("low_sample_warning").notNull().default(false),
  directionFlipWarning: boolean("direction_flip_warning").notNull().default(false),
  recencyWeighted: boolean("recency_weighted").notNull().default(false),
  appliedAt: timestamp("applied_at").defaultNow(),
  reason: text("reason"),
});

export type BucketCorrection = typeof bucketCorrectionsTable.$inferSelect;
