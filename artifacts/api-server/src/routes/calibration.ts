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
  };
}

export default router;
