import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable, calibrationLogTable, caseLibraryTable, bucketCorrectionsTable, lrCorrectionsTable } from "@workspace/db";
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

// ── GET /cases/:caseId/trace ──────────────────────────────────────────────────
router.get("/cases/:caseId/trace", async (req, res) => {
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

  const [signals, allBucketRows, allLrRows] = await Promise.all([
    db.select().from(signalsTable).where(eq(signalsTable.caseId, req.params.caseId)),
    db.select().from(bucketCorrectionsTable),
    db.select().from(lrCorrectionsTable),
  ]);

  // ── Signal drivers ─────────────────────────────────────────────────────────
  const signalDetails: any[] = snapshot.signalDetails ?? [];
  const withContribution = signalDetails
    .filter((s) => (s.likelihoodRatio ?? s.lr) !== undefined)
    .map((s) => {
      const lrVal = Number(s.likelihoodRatio ?? s.lr ?? 1);
      return {
        signalType: s.signalType ?? "Unknown",
        description: s.description ?? s.signalDescription ?? "",
        lr: lrVal,
        contribution: Math.abs(lrVal - 1),
        direction: lrVal >= 1 ? "positive" : "negative",
      };
    })
    .sort((a, b) => b.contribution - a.contribution);

  const topPositiveDrivers = withContribution
    .filter((s) => s.direction === "positive")
    .slice(0, 3)
    .map((s) => ({ signalType: s.signalType, lr: Number(s.lr.toFixed(3)), description: s.description }));

  const topNegativeDrivers = withContribution
    .filter((s) => s.direction === "negative")
    .slice(0, 3)
    .map((s) => ({ signalType: s.signalType, lr: Number(s.lr.toFixed(3)), description: s.description }));

  // ── Actor bottleneck ───────────────────────────────────────────────────────
  const actors: any[] = snapshot.actorAggregation ?? [];
  const sortedActors = [...actors].sort((a, b) => (a.netActorEffect ?? 0) - (b.netActorEffect ?? 0));
  const bottleneck = sortedActors[0];
  const actorBottleneck = bottleneck
    ? {
        actor: bottleneck.actor,
        label: bottleneck.actor?.replace(/_/g, " "),
        netActorEffect: Number((bottleneck.netActorEffect ?? 0).toFixed(3)),
        influence: bottleneck.netActorEffect < -0.1 ? "strong_resistance" : "mild_resistance",
      }
    : null;

  // ── Analog support — query library for therapy area / specialty matches ──────
  const therapyArea = snapshot.therapeuticArea ?? caseRow.therapeuticArea ?? null;
  const specialty = snapshot.specialty ?? caseRow.specialty ?? null;
  const analogLibraryRows = await db.select().from(caseLibraryTable).limit(50);
  const matchedAnalogs = analogLibraryRows.filter((r) => {
    const taMatch = therapyArea && r.therapyArea &&
      r.therapyArea.toLowerCase().includes(therapyArea.toLowerCase().split("/")[0].trim());
    const specMatch = specialty && r.specialty &&
      r.specialty.toLowerCase().includes(specialty.toLowerCase().split("/")[0].trim());
    return taMatch || specMatch;
  });
  const topAnalog = matchedAnalogs[0] ?? null;
  const analogSupport = topAnalog
    ? {
        topMatchName: topAnalog.caseName ?? topAnalog.caseId,
        topMatchFinalProbability: topAnalog.finalOutcomeRate !== null
          ? Number((Number(topAnalog.finalOutcomeRate) * 100).toFixed(0))
          : null,
        totalMatches: matchedAnalogs.length,
        coverageNote: matchedAnalogs.length >= 3
          ? `${matchedAnalogs.length} library analogs match this therapy area/specialty`
          : matchedAnalogs.length >= 1
          ? `${matchedAnalogs.length} library analog(s) found — limited precedent`
          : "No analog matches — novel case type",
      }
    : { totalMatches: 0, coverageNote: "No analog matches — novel case type" };

  // ── Calibration summary ────────────────────────────────────────────────────
  const rawProb: number = snapshot.rawProbability ?? snapshot.currentProbability ?? 0;
  const calibProb: number = snapshot.currentProbability ?? rawProb;
  const bucket = getBucket(rawProb);
  const bucketRow = bucket ? allBucketRows.find((r) => r.bucket === bucket) : null;
  const bucketCorrPp = bucketRow?.correctionPp ?? 0;

  const lrCorrectionsApplied = allLrRows
    .filter((r) => {
      const activeTypes = signals.map((s) => s.signalType).filter(Boolean);
      return activeTypes.includes(r.signalType);
    })
    .map((r) => ({
      signalType: r.signalType,
      factor: r.correctionFactor,
      direction: r.direction,
      reason: r.reason,
    }));

  const calibrationSummary = {
    rawProbability: Number((rawProb * 100).toFixed(1)),
    calibratedProbability: Number((calibProb * 100).toFixed(1)),
    totalShiftPp: Number(((calibProb - rawProb) * 100).toFixed(1)),
    bucketCorrectionApplied: bucketCorrPp !== 0
      ? { bucket, correctionPp: Number((bucketCorrPp * 100).toFixed(1)) }
      : null,
    lrCorrectionsApplied,
    lrCorrectionCount: lrCorrectionsApplied.length,
    warnings: {
      bucketLowSample: bucketRow?.lowSampleWarning ?? false,
      bucketDirectionFlip: bucketRow?.directionFlipWarning ?? false,
    },
  };

  // ── Fragile assumption (from challenge engine) ─────────────────────────────
  const analogRows = await db
    .select({ therapyArea: caseLibraryTable.therapyArea })
    .from(caseLibraryTable)
    .limit(30);
  const analogTherapyAreas = analogRows.map((r) => r.therapyArea).filter((t): t is string => Boolean(t));

  const challenge = generateForecastChallenge(
    snapshot,
    caseRow.strategicQuestion ?? "",
    signals,
    analogTherapyAreas,
    caseRow.therapeuticArea ?? "Unknown"
  );

  res.json({
    caseId: req.params.caseId,
    forecastProbability: Number((calibProb * 100).toFixed(1)),
    topPositiveDrivers,
    topNegativeDrivers,
    actorBottleneck,
    analogSupport,
    calibrationSummary,
    fragileAssumption: challenge.fragileAssumption,
    generatedAt: new Date().toISOString(),
  });
});

export default router;
