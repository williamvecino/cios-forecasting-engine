import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const guidanceTable = pgTable("guidance", {
  id: text("id").primaryKey(),
  guidanceId: text("guidance_id").notNull(),
  caseId: text("case_id").notNull(),
  keyRiskDriver: text("key_risk_driver").notNull(),
  recommendedAction: text("recommended_action").notNull(),
  targetAudience: text("target_audience"),
  priorityLevel: text("priority_level").notNull().default("Medium"),
  linkedSignalId: text("linked_signal_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGuidanceSchema = createInsertSchema(guidanceTable).omit({
  id: true,
  createdAt: true,
});
export type InsertGuidance = z.infer<typeof insertGuidanceSchema>;
export type Guidance = typeof guidanceTable.$inferSelect;
