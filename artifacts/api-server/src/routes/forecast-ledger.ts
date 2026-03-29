import { Router } from "express";
import { db, forecastLedgerTable, casesTable, signalsTable, referenceCasesTable } from "@workspace/db";
import { eq, desc, and, isNotNull, sql, gte, lte, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis, computeNaiveVsCompressed } from "../lib/signal-dependency-engine.js";

const router = Router();

function computeCalibrationBucket(probability: number): string {
  const pct = probability * 100;
  const lower = Math.floor(pct / 10) * 10;
  const upper = lower + 10;
  return `${lower}–${upper}%`;
}

function computeBrierScore(predicted: number, outcome: number): number {
  return Number(Math.pow(predicted - outcome, 2).toFixed(6));
}

router.get("/forecast-ledger", async (_req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .orderBy(desc(forecastLedgerTable.forecastDate));
  res.json(entries);
});

router.get("/forecast-ledger/dashboard", async (req, res) => {
  try {
    const {
      dateFrom, dateTo, domain, status,
      confidenceMin, confidenceMax,
    } = req.query as Record<string, string | undefined>;

    const allEntries = await db.select().from(forecastLedgerTable).orderBy(desc(forecastLedgerTable.forecastDate));

    let filtered = allEntries;

    if (dateFrom) {
      const d = new Date(dateFrom);
      filtered = filtered.filter(e => e.forecastDate && e.forecastDate >= d);
    }
    if (dateTo) {
      const d = new Date(dateTo);
      filtered = filtered.filter(e => e.forecastDate && e.forecastDate <= d);
    }
    if (domain) {
      filtered = filtered.filter(e => e.decisionDomain?.toLowerCase().includes(domain.toLowerCase()));
    }
    if (status) {
      filtered = filtered.filter(e => e.resolutionStatus === status);
    }
    if (confidenceMin) {
      const min = parseFloat(confidenceMin);
      if (!isNaN(min)) filtered = filtered.filter(e => e.forecastProbability >= min);
    }
    if (confidenceMax) {
      const max = parseFloat(confidenceMax);
      if (!isNaN(max)) filtered = filtered.filter(e => e.forecastProbability <= max);
    }

    const resolved = filtered.filter(e => e.brierScore != null && e.actualOutcome != null);
    const open = filtered.filter(e => e.resolutionStatus === "open");

    const brierScores = resolved.map(e => e.brierScore!).sort((a, b) => a - b);
    const meanBrier = brierScores.length > 0
      ? Number((brierScores.reduce((s, v) => s + v, 0) / brierScores.length).toFixed(4))
      : null;
    const medianBrier = brierScores.length > 0
      ? Number(brierScores[Math.floor(brierScores.length / 2)].toFixed(4))
      : null;

    const absErrors = resolved.map(e => Math.abs(e.forecastProbability - (e.actualOutcome ?? 0)));
    const meanAbsError = absErrors.length > 0
      ? Number((absErrors.reduce((s, v) => s + v, 0) / absErrors.length).toFixed(4))
      : null;

    let overconfidenceCount = 0;
    let underconfidenceCount = 0;
    for (const e of resolved) {
      const predicted = e.forecastProbability;
      const actual = e.actualOutcome ?? 0;
      if (predicted > actual + 0.05) overconfidenceCount++;
      else if (predicted < actual - 0.05) underconfidenceCount++;
    }
    const overconfidenceRate = resolved.length > 0 ? Number((overconfidenceCount / resolved.length).toFixed(4)) : null;
    const underconfidenceRate = resolved.length > 0 ? Number((underconfidenceCount / resolved.length).toFixed(4)) : null;

    const caseVersionMap = new Map<string, typeof filtered>();
    for (const e of filtered) {
      if (!caseVersionMap.has(e.caseId)) caseVersionMap.set(e.caseId, []);
      caseVersionMap.get(e.caseId)!.push(e);
    }
    const multiVersionCases = Array.from(caseVersionMap.entries()).filter(([, v]) => v.length > 1);
    const totalRevisions = filtered.reduce((s, e) => s + (e.updateVersion > 1 ? 1 : 0), 0);

    let revisionImprovementCount = 0;
    let revisionTotalWithOutcome = 0;
    const revisionAnalysis: any[] = [];
    for (const [caseId, versions] of multiVersionCases) {
      const sorted = versions.sort((a, b) => a.updateVersion - b.updateVersion);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const hasOutcome = last.actualOutcome != null;

      let movedCloser: boolean | null = null;
      let confidenceChange: string | null = null;

      if (hasOutcome) {
        const outcome = last.actualOutcome!;
        const firstError = Math.abs(first.forecastProbability - outcome);
        const lastError = Math.abs(last.forecastProbability - outcome);
        movedCloser = lastError < firstError;
        revisionTotalWithOutcome++;
        if (movedCloser) revisionImprovementCount++;

        if (last.forecastProbability > first.forecastProbability) {
          confidenceChange = outcome > 0.5 ? "more_justified" : "less_justified";
        } else if (last.forecastProbability < first.forecastProbability) {
          confidenceChange = outcome < 0.5 ? "more_justified" : "less_justified";
        } else {
          confidenceChange = "unchanged";
        }
      }

      revisionAnalysis.push({
        caseId,
        strategicQuestion: first.strategicQuestion,
        versionCount: sorted.length,
        firstForecast: first.forecastProbability,
        finalForecast: last.forecastProbability,
        outcome: last.actualOutcome,
        resolutionStatus: last.resolutionStatus,
        movedCloser,
        confidenceChange,
        versions: sorted.map(v => ({
          version: v.updateVersion,
          probability: v.forecastProbability,
          date: v.forecastDate,
          rationale: v.updateRationale,
        })),
      });
    }
    const revisionImprovementRate = revisionTotalWithOutcome > 0
      ? Number((revisionImprovementCount / revisionTotalWithOutcome).toFixed(4))
      : null;

    const BUCKET_ORDER = ["0\u201310%", "10\u201320%", "20\u201330%", "30\u201340%", "40\u201350%", "50\u201360%", "60\u201370%", "70\u201380%", "80\u201390%", "90\u2013100%"];
    const bucketMap = new Map<string, { count: number; totalBrier: number; sumPredicted: number; sumActual: number }>();
    for (const b of BUCKET_ORDER) bucketMap.set(b, { count: 0, totalBrier: 0, sumPredicted: 0, sumActual: 0 });
    for (const e of resolved) {
      const bucket = e.calibrationBucket ?? "unknown";
      if (!bucketMap.has(bucket)) bucketMap.set(bucket, { count: 0, totalBrier: 0, sumPredicted: 0, sumActual: 0 });
      const b = bucketMap.get(bucket)!;
      b.count++;
      b.totalBrier += e.brierScore ?? 0;
      b.sumPredicted += e.forecastProbability;
      b.sumActual += e.actualOutcome ?? 0;
    }
    const calibrationBuckets = Array.from(bucketMap.entries())
      .filter(([, data]) => data.count > 0)
      .map(([bucket, data]) => ({
        bucket,
        count: data.count,
        meanPredicted: Number((data.sumPredicted / data.count).toFixed(4)),
        meanActual: Number((data.sumActual / data.count).toFixed(4)),
        gap: Number(((data.sumPredicted / data.count) - (data.sumActual / data.count)).toFixed(4)),
        meanBrier: Number((data.totalBrier / data.count).toFixed(4)),
      }))
      .sort((a, b) => BUCKET_ORDER.indexOf(a.bucket) - BUCKET_ORDER.indexOf(b.bucket));

    const biasPatterns: { pattern: string; count: number; description: string; entries: string[] }[] = [];
    const patternChecks = [
      {
        id: "high_concentration_miss",
        desc: "High concentration penalty + forecast miss",
        test: (e: typeof resolved[0]) => (e.concentrationPenalty ?? 0) > 0.05 && (e.predictionError ?? 0) > 0.15,
      },
      {
        id: "low_diversity_miss",
        desc: "Low evidence diversity + forecast miss",
        test: (e: typeof resolved[0]) => (e.evidenceDiversityScore ?? 1) < 0.4 && (e.predictionError ?? 0) > 0.15,
      },
      {
        id: "high_fragility_miss",
        desc: "High fragility score + forecast miss",
        test: (e: typeof resolved[0]) => (e.posteriorFragilityScore ?? 0) > 0.3 && (e.predictionError ?? 0) > 0.15,
      },
      {
        id: "false_confidence",
        desc: "High confidence forecast that resolved incorrectly",
        test: (e: typeof resolved[0]) => e.forecastProbability > 0.8 && (e.actualOutcome ?? 0) < 0.3,
      },
      {
        id: "false_low_confidence",
        desc: "Low confidence forecast that resolved positively",
        test: (e: typeof resolved[0]) => e.forecastProbability < 0.3 && (e.actualOutcome ?? 0) > 0.7,
      },
      {
        id: "ceiling_constrained_success",
        desc: "Confidence ceiling applied but outcome was positive",
        test: (e: typeof resolved[0]) => (e.confidenceCeilingApplied ?? 1) < 0.9 && (e.actualOutcome ?? 0) > 0.8,
      },
      {
        id: "overconfidence_general",
        desc: "Systematic overconfidence (predicted > actual by 15+pp)",
        test: (e: typeof resolved[0]) => e.forecastProbability - (e.actualOutcome ?? 0) > 0.15,
      },
      {
        id: "underconfidence_general",
        desc: "Systematic underconfidence (actual > predicted by 15+pp)",
        test: (e: typeof resolved[0]) => (e.actualOutcome ?? 0) - e.forecastProbability > 0.15,
      },
    ];

    for (const check of patternChecks) {
      const matches = resolved.filter(check.test);
      biasPatterns.push({
        pattern: check.id,
        count: matches.length,
        description: check.desc,
        entries: matches.map(m => m.predictionId),
      });
    }

    const domainMap = new Map<string, { total: number; resolved: number; totalBrier: number; totalError: number; open: number }>();
    for (const e of filtered) {
      const d = e.decisionDomain || "Unspecified";
      if (!domainMap.has(d)) domainMap.set(d, { total: 0, resolved: 0, totalBrier: 0, totalError: 0, open: 0 });
      const dm = domainMap.get(d)!;
      dm.total++;
      if (e.resolutionStatus === "open") dm.open++;
      if (e.brierScore != null) {
        dm.resolved++;
        dm.totalBrier += e.brierScore;
        dm.totalError += e.predictionError ?? 0;
      }
    }
    const domainBreakdowns = Array.from(domainMap.entries()).map(([d, data]) => ({
      domain: d,
      totalForecasts: data.total,
      resolvedCount: data.resolved,
      openCount: data.open,
      meanBrier: data.resolved > 0 ? Number((data.totalBrier / data.resolved).toFixed(4)) : null,
      meanError: data.resolved > 0 ? Number((data.totalError / data.resolved).toFixed(4)) : null,
    })).sort((a, b) => b.totalForecasts - a.totalForecasts);

    let referenceCaseLinkage: any = { mostMatchedPatterns: [], missCorrelations: [], recurringLessons: [] };
    try {
      const refCases = await db.select().from(referenceCasesTable);
      const tagCounts = new Map<string, number>();
      const biasCounts = new Map<string, { total: number; missCount: number }>();
      const lessons: string[] = [];

      for (const rc of refCases) {
        const tags: string[] = rc.structuralTags ? JSON.parse(rc.structuralTags) : [];
        for (const t of tags) {
          tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
        }
        if (rc.biasPattern) {
          if (!biasCounts.has(rc.biasPattern)) biasCounts.set(rc.biasPattern, { total: 0, missCount: 0 });
          const bc = biasCounts.get(rc.biasPattern)!;
          bc.total++;
          if (rc.brierScore != null && rc.brierScore > 0.15) bc.missCount++;
        }
        if (rc.calibrationLesson) lessons.push(rc.calibrationLesson);
      }

      referenceCaseLinkage = {
        totalReferenceCases: refCases.length,
        mostMatchedPatterns: Array.from(tagCounts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        missCorrelations: Array.from(biasCounts.entries())
          .map(([pattern, data]) => ({ pattern, total: data.total, missCount: data.missCount }))
          .sort((a, b) => b.missCount - a.missCount),
        recurringLessons: lessons.slice(0, 8),
        informationalOnly: true,
      };
    } catch (err) {
      console.error("Reference case linkage error:", err);
    }

    const domains = [...new Set(allEntries.map(e => e.decisionDomain).filter(Boolean))] as string[];

    res.json({
      coreMetrics: {
        totalForecasts: filtered.length,
        resolvedForecasts: resolved.length,
        openForecasts: open.length,
        meanBrierScore: meanBrier,
        medianBrierScore: medianBrier,
        overconfidenceRate,
        underconfidenceRate,
        meanAbsoluteError: meanAbsError,
        forecastRevisionCount: totalRevisions,
        revisionImprovementRate,
      },
      calibrationBuckets,
      biasPatterns,
      domainBreakdowns,
      revisionAnalysis,
      referenceCaseLinkage,
      resolvedEntries: resolved.map(e => ({
        predictionId: e.predictionId,
        caseId: e.caseId,
        strategicQuestion: e.strategicQuestion,
        forecastProbability: e.forecastProbability,
        actualOutcome: e.actualOutcome,
        brierScore: e.brierScore,
        predictionError: e.predictionError,
        calibrationBucket: e.calibrationBucket,
        decisionDomain: e.decisionDomain,
        evidenceDiversityScore: e.evidenceDiversityScore,
        posteriorFragilityScore: e.posteriorFragilityScore,
        concentrationPenalty: e.concentrationPenalty,
        confidenceCeilingApplied: e.confidenceCeilingApplied,
        forecastDate: e.forecastDate,
        resolutionStatus: e.resolutionStatus,
        updateVersion: e.updateVersion,
      })),
      availableFilters: {
        domains,
        statuses: ["open", "resolved_true", "resolved_false", "partially_resolved", "not_resolvable"],
        biasPatternTypes: patternChecks.map(p => p.id),
      },
    });
  } catch (err) {
    console.error("Dashboard aggregation error:", err);
    res.status(500).json({ error: "Failed to compute dashboard metrics" });
  }
});

router.get("/forecast-ledger/entry/:predictionId", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(rows[0]);
});

