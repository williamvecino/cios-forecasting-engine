import { Router } from "express";
import { db } from "@workspace/db";
import { agentSimulationsTable, signalsTable, casesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { simulateAgents } from "../lib/agent-engine.js";

const router = Router();

router.get("/cases/:caseId/simulation", async (req, res) => {
  const rows = await db
    .select()
    .from(agentSimulationsTable)
    .where(eq(agentSimulationsTable.caseId, req.params.caseId))
    .orderBy(desc(agentSimulationsTable.simulatedAt))
    .limit(1);
  if (rows.length === 0) return res.json(null);
  res.json(rows[0]);
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

  const { agentResults, adoptionSequence, overallReadiness } = simulateAgents(signals);

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

  res.status(201).json(saved);
});

export default router;
