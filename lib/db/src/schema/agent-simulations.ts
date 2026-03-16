import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export interface AgentResult {
  agentId: string;
  label: string;
  role: string;
  stance: "early_supporter" | "supportive" | "neutral" | "cautious" | "resistant" | "active_opposition" | "increased_pressure" | "monitoring" | "complacent";
  reactionScore: number;
  baseReactionScore?: number;
  topSignals: Array<{ description: string; signalType: string; contribution: number }>;
  reasoning: string;
  responsePhase: "early" | "mainstream" | "lagging";
  influenceAnnotations?: Array<{ fromLabel: string; label: string; delta: number }>;
}

export interface AdoptionPhase {
  phase: "early" | "mainstream" | "lagging";
  label: string;
  timeframe: string;
  agents: string[];
}

export const agentSimulationsTable = pgTable("agent_simulations", {
  id: text("id").primaryKey(),
  caseId: text("case_id").notNull(),
  simulationId: text("simulation_id").notNull(),
  agentResults: jsonb("agent_results").notNull().$type<AgentResult[]>(),
  adoptionSequence: jsonb("adoption_sequence").$type<AdoptionPhase[]>(),
  overallReadiness: text("overall_readiness"),
  signalCount: text("signal_count"),
  simulatedAt: timestamp("simulated_at").defaultNow(),
});

export type AgentSimulation = typeof agentSimulationsTable.$inferSelect;
