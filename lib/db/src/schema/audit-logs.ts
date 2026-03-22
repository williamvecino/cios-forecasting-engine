import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";

export const auditLogsTable = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  objectType: text("object_type").notNull(),
  objectId: text("object_id").notNull(),
  action: text("action").notNull(),
  performedByType: text("performed_by_type").default("human"),
  performedById: text("performed_by_id"),
  beforeStateJson: jsonb("before_state_json"),
  afterStateJson: jsonb("after_state_json"),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogsTable.$inferSelect;
