import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable, casesTable } from "@workspace/db";
import { eq, and, inArray, ne } from "drizzle-orm";
import { runDependencyAnalysis, computeNaiveVsCompressed } from "../lib/signal-dependency-engine.js";

const router = Router();

router.get("/cases/:caseId/signal-dependency", async (req, res) => {
  try {
    const { caseId } = req.params;

    const signals = await db.select().from(signalsTable).where(
      and(
        eq(signalsTable.caseId, caseId),
        inArray(signalsTable.status, ["active", "candidate", "reviewed", "validated"])
      )
    );

    const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
    const priorProbability = caseRow[0]?.priorProbability ?? 0.3;

    const analysis = runDependencyAnalysis(signals);
    const comparison = computeNaiveVsCompressed(signals, analysis, priorProbability);

    const clusters = analysis.clusters.map((cl) => ({
      rootEvidenceId: cl.rootEvidenceId,
      rootSignalDescription: cl.rootSignal.signal.signalDescription?.slice(0, 120),
      rootSignalType: cl.rootSignal.signal.signalType,
      rootSourceCluster: cl.rootSignal.sourceCluster,
      rootLikelihoodRatio: cl.rootSignal.signal.likelihoodRatio,
      clusterSignalCount: cl.clusterSignalCount,
      compressedSignalCount: cl.compressedSignalCount,
      echoCount: cl.echoCount,
      translationCount: cl.translationCount,
      descendants: cl.descendants.map((d) => ({
        signalId: d.signal.signalId,
        description: d.signal.signalDescription?.slice(0, 120),
        signalType: d.signal.signalType,
        sourceCluster: d.sourceCluster,
        dependencyRole: d.dependencyRole,
        echoVsTranslation: d.echoVsTranslation,
        novelInformationFlag: d.novelInformationFlag,
        lineageConfidence: d.lineageConfidence,
        rawLikelihoodRatio: d.signal.likelihoodRatio,
        compressionFactor: analysis.compressedSignals.find(
          (c) => c.originalSignalId === d.signal.id
        )?.compressionFactor ?? 1,
        compressedLikelihoodRatio: analysis.compressedSignals.find(
          (c) => c.originalSignalId === d.signal.id
        )?.compressedLikelihoodRatio ?? d.signal.likelihoodRatio,
      })),
    }));

    const independentFamilies = analysis.independentSignals.map((s) => ({
      signalId: s.signal.signalId,
      description: s.signal.signalDescription?.slice(0, 120),
      sourceCluster: s.sourceCluster,
      signalType: s.signal.signalType,
      likelihoodRatio: s.signal.likelihoodRatio,
    }));

    res.json({
      ok: true,
      caseId,
      signalCount: signals.length,
      priorProbability,
      clusters,
      independentFamilies,
      metrics: analysis.metrics,
      warnings: analysis.warnings,
      confidenceCeiling: analysis.confidenceCeiling,
      comparison,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze signal dependency";
    res.status(500).json({ error: message });
  }
});

export default router;
