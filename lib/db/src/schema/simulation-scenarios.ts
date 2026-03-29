import { pgTable, text, real, jsonb, timestamp } from "drizzle-orm/pg-core";

export const simulationScenariosTable = pgTable("simulation_scenarios", {
  id: text("id").primaryKey(),
  simulationId: text("simulation_id").notNull(),
  caseId: text("case_id").notNull(),

  scenarioName: text("scenario_name").notNull(),
  scenarioType: text("scenario_type").notNull(),
  scenarioCategory: text("scenario_category").notNull(),

  modifiedVariables: jsonb("modified_variables").notNull().$type<ModifiedVariable[]>(),
  affectedSegments: jsonb("affected_segments").$type<string[]>(),

  baselinePosterior: real("baseline_posterior").notNull(),
  simulatedPosterior: real("simulated_posterior").notNull(),

  baselineFeasibility: jsonb("baseline_feasibility").$type<FeasibilitySnapshot>(),
  simulatedFeasibility: jsonb("simulated_feasibility").$type<FeasibilitySnapshot>(),

  baselineReadiness: jsonb("baseline_readiness").$type<ReadinessSnapshot>(),
  simulatedReadiness: jsonb("simulated_readiness").$type<ReadinessSnapshot>(),

  segmentShifts: jsonb("segment_shifts").$type<SegmentShift[]>(),

  primaryShiftDrivers: jsonb("primary_shift_drivers").$type<string[]>(),
  primaryShiftConstraints: jsonb("primary_shift_constraints").$type<string[]>(),

  confidenceLevel: text("confidence_level").notNull(),
  impactMagnitude: real("impact_magnitude").notNull(),
  impactDirection: text("impact_direction").notNull(),
  rationaleSummary: text("rationale_summary"),

  createdAt: timestamp("created_at").defaultNow(),
});

export interface ModifiedVariable {
  variableName: string;
  originalValue: number;
  simulatedValue: number;
  modificationReason: string;
}

export interface FeasibilitySnapshot {
  score: number;
  tier: string;
  nearTermPotential: number;
  mediumTermPotential: number;
}

export interface ReadinessSnapshot {
  overallScore: number;
  blockedCount: number;
  onTrackCount: number;
}

export interface SegmentShift {
  segmentName: string;
  segmentType: string;
  baselineAdoption: number;
  simulatedAdoption: number;
  baselineTier: string;
  simulatedTier: string;
  movementDirection: "upward" | "stable" | "decline" | "newly_activated";
  shiftMagnitude: number;
}

export type SimulationScenario = typeof simulationScenariosTable.$inferSelect;
export type InsertSimulationScenario = typeof simulationScenariosTable.$inferInsert;
