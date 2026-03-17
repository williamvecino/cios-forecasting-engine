import { Router } from "express";
import { db, casesTable, signalsTable, signalWatchlistTable, forecastLedgerTable } from "@workspace/db";
import { eq, desc, inArray, isNotNull, isNull } from "drizzle-orm";

const router = Router();

interface BriefSignalSummary {
  description: string;
  signalType: string;
  caseId: string;
  assetName: string;
  likelihoodRatio: number;
}

interface BriefForecast {
  caseId: string;
  assetName: string;
  therapeuticArea: string;
  strategicQuestion: string;
  currentProbability: number;
  confidenceLevel: string;
  timeHorizon: string;
}

interface BriefWatchlistEvent {
  watchEventId: string;
  eventType: string;
  eventName: string;
  targetAssetOrCompetitor: string | null;
  expectedDate: string | null;
  status: string;
  potentialSignalCategory: string | null;
  expectedDirection: string | null;
}

interface WeeklyStrategicBrief {
  generatedAt: string;
  briefDate: string;
  systemOverview: {
    activeForecasts: number;
    pendingAssessments: number;
    resolvedForecasts: number;
    calibrationScore: number | null;
    totalSignals: number;
    watchlistEvents: number;
  };
  keyForecasts: BriefForecast[];
  majorDrivers: BriefSignalSummary[];
  keyRisks: BriefSignalSummary[];
  upcomingWatchlist: BriefWatchlistEvent[];
}

router.get("/weekly-brief", async (_req, res) => {
  const allCases = await db.select().from(casesTable);
  const activeCases = allCases.filter((c) => (c as any).currentProbability != null);
  const pendingCases = allCases.filter((c) => (c as any).currentProbability == null);

  const activeCaseIds = activeCases.map((c) => c.caseId);

  const allSignals = activeCaseIds.length > 0
    ? await db.select().from(signalsTable).where(inArray(signalsTable.caseId, activeCaseIds))
    : [];

  const resolvedLedger = await db
    .select()
    .from(forecastLedgerTable)
    .where(isNotNull(forecastLedgerTable.actualOutcome));

  let calibrationScore: number | null = null;
  if (resolvedLedger.length > 0) {
    const totalBrier = resolvedLedger.reduce((sum, e) => {
      const error = (e.forecastProbability - (e.actualOutcome ?? 0));
      return sum + error * error;
    }, 0);
    calibrationScore = Number((totalBrier / resolvedLedger.length).toFixed(4));
  }

  const watchlistEntries = await db
    .select()
    .from(signalWatchlistTable)
    .where(inArray(signalWatchlistTable.status, ["Upcoming", "Monitoring"]))
    .orderBy(signalWatchlistTable.expectedDate);

  const caseMap = new Map(allCases.map((c) => [c.caseId, c as any]));

  const keyForecasts: BriefForecast[] = activeCases
    .sort((a, b) => ((b as any).currentProbability ?? 0) - ((a as any).currentProbability ?? 0))
    .slice(0, 10)
    .map((c) => {
      const cd = c as any;
      return {
        caseId: c.caseId,
        assetName: cd.assetName || c.primaryBrand || "Unknown",
        therapeuticArea: cd.therapeuticArea || "Unknown",
        strategicQuestion: c.strategicQuestion,
        currentProbability: cd.currentProbability,
        confidenceLevel: c.confidenceLevel || "Developing",
        timeHorizon: cd.timeHorizon || "12 months",
      };
    });

  const positiveSignals = allSignals
    .filter((s) => s.direction === "Positive" && s.likelihoodRatio > 1.0)
    .sort((a, b) => Math.abs(b.likelihoodRatio - 1) - Math.abs(a.likelihoodRatio - 1))
    .slice(0, 8);

  const negativeSignals = allSignals
    .filter((s) => s.direction === "Negative" || s.likelihoodRatio < 1.0)
    .sort((a, b) => Math.abs(a.likelihoodRatio - 1) - Math.abs(b.likelihoodRatio - 1))
    .slice(0, 6);

  const mapSignal = (s: typeof allSignals[0]): BriefSignalSummary => ({
    description: s.signalDescription,
    signalType: s.signalType,
    caseId: s.caseId,
    assetName: caseMap.get(s.caseId)?.assetName || caseMap.get(s.caseId)?.primaryBrand || "Unknown",
    likelihoodRatio: s.likelihoodRatio,
  });

  const majorDrivers = positiveSignals.map(mapSignal);
  const keyRisks = negativeSignals.map(mapSignal);

  const upcomingWatchlist: BriefWatchlistEvent[] = watchlistEntries.map((w) => ({
    watchEventId: w.watchEventId,
    eventType: w.eventType,
    eventName: w.eventName,
    targetAssetOrCompetitor: w.targetAssetOrCompetitor,
    expectedDate: w.expectedDate?.toISOString() ?? null,
    status: w.status,
    potentialSignalCategory: w.potentialSignalCategory,
    expectedDirection: w.expectedDirection,
  }));

  const brief: WeeklyStrategicBrief = {
    generatedAt: new Date().toISOString(),
    briefDate: new Date().toISOString().split("T")[0],
    systemOverview: {
      activeForecasts: activeCases.length,
      pendingAssessments: pendingCases.length,
      resolvedForecasts: resolvedLedger.length,
      calibrationScore,
      totalSignals: allSignals.length,
      watchlistEvents: watchlistEntries.length,
    },
    keyForecasts,
    majorDrivers,
    keyRisks,
    upcomingWatchlist,
  };

  res.json(brief);
});

export default router;
