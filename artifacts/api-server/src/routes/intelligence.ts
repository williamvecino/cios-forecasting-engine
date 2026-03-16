import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, calibrationLogTable, caseLibraryTable, bucketCorrectionsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { generateStrategicQuestions } from "../lib/question-engine.js";
import { generateForecastChallenge } from "../lib/challenge-engine.js";
import { getBucket } from "./calibration.js";

const router = Router();

// ── Shared: load latest snapshot for a case ──────────────────────────────────
async function getLatestSnapshot(caseId: string): Promise<any | null> {
  const [entry] = await db
    .select()
    .from(calibrationLogTable)
    .where(eq(calibrationLogTable.caseId, caseId))
    .orderBy(desc(calibrationLogTable.predictionDate))
    .limit(1);

  if (!entry?.snapshotJson) return null;
  try {
    return JSON.parse(entry.snapshotJson);
  } catch {
    return null;
  }
}

// ── GET /cases/:caseId/questions ─────────────────────────────────────────────
router.get("/cases/:caseId/questions", async (req, res) => {
  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.caseId, req.params.caseId))
    .limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const snapshot = await getLatestSnapshot(req.params.caseId);
  if (!snapshot) {
    return res.status(400).json({
      error: "No forecast snapshot found. Run a forecast first.",
    });
  }

  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId));

  // Fetch bucket mean error for the current forecast probability
  const bucket = getBucket(snapshot.currentProbability ?? 0);
  const allBucketRows = await db.select().from(bucketCorrectionsTable);
  const bucketRow = bucket
    ? allBucketRows.find((r) => r.bucket === bucket)
    : null;
  const bucketMeanError = bucketRow?.meanForecastError ?? undefined;

  const questionSet = generateStrategicQuestions(
    snapshot,
    caseRow.strategicQuestion ?? "What is the probability of meaningful HCP adoption?",
    signals,
    bucketMeanError
  );

  res.json({
    caseId: req.params.caseId,
    forecastProbability: snapshot.currentProbability,
    ...questionSet,
  });
});

// ── GET /cases/:caseId/challenge ─────────────────────────────────────────────
router.get("/cases/:caseId/challenge", async (req, res) => {
  const [caseRow] = await db
    .select()
    .from(casesTable)
    .where(eq(casesTable.caseId, req.params.caseId))
    .limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const snapshot = await getLatestSnapshot(req.params.caseId);
  if (!snapshot) {
    return res.status(400).json({
      error: "No forecast snapshot found. Run a forecast first.",
    });
  }

  const signals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId));

  // Get therapy areas of top analogs for this case from the library
  const analogRows = await db
    .select({ therapyArea: caseLibraryTable.therapyArea })
    .from(caseLibraryTable)
    .limit(30);
  const analogTherapyAreas = analogRows
    .map((r) => r.therapyArea)
    .filter((t): t is string => Boolean(t));

  const challenge = generateForecastChallenge(
    snapshot,
    caseRow.strategicQuestion ?? "",
    signals,
    analogTherapyAreas,
    caseRow.therapeuticArea ?? "Unknown"
  );

  res.json({
    caseId: req.params.caseId,
    ...challenge,
  });
});

export default router;
