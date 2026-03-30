import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable, casesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { runDependencyAnalysis, computeNaiveVsCompressed } from "../lib/signal-dependency-engine.js";

const router = Router();

router.get("/cases/:caseId/signal-dependency", async (req, res) => {
  try {
    const { caseId } = req.params;
    const persist = req.query.persist === "true";

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

    if (persist) {
      await persistDependencyTags(analysis, signals);
    }

    const signalLineageMap: Record<string, {
      rootEvidenceId: string;
      sourceCluster: string;
      dependencyRole: string;
      echoVsTranslation: string;
      novelInformationFlag: string;
      lineageConfidence: string;
      compressionFactor: number;
    }> = {};

    for (const cl of analysis.clusters) {
      signalLineageMap[cl.rootSignal.signal.signalId] = {
        rootEvidenceId: cl.rootEvidenceId,
        sourceCluster: cl.rootSignal.sourceCluster,
        dependencyRole: cl.rootSignal.dependencyRole,
        echoVsTranslation: cl.rootSignal.echoVsTranslation,
        novelInformationFlag: cl.rootSignal.novelInformationFlag,
        lineageConfidence: cl.rootSignal.lineageConfidence,
        compressionFactor: 1,
      };
      for (const d of cl.descendants) {
        const compressed = analysis.compressedSignals.find(c => c.originalSignalId === d.signal.id);
        signalLineageMap[d.signal.signalId] = {
          rootEvidenceId: cl.rootEvidenceId,
          sourceCluster: d.sourceCluster,
          dependencyRole: d.dependencyRole,
          echoVsTranslation: d.echoVsTranslation,
          novelInformationFlag: d.novelInformationFlag,
          lineageConfidence: d.lineageConfidence,
          compressionFactor: compressed?.compressionFactor ?? 1,
        };
      }
    }

    for (const ind of analysis.independentSignals) {
      signalLineageMap[ind.signal.signalId] = {
        rootEvidenceId: ind.rootEvidenceId,
        sourceCluster: ind.sourceCluster,
        dependencyRole: ind.dependencyRole,
        echoVsTranslation: ind.echoVsTranslation,
        novelInformationFlag: ind.novelInformationFlag,
        lineageConfidence: ind.lineageConfidence,
        compressionFactor: 1,
      };
    }

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
      signalLineageMap,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze signal dependency";
    res.status(500).json({ error: message });
  }
});

router.patch("/cases/:caseId/signals/:signalId/lineage", async (req, res) => {
  try {
    const { caseId, signalId } = req.params;
    const { rootEvidenceId, dependencyRole, sourceCluster, echoVsTranslation, novelInformationFlag, lineageConfidence } = req.body;

    const existing = await db.select().from(signalsTable).where(
      and(eq(signalsTable.caseId, caseId), eq(signalsTable.signalId, signalId))
    ).limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: "Signal not found" });
      return;
    }

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (rootEvidenceId !== undefined) updates.rootEvidenceId = rootEvidenceId;
    if (dependencyRole !== undefined) updates.dependencyRole = dependencyRole;
    if (sourceCluster !== undefined) updates.sourceCluster = sourceCluster;
    if (echoVsTranslation !== undefined) updates.echoVsTranslation = echoVsTranslation;
    if (novelInformationFlag !== undefined) updates.novelInformationFlag = novelInformationFlag;
    if (lineageConfidence !== undefined) updates.lineageConfidence = lineageConfidence;

    await db.update(signalsTable).set(updates).where(eq(signalsTable.id, existing[0].id));

    res.json({ ok: true, signalId, updated: Object.keys(updates).filter(k => k !== "updatedAt") });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update lineage";
    res.status(500).json({ error: message });
  }
});

async function persistDependencyTags(
  analysis: ReturnType<typeof runDependencyAnalysis>,
  _signals: typeof signalsTable.$inferSelect[]
) {
  const updates: Array<{ id: string; rootEvidenceId: string; sourceCluster: string; dependencyRole: string; echoVsTranslation: string; novelInformationFlag: string; lineageConfidence: string }> = [];

  for (const cl of analysis.clusters) {
    updates.push({
      id: cl.rootSignal.signal.id,
      rootEvidenceId: cl.rootEvidenceId,
      sourceCluster: cl.rootSignal.sourceCluster,
      dependencyRole: cl.rootSignal.dependencyRole,
      echoVsTranslation: cl.rootSignal.echoVsTranslation,
      novelInformationFlag: cl.rootSignal.novelInformationFlag,
      lineageConfidence: cl.rootSignal.lineageConfidence,
    });
    for (const d of cl.descendants) {
      updates.push({
        id: d.signal.id,
        rootEvidenceId: cl.rootEvidenceId,
        sourceCluster: d.sourceCluster,
        dependencyRole: d.dependencyRole,
        echoVsTranslation: d.echoVsTranslation,
        novelInformationFlag: d.novelInformationFlag,
        lineageConfidence: d.lineageConfidence,
      });
    }
  }

  for (const ind of analysis.independentSignals) {
    updates.push({
      id: ind.signal.id,
      rootEvidenceId: ind.rootEvidenceId,
      sourceCluster: ind.sourceCluster,
      dependencyRole: ind.dependencyRole,
      echoVsTranslation: ind.echoVsTranslation,
      novelInformationFlag: ind.novelInformationFlag,
      lineageConfidence: ind.lineageConfidence,
    });
  }

  for (const u of updates) {
    try {
      await db.update(signalsTable).set({
        rootEvidenceId: u.rootEvidenceId,
        sourceCluster: u.sourceCluster,
        dependencyRole: u.dependencyRole,
        echoVsTranslation: u.echoVsTranslation,
        novelInformationFlag: u.novelInformationFlag,
        lineageConfidence: u.lineageConfidence,
        updatedAt: new Date(),
      }).where(eq(signalsTable.id, u.id));
    } catch (err) {
      console.error(`[persist-lineage] Failed to update signal ${u.id}:`, err);
    }
  }
}

export default router;
