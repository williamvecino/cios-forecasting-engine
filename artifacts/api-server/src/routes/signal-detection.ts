import { Router } from "express";
import { db } from "@workspace/db";
import {
  detectionRunsTable,
  detectedSignalsTable,
  signalCaseSuggestionsTable,
  casesTable,
} from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { extractSignalsFromSource, matchSignalsToCases } from "../lib/signal-detection.js";

const router = Router();

router.post("/detection-runs", async (req, res) => {
  const { sources, therapyArea, geography, targetType, specialty, subspecialty } = req.body;

  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return res.status(400).json({ error: "At least one source is required." });
  }

  for (const s of sources) {
    if (!s.label || !s.text || s.text.trim().length < 20) {
      return res.status(400).json({ error: "Each source needs a label and at least 20 characters of text." });
    }
  }

  const runId = `DETECT-${Date.now()}`;

  const [run] = await db.insert(detectionRunsTable).values({
    runId,
    sourceListJson: sources.map((s: any) => ({ label: s.label, url: s.url })),
    filtersJson: { therapyArea, geography, targetType, specialty, subspecialty },
    runStatus: "running",
  }).returning();

  try {
    const allDetected: any[] = [];

    for (const source of sources) {
      const signals = await extractSignalsFromSource(source);
      for (const sig of signals) {
        const id = randomUUID();
        const [inserted] = await db.insert(detectedSignalsTable).values({
          id,
          runId,
          sourceLabel: sig.sourceLabel,
          sourceUrl: sig.sourceUrl,
          detectedDate: sig.detectedDate,
          signalType: sig.signalType,
          suggestedDirection: sig.suggestedDirection,
          suggestedStrength: sig.suggestedStrength,
          suggestedScope: sig.suggestedScope,
          possibleEventFamily: sig.possibleEventFamily,
          extractionConfidence: sig.extractionConfidence,
          evidenceSnippet: sig.evidenceSnippet,
          therapyArea: sig.therapyArea || therapyArea || null,
          geography: sig.geography || geography || null,
          specialty: sig.specialty || specialty || null,
          subspecialty: sig.subspecialty || subspecialty || null,
          institutionName: sig.institutionName,
          physicianName: sig.physicianName,
          status: "candidate",
        }).returning();
        allDetected.push({ ...inserted, _rawSignal: sig });
      }
    }

    let totalSuggestions = 0;
    if (allDetected.length > 0) {
      const rawSignals = allDetected.map(d => d._rawSignal);
      const suggestions = await matchSignalsToCases(rawSignals);

      for (let i = 0; i < suggestions.length; i++) {
        const sig = suggestions[i];
        const matchedDetected = allDetected.find(d =>
          d._rawSignal.therapyArea === rawSignals[i % rawSignals.length]?.therapyArea
        );
        if (!matchedDetected) continue;

        await db.insert(signalCaseSuggestionsTable).values({
          id: randomUUID(),
          detectedSignalId: matchedDetected.id,
          caseId: sig.caseId,
          matchConfidence: sig.matchConfidence,
          matchReason: sig.matchReason,
        });
        totalSuggestions++;
      }
    }

    await db.update(detectionRunsTable)
      .set({
        runStatus: "completed",
        totalSignalsDetected: allDetected.length,
        totalCaseSuggestions: totalSuggestions,
      })
      .where(eq(detectionRunsTable.runId, runId));

    const detectedClean = allDetected.map(({ _rawSignal, ...rest }) => rest);
    res.json({ runId, totalSignals: allDetected.length, totalSuggestions, signals: detectedClean });
  } catch (err: any) {
    console.error("[signal-detection]", err);
    await db.update(detectionRunsTable)
      .set({ runStatus: "failed" })
      .where(eq(detectionRunsTable.runId, runId));
    res.status(500).json({ error: "Signal detection failed. Please try again." });
  }
});

router.get("/detection-runs", async (_req, res) => {
  const runs = await db.select().from(detectionRunsTable).orderBy(desc(detectionRunsTable.createdAt));
  res.json(runs);
});

router.get("/detection-runs/:runId", async (req, res) => {
  const [run] = await db.select().from(detectionRunsTable).where(eq(detectionRunsTable.runId, req.params.runId));
  if (!run) return res.status(404).json({ error: "Run not found" });

  const signals = await db.select().from(detectedSignalsTable)
    .where(eq(detectedSignalsTable.runId, req.params.runId))
    .orderBy(desc(detectedSignalsTable.createdAt));

  const signalIds = signals.map(s => s.id);
  let caseSuggestions: any[] = [];
  if (signalIds.length > 0) {
    caseSuggestions = await db.select().from(signalCaseSuggestionsTable);
    caseSuggestions = caseSuggestions.filter(cs => signalIds.includes(cs.detectedSignalId));
  }

  res.json({ run, signals, caseSuggestions });
});

router.get("/detected-signals", async (req, res) => {
  const { runId, status, signalType } = req.query as Record<string, string>;

  let query = db.select().from(detectedSignalsTable);
  const conditions: any[] = [];
  if (runId) conditions.push(eq(detectedSignalsTable.runId, runId));
  if (status) conditions.push(eq(detectedSignalsTable.status, status));
  if (signalType) conditions.push(eq(detectedSignalsTable.signalType, signalType));

  const { and } = await import("drizzle-orm");
  const signals = conditions.length > 0
    ? await db.select().from(detectedSignalsTable).where(and(...conditions)).orderBy(desc(detectedSignalsTable.createdAt))
    : await db.select().from(detectedSignalsTable).orderBy(desc(detectedSignalsTable.createdAt));

  res.json(signals);
});

router.get("/detected-signals/:id/suggestions", async (req, res) => {
  const suggestions = await db.select().from(signalCaseSuggestionsTable)
    .where(eq(signalCaseSuggestionsTable.detectedSignalId, req.params.id));

  const casesData = await db.select().from(casesTable);
  const caseMap = Object.fromEntries(casesData.map(c => [c.caseId, c]));

  const enriched = suggestions.map(s => ({
    ...s,
    caseName: caseMap[s.caseId]?.assetName || s.caseId,
    caseTherapyArea: caseMap[s.caseId]?.therapeuticArea || null,
  }));

  res.json(enriched);
});

router.patch("/detected-signals/:id", async (req, res) => {
  const { status } = req.body;
  if (!["candidate", "validated", "rejected"].includes(status)) {
    return res.status(400).json({ error: "Status must be candidate, validated, or rejected." });
  }

  const [updated] = await db.update(detectedSignalsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(detectedSignalsTable.id, req.params.id))
    .returning();

  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.post("/detected-signals/:id/link-to-case", async (req, res) => {
  const { caseId } = req.body;
  if (!caseId) return res.status(400).json({ error: "caseId is required." });

  const [signal] = await db.select().from(detectedSignalsTable).where(eq(detectedSignalsTable.id, req.params.id));
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId));
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const [suggestion] = await db.insert(signalCaseSuggestionsTable).values({
    id: randomUUID(),
    detectedSignalId: signal.id,
    caseId,
    matchConfidence: "high",
    matchReason: "Manually linked by user",
  }).returning();

  res.json(suggestion);
});

export default router;
