import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const caseFeedbackTable = pgTable("case_feedback", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  step: text("step").notNull(),
  observedBehavior: text("observed_behavior").notNull(),
  expectedBehavior: text("expected_behavior").notNull(),
  impact: text("impact").notNull(),
  category: text("category").notNull(),
  reproducible: text("reproducible").default("Unknown"),
  status: text("status").default("Open"),
  screenshotRef: text("screenshot_ref"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type CaseFeedback = typeof caseFeedbackTable.$inferSelect;
export type InsertCaseFeedback = typeof caseFeedbackTable.$inferInsert;
