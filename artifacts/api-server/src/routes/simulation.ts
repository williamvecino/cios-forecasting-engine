import { Router } from "express";
import { db } from "@workspace/db";
import { agentSimulationsTable, signalsTable, casesTable, AGENT_ARCHETYPES } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { simulateAgents } from "../lib/agent-engine.js";

const router = Router();

function computeDerivedTranslation(agentResults: any[]): number {
  const prescriberIds = ["academic_specialist", "community_specialist", "inpatient_prescriber"];
  let weightedNetScore = 0;
  let totalWeight = 0;
  for (const id of prescriberIds) {
    const result = agentResults.find((r: any) => r.agentId === id);
    const archetype = AGENT_ARCHETYPES.find((a) => a.id === id);
    if (result && archetype) {
      weightedNetScore += (result.reactionScore ?? 0) * archetype.influenceScore;
      totalWeight += archetype.influenceScore;
    }
  }
  const netScore = totalWeight > 0 ? weightedNetScore / totalWeight : 0;
  return Math.exp(netScore / 4);
}

router.get("/cases/:caseId/simulation", async (req, res) => {
  const rows = await db
    .select()
    .from(agentSimulationsTable)
    .where(eq(agentSimulationsTable.caseId, req.params.caseId))
    .orderBy(desc(agentSimulationsTable.simulatedAt))
    .limit(1);
  if (rows.length === 0) return res.json(null);
  const row = rows[0];
  const agentDerivedActorTranslation = computeDerivedTranslation(row.agentResults as any[]);
  res.json({ ...row, agentDerivedActorTranslation });
});

router.post("/cases/:caseId/simulation", async (req, res) => {
  const { caseId } = req.params;

  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.caseId, caseId));

  if (signals.length === 0) {
    return res.status(400).json({ error: "No signals found for this case. Add signals before running simulation." });
  }

  const { agentResults, adoptionSequence, overallReadiness, agentDerivedActorTranslation } = simulateAgents(signals);

  const simId = `SIM-${Date.now()}`;
  const [saved] = await db.insert(agentSimulationsTable).values({
    id: randomUUID(),
    caseId,
    simulationId: simId,
    agentResults,
    adoptionSequence,
    overallReadiness,
    signalCount: String(signals.length),
  }).returning();

  res.status(201).json({ ...saved, agentDerivedActorTranslation });
});

export default router;
