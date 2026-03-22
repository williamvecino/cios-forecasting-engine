import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const targetEntitiesTable = pgTable("target_entities", {
  id: text("id").primaryKey(),
  targetType: text("target_type").notNull(),
  targetName: text("target_name").notNull(),
  specialty: text("specialty"),
  subspecialty: text("subspecialty"),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  physicianName: text("physician_name"),
  physicianNpi: text("physician_npi"),
  geography: text("geography"),
  segmentTags: jsonb("segment_tags").default([]),
  isActive: text("is_active").default("true"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTargetEntitySchema = createInsertSchema(targetEntitiesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertTargetEntity = z.infer<typeof insertTargetEntitySchema>;
export type TargetEntity = typeof targetEntitiesTable.$inferSelect;
