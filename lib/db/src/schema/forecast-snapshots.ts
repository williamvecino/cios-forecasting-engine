import { pgTable, text, real, integer, timestamp, jsonb } from "drizzle-orm/pg-core";

export const forecastSnapshotsTable = pgTable("forecast_snapshots", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  snapshotVersion: integer("snapshot_version").notNull().default(1),

  decisionPattern: text("decision_pattern"),
  primaryConstraint: text("primary_constraint"),
  topDrivers: jsonb("top_drivers").$type<string[]>(),
  baselinePrior: real("baseline_prior"),
  forecastProbability: real("forecast_probability").notNull(),
  forecastDirection: text("forecast_direction"),
  recommendedAction: text("recommended_action"),

  signalCount: integer("signal_count"),
  signalHash: text("signal_hash"),
  canonicalHash: text("canonical_hash"),
  canonicalSnapshot: jsonb("canonical_snapshot"),

  driftDetected: text("drift_detected").default("false"),
  driftFields: jsonb("drift_fields"),
  consistencyScore: text("consistency_score"),

  fullSnapshot: jsonb("full_snapshot"),

  createdAt: timestamp("created_at").defaultNow(),
});

export type ForecastSnapshotRow = typeof forecastSnapshotsTable.$inferSelect;
