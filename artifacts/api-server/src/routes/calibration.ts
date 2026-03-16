import { Router } from "express";
import { db } from "@workspace/db";
import { calibrationLogTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/calibration", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable).orderBy(calibrationLogTable.predictionDate);
  res.json(rows.map(mapEntry));
});

router.post("/calibration/:forecastId/outcome", async (req, res) => {
  const body = req.body;
  const observed = body.observedOutcome;
  const existing = await db.select().from(calibrationLogTable)
    .where(eq(calibrationLogTable.forecastId, req.params.forecastId)).limit(1);
  if (!existing[0]) return res.status(404).json({ error: "Forecast not found" });

  const brierComponent = Math.pow(existing[0].predictedProbability - observed, 2);
  const forecastError = observed - existing[0].predictedProbability;

  const [updated] = await db.update(calibrationLogTable)
    .set({
      observedOutcome: observed,
      brierComponent,
      forecastError,
      notes: body.notes || existing[0].notes,
      userFeedback: body.userFeedback,
      reviewerComments: body.reviewerComments,
    })
    .where(eq(calibrationLogTable.forecastId, req.params.forecastId))
    .returning();
  res.json(mapEntry(updated));
});

router.get("/calibration/stats", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null);

  const meanBrier = calibrated.length > 0
    ? calibrated.reduce((s, r) => s + (r.brierComponent ?? 0), 0) / calibrated.length
    : null;

  const meanError = calibrated.length > 0
    ? calibrated.reduce((s, r) => s + (r.forecastError ?? 0), 0) / calibrated.length
    : null;

  const bands = [
    { label: "0–0.2", min: 0, max: 0.2 },
    { label: "0.2–0.4", min: 0.2, max: 0.4 },
    { label: "0.4–0.6", min: 0.4, max: 0.6 },
    { label: "0.6–0.8", min: 0.6, max: 0.8 },
    { label: "0.8–1.0", min: 0.8, max: 1.0 },
  ];

  const bandStats = bands.map((b) => {
    const inBand = calibrated.filter(
      (r) => r.predictedProbability >= b.min && r.predictedProbability < b.max
    );
    const meanPred = inBand.length > 0
      ? inBand.reduce((s, r) => s + r.predictedProbability, 0) / inBand.length
      : null;
    const meanAct = inBand.length > 0
      ? inBand.reduce((s, r) => s + (r.observedOutcome ?? 0), 0) / inBand.length
      : null;
    return { band: b.label, count: inBand.length, meanPredicted: meanPred, meanActual: meanAct };
  });

  res.json({
    totalForecasts: rows.length,
    calibratedForecasts: calibrated.length,
    meanBrierScore: meanBrier,
    meanForecastError: meanError,
    bandStats,
  });
});

// Error patterns — which signal types are associated with systematic forecast bias
router.get("/calibration/error-patterns", async (_req, res) => {
  const rows = await db.select().from(calibrationLogTable);
  const calibrated = rows.filter((r) => r.observedOutcome !== null && r.snapshotJson);

  // Accumulate errors per signal type by parsing the stored snapshot
  const typeMap: Record<string, { errors: number[]; briers: number[] }> = {};

  for (const row of calibrated) {
    let snapshot: any;
    try {
      snapshot = JSON.parse(row.snapshotJson!);
    } catch {
      continue;
    }

    const signalDetails: any[] = snapshot.signalDetails ?? [];
    const activeTypes = [...new Set(
      signalDetails
        .map((s: any) => s.signalType as string)
        .filter((t): t is string => Boolean(t) && t !== "Unknown")
    )];

    for (const st of activeTypes) {
      if (!typeMap[st]) typeMap[st] = { errors: [], briers: [] };
      typeMap[st].errors.push(row.forecastError!);
      typeMap[st].briers.push(row.brierComponent!);
    }
  }

  // Also accumulate errors for actor-level patterns from actorAggregation
  const actorMap: Record<string, { errors: number[]; briers: number[] }> = {};
  for (const row of calibrated) {
    let snapshot: any;
    try { snapshot = JSON.parse(row.snapshotJson!); } catch { continue; }
    const actors: any[] = snapshot.actorAggregation ?? [];
    for (const a of actors) {
      if (!a.actor) continue;
      const effect: number = a.netActorEffect ?? 0;
      const stance: string = a.stance ?? "";
      // Only accumulate actors that had a meaningful opinion
      if (Math.abs(effect) < 0.05) continue;
      if (!actorMap[a.actor]) actorMap[a.actor] = { errors: [], briers: [] };
      actorMap[a.actor].errors.push(row.forecastError!);
      actorMap[a.actor].briers.push(row.brierComponent!);
    }
  }

  const toPattern = (
    name: string,
    data: { errors: number[]; briers: number[] },
    category: "signal_type" | "actor"
  ) => {
    const n = data.errors.length;
    const meanError = data.errors.reduce((s, e) => s + e, 0) / n;
    const meanBrier = data.briers.reduce((s, b) => s + b, 0) / n;
    return {
      name,
      category,
      sampleSize: n,
      meanError: Number(meanError.toFixed(4)),
      meanBrierScore: Number(meanBrier.toFixed(4)),
      bias: meanError > 0.05 ? "under" as const : meanError < -0.05 ? "over" as const : "balanced" as const,
    };
  };

  const signalPatterns = Object.entries(typeMap)
    .map(([name, data]) => toPattern(name, data, "signal_type"))
    .sort((a, b) => Math.abs(b.meanError) - Math.abs(a.meanError));

  const actorPatterns = Object.entries(actorMap)
    .map(([name, data]) => toPattern(name, data, "actor"))
    .sort((a, b) => Math.abs(b.meanError) - Math.abs(a.meanError));

  res.json({ signalPatterns, actorPatterns, calibratedCount: calibrated.length });
});

function mapEntry(r: typeof calibrationLogTable.$inferSelect) {
  return {
    id: r.id,
    forecastId: r.forecastId,
    caseId: r.caseId,
    predictionDate: r.predictionDate,
    predictedProbability: r.predictedProbability,
    observedOutcome: r.observedOutcome,
    brierComponent: r.brierComponent,
    forecastError: r.forecastError,
    notes: r.notes,
    userFeedback: r.userFeedback,
    reviewerComments: r.reviewerComments,
    hasSnapshot: Boolean(r.snapshotJson),
  };
}

export default router;