router.get("/forecast-ledger/:predictionId", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(rows[0]);
});

router.get("/cases/:caseId/forecast-ledger", async (req, res) => {
  const entries = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, req.params.caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion));
  res.json(entries);
});

router.get("/cases/:caseId/forecast-ledger/latest", async (req, res) => {
  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, req.params.caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "No ledger entries for this case" });
  res.json(rows[0]);
});

router.post("/cases/:caseId/record-forecast", async (req, res) => {
  const { caseId } = req.params;
  const { timeHorizon, expectedResolutionDate, rationale, comparisonGroups } = req.body as {
    timeHorizon?: string;
    expectedResolutionDate?: string;
    rationale?: string;
    comparisonGroups?: string[];
  };

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  if (caseData.currentProbability == null) {
    return res.status(400).json({ error: "No forecast available for this case. Run a forecast first." });
  }

  const prevVersionRows = await db.select({ updateVersion: forecastLedgerTable.updateVersion, predictionId: forecastLedgerTable.predictionId })
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.caseId, caseId))
    .orderBy(desc(forecastLedgerTable.updateVersion))
    .limit(1);
  const nextVersion = (prevVersionRows[0]?.updateVersion ?? 0) + 1;
  const previousPredictionId = prevVersionRows[0]?.predictionId ?? null;

  const predictionId = `PRED-${Date.now()}`;
  const forecastProbability = caseData.currentProbability;
  const bucket = computeCalibrationBucket(forecastProbability);

  let depMetrics: {
    evidenceDiversityScore: number | null;
    posteriorFragilityScore: number | null;
    concentrationPenalty: number | null;
    confidenceCeilingApplied: number | null;
    confidenceCeilingReason: string | null;
    independentEvidenceFamilyCount: number | null;
    rawSignalCount: number | null;
    compressedSignalCount: number | null;
    keyDriversSummary: string | null;
    counterSignalsSummary: string | null;
    topLineageClusters: string | null;
    environmentAdjustments: string | null;
    snapshotJson: string | null;
  } = {
    evidenceDiversityScore: null,
    posteriorFragilityScore: null,
    concentrationPenalty: null,
    confidenceCeilingApplied: null,
    confidenceCeilingReason: null,
    independentEvidenceFamilyCount: null,
    rawSignalCount: null,
    compressedSignalCount: null,
    keyDriversSummary: null,
    counterSignalsSummary: null,
    topLineageClusters: null,
    environmentAdjustments: null,
    snapshotJson: null,
  };

  try {
    const signals = await db.select().from(signalsTable).where(
      and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
    );

    if (signals.length > 0) {
      const priorProb = caseData.priorProbability ?? 0.3;
      const analysis = runDependencyAnalysis(signals);
      const comparison = computeNaiveVsCompressed(signals, analysis, priorProb);

      depMetrics.evidenceDiversityScore = analysis.metrics.evidenceDiversityScore;
      depMetrics.posteriorFragilityScore = analysis.metrics.posteriorFragilityScore;
      depMetrics.concentrationPenalty = analysis.metrics.concentrationPenalty;
      depMetrics.independentEvidenceFamilyCount = analysis.independentSignals.length;
      depMetrics.rawSignalCount = signals.length;
      depMetrics.compressedSignalCount = analysis.compressedSignals.length;

      if (analysis.confidenceCeiling.maxAllowedProbability < 1) {
        depMetrics.confidenceCeilingApplied = analysis.confidenceCeiling.maxAllowedProbability;
        depMetrics.confidenceCeilingReason = analysis.confidenceCeiling.reason ?? null;
      }

      const positiveSignals = signals
        .filter(s => (s.likelihoodRatio ?? 1) > 1)
        .sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1))
        .slice(0, 5)
        .map(s => ({ desc: s.signalDescription?.slice(0, 120) ?? "", lr: s.likelihoodRatio ?? 1 }));

      const negativeSignals = signals
        .filter(s => (s.likelihoodRatio ?? 1) < 1)
        .sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1))
        .slice(0, 5)
        .map(s => ({ desc: s.signalDescription?.slice(0, 120) ?? "", lr: s.likelihoodRatio ?? 1 }));

      depMetrics.keyDriversSummary = JSON.stringify(positiveSignals);
      depMetrics.counterSignalsSummary = JSON.stringify(negativeSignals);

      const clusterSummary = analysis.clusters.map(cl => ({
        rootDesc: cl.rootSignal.signal.signalDescription?.slice(0, 120) ?? "",
        cluster: cl.rootSignal.sourceCluster,
        count: cl.clusterSignalCount,
        compressed: cl.compressedSignalCount,
        echoes: cl.echoCount,
        translations: cl.translationCount,
      }));
      depMetrics.topLineageClusters = JSON.stringify(clusterSummary);

      depMetrics.snapshotJson = JSON.stringify({
        metrics: analysis.metrics,
        confidenceCeiling: analysis.confidenceCeiling,
        warnings: analysis.warnings,
        comparison,
        clusterCount: analysis.clusters.length,
        independentCount: analysis.independentSignals.length,
      });
    }
  } catch (err) {
    console.error("Failed to capture dependency metrics for ledger entry:", err);
  }

  const [entry] = await db.insert(forecastLedgerTable).values({
    id: randomUUID(),
    predictionId,
    caseId,
    strategicQuestion: caseData.strategicQuestion ?? "Unspecified question",
    decisionDomain: caseData.therapeuticArea ?? null,
    comparisonGroups: comparisonGroups?.length ? JSON.stringify(comparisonGroups) : null,
    forecastProbability,
    forecastDate: new Date(),
    timeHorizon: timeHorizon || caseData.timeHorizon || "12 months",
    expectedResolutionDate: expectedResolutionDate ? new Date(expectedResolutionDate) : null,
    priorProbability: caseData.priorProbability,
    confidenceLevel: caseData.confidenceLevel,
    ...depMetrics,
    updateVersion: nextVersion,
    previousPredictionId,
    updateRationale: rationale || (nextVersion === 1 ? "Initial forecast" : null),
    resolutionStatus: "open",
    calibrationBucket: bucket,
  }).returning();

  res.status(201).json(entry);
});

