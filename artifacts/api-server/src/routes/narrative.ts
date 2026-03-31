import { Router } from "express";
import { db, casesTable, forecastLedgerTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { generateNarrative, type NarrativeInput } from "../lib/narrative-generator.js";
import { scanObjectForGapViolations, replaceGapPhrases } from "../lib/narrative-gap-guard.js";

const router = Router();

router.get("/cases/:caseId/narrative", async (req, res) => {
  const { caseId } = req.params;

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0] as any;

  if (caseData.currentProbability == null) {
    return res.status(400).json({ error: "No forecast available for this case. Run a forecast first." });
  }

  const base = `http://localhost:${process.env.PORT || 8080}`;
  const forecastRes = await fetch(`${base}/api/cases/${caseId}/forecast`);
  if (!forecastRes.ok) return res.status(502).json({ error: "Failed to fetch forecast data" });
  const forecast = await forecastRes.json() as any;

  const ledgerRows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, caseId))
    .orderBy(desc(forecastLedgerTable.forecastDate))
    .limit(1);
  const latestLedger = ledgerRows[0] ?? null;

  const signalDetails = (forecast.signalDetails ?? []) as any[];
  const positiveDrivers = signalDetails
    .filter((s: any) => s.direction === "Positive")
    .sort((a: any, b: any) => Math.abs(b.likelihoodRatio - 1) - Math.abs(a.likelihoodRatio - 1))
    .map((s: any) => ({
      description: s.description || s.signalDescription || "Unknown signal",
      signalType: s.signalType || "Unknown",
      likelihoodRatio: s.likelihoodRatio ?? 1,
    }));

  const negativeDrivers = signalDetails
    .filter((s: any) => s.direction === "Negative")
    .sort((a: any, b: any) => Math.abs(b.likelihoodRatio - 1) - Math.abs(a.likelihoodRatio - 1))
    .map((s: any) => ({
      description: s.description || s.signalDescription || "Unknown signal",
      signalType: s.signalType || "Unknown",
      likelihoodRatio: s.likelihoodRatio ?? 1,
    }));

  const interpretation = forecast.interpretation ?? {
    primaryStatement: "Forecast assessment generated",
    topSupportiveActor: caseData.topSupportiveActor ?? "Unknown",
    topConstrainingActor: caseData.topConstrainingActor ?? "Unknown",
    highestImpactSignal: "No dominant signal identified",
    recommendedAction: "Continue monitoring",
    behavioralSummary: "Actor ecosystem assessment pending.",
  };

  const sensitivityAnalysis = forecast.sensitivityAnalysis ?? {
    upwardSignals: [],
    downwardSignals: [],
    swingFactor: 0,
    stabilityNote: "Sensitivity analysis not available.",
  };

  const input: NarrativeInput = {
    caseId,
    strategicQuestion: caseData.strategicQuestion,
    assetName: caseData.assetName || caseData.primaryBrand || "Asset",
    therapeuticArea: caseData.therapeuticArea || "Unknown",
    currentProbability: caseData.currentProbability,
    priorProbability: caseData.priorProbability ?? 0.5,
    confidenceLevel: caseData.confidenceLevel ?? "Developing",
    timeHorizon: caseData.timeHorizon ?? "12 months",
    forecastDate: forecast.savedAt ?? new Date().toISOString(),
    predictionId: latestLedger?.predictionId ?? undefined,
    positiveDrivers,
    negativeDrivers,
    interpretation,
    sensitivityAnalysis,
  };

  const narrative = generateNarrative(input);

  const gapViolations = scanObjectForGapViolations(narrative.sections);
  if (gapViolations.length > 0) {
    for (const key of Object.keys(narrative.sections) as (keyof typeof narrative.sections)[]) {
      if (typeof narrative.sections[key] === "string") {
        (narrative.sections as any)[key] = replaceGapPhrases(narrative.sections[key] as string);
      }
    }
  }

  res.json({
    ...narrative,
    _gapGuard: {
      clean: gapViolations.length === 0,
      violationCount: gapViolations.length,
      violations: gapViolations,
    },
  });
});

export default router;
