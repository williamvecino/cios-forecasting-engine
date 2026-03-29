import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";

const router = Router();

router.get("/cases/:caseId/signal-dependency", async (req, res) => {
  try {
    const { caseId } = req.params;

    const signals = await db.select().from(signalsTable).where(
      and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active"))
    );

    const analysis = runDependencyAnalysis(signals);

    const clusters = analysis.clusters.map((cl) => ({
      rootEvidenceId: cl.rootEvidenceId,
      rootSignalDescription: cl.rootSignal.signal.signalDescription?.slice(0, 120),
      rootSignalType: cl.rootSignal.signal.signalType,
      rootSourceCluster: cl.rootSignal.sourceCluster,
      clusterSignalCount: cl.clusterSignalCount,
      compressedSignalCount: cl.compressedSignalCount,
      echoCount: cl.echoCount,
      translationCount: cl.translationCount,
      descendants: cl.descendants.map((d) => ({
        signalId: d.signal.signalId,
        description: d.signal.signalDescription?.slice(0, 120),
        dependencyRole: d.dependencyRole,
        echoVsTranslation: d.echoVsTranslation,
        novelInformationFlag: d.novelInformationFlag,
        lineageConfidence: d.lineageConfidence,
        compressionFactor: analysis.compressedSignals.find(
          (c) => c.originalSignalId === d.signal.id
        )?.compressionFactor ?? 1,
      })),
    }));

    const independentFamilies = analysis.independentSignals.map((s) => ({
      signalId: s.signal.signalId,
      description: s.signal.signalDescription?.slice(0, 120),
      sourceCluster: s.sourceCluster,
      signalType: s.signal.signalType,
    }));

    res.json({
      ok: true,
      caseId,
      signalCount: signals.length,
      clusters,
      independentFamilies,
      metrics: analysis.metrics,
      warnings: analysis.warnings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze signal dependency";
    res.status(500).json({ error: message });
  }
});

export default router;