router.patch("/forecast-ledger/:predictionId/resolve", async (req, res) => {
  const { predictionId } = req.params;
  const { resolutionStatus, resolvedOutcome, resolutionDate } = req.body as {
    resolutionStatus: string;
    resolvedOutcome?: number;
    resolutionDate?: string;
  };

  const validStatuses = ["resolved_true", "resolved_false", "partially_resolved", "not_resolvable"];
  if (!validStatuses.includes(resolutionStatus)) {
    return res.status(400).json({ error: `resolutionStatus must be one of: ${validStatuses.join(", ")}` });
  }

  if (resolutionStatus === "partially_resolved") {
    if (resolvedOutcome === undefined || resolvedOutcome === null) {
      return res.status(400).json({ error: "resolvedOutcome is required for partially_resolved status" });
    }
    const num = Number(resolvedOutcome);
    if (!Number.isFinite(num) || num < 0 || num > 1) {
      return res.status(400).json({ error: "resolvedOutcome must be a finite number between 0 and 1" });
    }
  }

  const rows = await db
    .select()
    .from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Ledger entry not found" });

  const entry = rows[0];

  let actualOutcome: number | null = null;
  if (resolutionStatus === "resolved_true") actualOutcome = 1;
  else if (resolutionStatus === "resolved_false") actualOutcome = 0;
  else if (resolutionStatus === "partially_resolved") actualOutcome = Number(resolvedOutcome);

  let brierScore: number | null = null;
  let predictionError: number | null = null;
  if (actualOutcome !== null) {
    brierScore = computeBrierScore(entry.forecastProbability, actualOutcome);
    predictionError = Number(Math.abs(entry.forecastProbability - actualOutcome).toFixed(6));
  }

  const [updated] = await db
    .update(forecastLedgerTable)
    .set({
      resolutionStatus,
      resolvedOutcome: actualOutcome,
      actualOutcome,
      resolutionDate: resolutionDate ? new Date(resolutionDate) : new Date(),
      brierScore,
      predictionError,
      updatedAt: new Date(),
    })
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .returning();

  res.json(updated);
});

