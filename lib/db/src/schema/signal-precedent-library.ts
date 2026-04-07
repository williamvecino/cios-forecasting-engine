import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const signalPrecedentLibraryTable = pgTable("signal_precedent_library", {
  id: text("id").primaryKey(),
  signalType: text("signal_type").notNull().unique(),
  context: text("context"),
  historicalImpact: text("historical_impact"),
  reliabilityTier: text("reliability_tier").notNull(),
  baseLr: real("base_lr").notNull(),
  tierMultiplier: real("tier_multiplier").notNull(),
  assignedLr: real("assigned_lr").notNull(),
  sourceCount: integer("source_count"),
  lastUpdated: timestamp("last_updated").defaultNow(),
  governanceNote: text("governance_note"),
  libraryVersion: text("library_version").notNull().default("PREC_v1"),
});

export type SignalPrecedent = typeof signalPrecedentLibraryTable.$inferSelect;
