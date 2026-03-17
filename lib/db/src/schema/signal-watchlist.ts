import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const signalWatchlistTable = pgTable("signal_watchlist", {
  id: text("id").primaryKey(),
  watchEventId: text("watch_event_id").notNull().unique(),
  caseId: text("case_id"),
  eventType: text("event_type").notNull(),
  eventName: text("event_name").notNull(),
  eventDescription: text("event_description"),
  targetAssetOrCompetitor: text("target_asset_or_competitor"),
  expectedDate: timestamp("expected_date"),
  status: text("status").notNull().default("Upcoming"),
  potentialSignalCategory: text("potential_signal_category"),
  expectedDirection: text("expected_direction"),
  sourceLink: text("source_link"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type SignalWatchlistEntry = typeof signalWatchlistTable.$inferSelect;
export type InsertSignalWatchlistEntry = typeof signalWatchlistTable.$inferInsert;