router.patch("/forecast-ledger/:predictionId/rationale", async (req, res) => {
  const { predictionId } = req.params;
  const { rationale } = req.body as { rationale: string };

  if (!rationale || rationale.trim().length === 0) {
    return res.status(400).json({ error: "Rationale is required" });
  }

  const [updated] = await db
    .update(forecastLedgerTable)
    .set({ updateRationale: rationale.trim(), updatedAt: new Date() })
    .where(eq(forecastLedgerTable.predictionId, predictionId))
    .returning();

  if (!updated) return res.status(404).json({ error: "Ledger entry not found" });
  res.json(updated);
});

router.get("/forecast-ledger/calibration/summary", async (_req, res) => {
  const allResolved = await db
    .select()
    .from(forecastLedgerTable)
    .where(isNotNull(forecastLedgerTable.brierScore));

  if (allResolved.length === 0) {
    return res.json({
      totalResolved: 0,
      meanBrierScore: null,
      calibrationBuckets: [],
    });
  }

  const meanBrier = allResolved.reduce((sum, e) => sum + (e.brierScore ?? 0), 0) / allResolved.length;

  const bucketMap = new Map<string, { count: number; totalBrier: number; sumPredicted: number; sumActual: number }>();
  for (const e of allResolved) {
    const bucket = e.calibrationBucket ?? "unknown";
    if (!bucketMap.has(bucket)) bucketMap.set(bucket, { count: 0, totalBrier: 0, sumPredicted: 0, sumActual: 0 });
    const b = bucketMap.get(bucket)!;
    b.count++;
    b.totalBrier += e.brierScore ?? 0;
    b.sumPredicted += e.forecastProbability;
    b.sumActual += e.actualOutcome ?? 0;
  }

  const calibrationBuckets = Array.from(bucketMap.entries()).map(([bucket, data]) => ({
    bucket,
    count: data.count,
    meanBrierScore: Number((data.totalBrier / data.count).toFixed(4)),
    meanPredicted: Number((data.sumPredicted / data.count).toFixed(4)),
    meanActual: Number((data.sumActual / data.count).toFixed(4)),
  })).sort((a, b) => a.bucket.localeCompare(b.bucket));

  res.json({
    totalResolved: allResolved.length,
    meanBrierScore: Number(meanBrier.toFixed(4)),
    calibrationBuckets,
  });
});

router.get("/cases/:caseId/forecast-ledger/calibration", async (req, res) => {
  const resolved = await db
    .select()
    .from(forecastLedgerTable)
    .where(and(
      eq(forecastLedgerTable.caseId, req.params.caseId),
      isNotNull(forecastLedgerTable.brierScore)
    ));

  if (resolved.length === 0) {
    return res.json({ totalResolved: 0, meanBrierScore: null });
  }

  const meanBrier = resolved.reduce((sum, e) => sum + (e.brierScore ?? 0), 0) / resolved.length;
  res.json({
    totalResolved: resolved.length,
    meanBrierScore: Number(meanBrier.toFixed(4)),
  });
});

export default router;
