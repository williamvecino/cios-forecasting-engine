import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const watchlistTable = pgTable("watchlist", {
  id: text("id").primaryKey(),
  signalId: text("signal_id").notNull().unique(),
  signalName: text("signal_name").notNull(),
  signalType: text("signal_type").notNull(),
  expectedWindow: text("expected_window"),
  owner: text("owner"),
  expectedDirection: text("expected_direction"),
  estimatedImpact: text("estimated_impact"),
  evidenceSource: text("evidence_source"),
  status: text("status").default("Pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;
