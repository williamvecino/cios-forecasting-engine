import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const fieldIntelligenceTable = pgTable("field_intelligence", {
  id: text("id").primaryKey(),
  feedbackId: text("feedback_id").notNull().unique(),
  date: timestamp("date").defaultNow(),
  brand: text("brand"),
  audienceType: text("audience_type"),
  specialty: text("specialty"),
  subspecialty: text("subspecialty"),
  region: text("region"),
  sourceRole: text("source_role"),
  sourceName: text("source_name"),
  signalCategory: text("signal_category"),
  observedBarrier: text("observed_barrier"),
  rawFieldFeedback: text("raw_field_feedback").notNull(),
  beliefShiftRisk: integer("belief_shift_risk"),
  messageMismatchRisk: integer("message_mismatch_risk"),
  accessRisk: integer("access_risk"),
  competitiveRisk: integer("competitive_risk"),
  urgencyScore: integer("urgency_score"),
  credibilityScore: integer("credibility_score"),
  frequencyScore: integer("frequency_score"),
  potentialImpact: integer("potential_impact"),
  totalSignalScore: integer("total_signal_score"),
  ciosSignalDirection: text("cios_signal_direction"),
  suggestedRoute: text("suggested_route"),
  primaryTargetPopulation: text("primary_target_population"),
  miosMessagePriority: text("mios_message_priority"),
  ohosObjectionPriority: text("ohos_objection_priority"),
  fieldActionNeeded: text("field_action_needed"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertFieldIntelligenceSchema = createInsertSchema(fieldIntelligenceTable).omit({
  id: true,
  createdAt: true,
  date: true,
});
export type InsertFieldIntelligence = z.infer<typeof insertFieldIntelligenceSchema>;
export type FieldIntelligence = typeof fieldIntelligenceTable.$inferSelect;
