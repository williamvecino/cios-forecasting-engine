import { Router } from "express";
import { db, growthFeasibilityTable, casesTable, signalsTable, adoptionSegmentsTable, barrierDiagnosisTable, readinessTimelineTable, competitiveRiskTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";

const router = Router();

type FeasibilityTier = "high_growth" | "moderate_growth" | "constrained_growth" | "blocked" | "monitor_only";

interface FeasibilityInput {
  adoptionLikelihood: number;
  barrierLoad: number;
  readinessScore: number;
  competitiveRiskLoad: number;
  structuralBarrierCount: number;
  removableBarrierCount: number;
  blockedMilestoneCount: number;
  readyMilestoneCount: number;
  nearTermReadiness: number;
  segmentName?: string;
  segmentType?: string;
  upwardLevers: string[];
  movementBlockers: string[];
  barrierNames: string[];
  readyMilestones: string[];
  blockedMilestones: string[];
  competitiveThreats: string[];
  priorityTier?: string;
  isInherited?: boolean;
  segmentSpecificBarrierCount?: number;
  totalBarrierCount?: number;
}

function computeFeasibilityScore(input: FeasibilityInput): number {
  const adoptionWeight = 0.30;
  const barrierWeight = 0.25;
  const readinessWeight = 0.25;
  const competitiveWeight = 0.20;

  const adoptionComponent = input.adoptionLikelihood * adoptionWeight;
  const barrierComponent = (1 - Math.min(input.barrierLoad, 1)) * barrierWeight;
  const readinessComponent = input.readinessScore * readinessWeight;
  const competitiveComponent = (1 - Math.min(input.competitiveRiskLoad, 1)) * competitiveWeight;

  let raw = adoptionComponent + barrierComponent + readinessComponent + competitiveComponent;

  const structPenalty = input.isInherited
    ? Math.min(input.structuralBarrierCount, 2) * 0.5
    : input.structuralBarrierCount;

  if (structPenalty >= 2) {
    raw *= 0.7;
  } else if (structPenalty >= 1) {
    raw *= 0.85;
  }

  const blockedPenalty = input.isInherited
    ? Math.floor(input.blockedMilestoneCount * 0.5)
    : input.blockedMilestoneCount;

  if (blockedPenalty >= 3) {
    raw *= 0.75;
  }

  return Math.max(0, Math.min(1, raw));
}

function classifyTier(score: number, input: FeasibilityInput): FeasibilityTier {
  const effectiveStructural = input.isInherited
    ? Math.min(input.structuralBarrierCount, 2) * 0.5
    : input.structuralBarrierCount;
  const effectiveBlocked = input.isInherited
    ? Math.floor(input.blockedMilestoneCount * 0.5)
    : input.blockedMilestoneCount;

  if (score >= 0.65 && effectiveStructural < 1 && effectiveBlocked <= 1) {
    return "high_growth";
  }
  if (score >= 0.45 && effectiveStructural <= 1) {
    return "moderate_growth";
  }
  if (score >= 0.25) {
    if (effectiveStructural >= 2 && input.adoptionLikelihood < 0.5) {
      return "blocked";
    }
    if (effectiveBlocked >= 3 && input.readinessScore < 0.4) {
      return "blocked";
    }
    return "constrained_growth";
  }
  if (input.adoptionLikelihood < 0.25 && input.readinessScore < 0.3) {
    return "monitor_only";
  }
  if (score < 0.15) {
    return "monitor_only";
  }
  return "blocked";
}

function computeNearTermPotential(input: FeasibilityInput): number {
  let near = input.adoptionLikelihood * 0.4 + input.nearTermReadiness * 0.3 + (1 - input.barrierLoad) * 0.3;

  const effectiveBlocked = input.isInherited
    ? Math.floor(input.blockedMilestoneCount * 0.5)
    : input.blockedMilestoneCount;
  const effectiveStructural = input.isInherited
    ? Math.min(input.structuralBarrierCount, 2) * 0.5
    : input.structuralBarrierCount;

  if (effectiveBlocked >= 2) near *= 0.6;
  if (effectiveStructural >= 1) near *= 0.8;

  return Math.max(0, Math.min(1, near));
}

function computeMediumTermPotential(input: FeasibilityInput): number {
  const totalBarriers = input.removableBarrierCount + input.structuralBarrierCount;
  const removableRatio = totalBarriers > 0
    ? input.removableBarrierCount / totalBarriers
    : 0.5;

  let medium = input.adoptionLikelihood * 0.35 +
    input.readinessScore * 0.25 +
    (1 - input.competitiveRiskLoad) * 0.2 +
    0.2 * removableRatio;

  if (input.removableBarrierCount >= 2) medium *= 1.1;

  return Math.max(0, Math.min(1, medium));
}

function labelPotential(score: number): string {
  if (score >= 0.65) return "Strong";
  if (score >= 0.45) return "Moderate";
  if (score >= 0.25) return "Limited";
  return "Minimal";
}

function deriveUnlocks(input: FeasibilityInput): string[] {
  const unlocks: string[] = [];
  const seen = new Set<string>();

  const addUnique = (text: string) => {
    const key = text.toLowerCase().slice(0, 50);
    if (!seen.has(key)) { seen.add(key); unlocks.push(text); }
  };

  if (input.adoptionLikelihood >= 0.6 && input.barrierLoad > 0.5) {
    addUnique("Reduce barrier load to unlock high-adoption potential");
  }

  if (input.adoptionLikelihood >= 0.6 && input.readinessScore < 0.5) {
    addUnique("Accelerate readiness milestones to capitalize on adoption strength");
  }

  for (const lever of input.upwardLevers.slice(0, 2)) {
    addUnique(lever);
  }

  for (const m of input.blockedMilestones.slice(0, 2)) {
    addUnique(`Resolve blocked milestone: ${m}`);
  }

  if (input.removableBarrierCount > 0) {
    for (const b of input.barrierNames.filter(b => !b.toLowerCase().includes("structural")).slice(0, 1)) {
      const short = b.length > 80 ? b.slice(0, 77) + "..." : b;
      addUnique(`Remove barrier: ${short}`);
    }
  }

  if (input.competitiveRiskLoad > 0.3 && input.adoptionLikelihood > 0.5) {
    addUnique("Strengthen competitive differentiation to protect adoption gains");
  }

  return unlocks.slice(0, 4);
}

function deriveConstraints(input: FeasibilityInput): string[] {
  const constraints: string[] = [];
  const seen = new Set<string>();

  const addUnique = (text: string) => {
    const key = text.toLowerCase().slice(0, 50);
    if (!seen.has(key)) { seen.add(key); constraints.push(text); }
  };

  if (input.structuralBarrierCount > 0 && !input.isInherited) {
    addUnique(`${input.structuralBarrierCount} structural barrier(s) limiting scale`);
  } else if (input.structuralBarrierCount > 0 && input.isInherited) {
    addUnique("System-wide structural barriers constrain this segment");
  }

  if (input.barrierLoad > 0.7) {
    addUnique(`High barrier load (${Math.round(input.barrierLoad * 100)}%) suppressing growth`);
  }

  for (const threat of input.competitiveThreats.slice(0, 2)) {
    const short = threat.length > 60 ? threat.slice(0, 57) + "..." : threat;
    addUnique(`Competitive pressure: ${short}`);
  }

  if (input.blockedMilestoneCount >= 2) {
    addUnique(`${input.blockedMilestoneCount} milestones blocked or delayed`);
  }

  if (input.readinessScore < 0.4 && input.adoptionLikelihood > 0.5) {
    addUnique("Readiness gap: adoption intent exceeds operational readiness");
  }

  if (input.adoptionLikelihood < 0.3) {
    addUnique("Low adoption likelihood limits near-term revenue potential");
  }

  for (const blocker of input.movementBlockers.slice(0, 1)) {
    addUnique(blocker);
  }

  return constraints.slice(0, 4);
}

function buildRationale(input: FeasibilityInput, tier: FeasibilityTier, nearLabel: string, medLabel: string): string {
  const parts: string[] = [];

  if (tier === "high_growth") {
    parts.push("Strong growth feasibility driven by favorable adoption signals, minimal structural barriers, and operational readiness.");
  } else if (tier === "moderate_growth") {
    parts.push("Moderate growth potential with some constraints that need resolution before scaling.");
  } else if (tier === "constrained_growth") {
    parts.push("Growth is possible but constrained by barriers or readiness gaps that limit near-term scaling.");
  } else if (tier === "blocked") {
    parts.push("Growth is currently blocked by structural barriers or widespread readiness gaps.");
  } else {
    parts.push("Insufficient conditions for near-term growth. Monitor for changes in market or readiness conditions.");
  }

  if (nearLabel !== medLabel) {
    parts.push(`Near-term potential is ${nearLabel.toLowerCase()} while medium-term outlook is ${medLabel.toLowerCase()}.`);
  }

  if (input.structuralBarrierCount > 0) {
    parts.push(`${input.structuralBarrierCount} structural barrier(s) constrain scalability.`);
  }

  if (input.readyMilestones.length > 0) {
    parts.push(`Ready milestones: ${input.readyMilestones.slice(0, 2).join(", ")}.`);
  }

  return parts.join(" ");
}

function determineConfidence(signalCount: number, segmentCount: number): string {
  const total = signalCount + segmentCount;
  if (total >= 10) return "High";
  if (total >= 5) return "Moderate";
  return "Low";
}

function determineScalability(input: FeasibilityInput): string {
  if (input.structuralBarrierCount >= 2 || input.blockedMilestoneCount >= 3) return "Low";
  if (input.structuralBarrierCount >= 1 || input.blockedMilestoneCount >= 2) return "Moderate";
  if (input.readinessScore >= 0.6 && input.barrierLoad < 0.3) return "High";
  return "Moderate";
}

function determineRevenueTranslation(input: FeasibilityInput): string {
  const score = input.adoptionLikelihood * 0.5 + (1 - input.competitiveRiskLoad) * 0.3 + input.readinessScore * 0.2;
  if (score >= 0.6) return "High";
  if (score >= 0.35) return "Moderate";
  return "Low";
}

router.get("/growth-feasibility/:caseId", async (req, res) => {
  try {
    const rows = await db.select()
      .from(growthFeasibilityTable)
      .where(eq(growthFeasibilityTable.caseId, req.params.caseId))
      .orderBy(growthFeasibilityTable.priorityRank);

    res.json({ feasibility: rows });
  } catch (err: any) {
    console.error("Growth feasibility fetch error:", err);
    res.status(500).json({ error: "Failed to fetch growth feasibility" });
  }
});

router.post("/growth-feasibility/:caseId/generate", async (req, res) => {
  const caseId = req.params.caseId;

  try {
    let [caseData] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId));
    if (!caseData) {
      [caseData] = await db.select().from(casesTable).where(eq(casesTable.id, caseId));
    }
    if (!caseData) return res.status(404).json({ error: "Case not found" });

    const baseProbability = caseData.currentProbability ?? 0.5;

    const allSignals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));
    const activeSignals = allSignals.filter(s => s.status === "active");

    const segments = await db.select()
      .from(adoptionSegmentsTable)
      .where(eq(adoptionSegmentsTable.caseId, caseId))
      .orderBy(adoptionSegmentsTable.priorityRank);

    const barriers = await db.select()
      .from(barrierDiagnosisTable)
      .where(eq(barrierDiagnosisTable.caseId, caseId));

    const milestones = await db.select()
      .from(readinessTimelineTable)
      .where(eq(readinessTimelineTable.caseId, caseId));

    const risks = await db.select()
      .from(competitiveRiskTable)
      .where(eq(competitiveRiskTable.caseId, caseId));

    let depAnalysis: any = null;
    try {
      if (activeSignals.length > 0) {
        depAnalysis = runDependencyAnalysis(activeSignals as any);
      }
    } catch (e) {
      console.error("Dependency analysis failed during feasibility generation:", e);
    }

    const overallBarriers = barriers.filter(b => !b.segmentId || b.segmentId === "overall");
    const totalBarrierStrength = overallBarriers.reduce((s, b) => s + (b.barrierStrength ?? 0), 0);
    const barrierLoad = overallBarriers.length > 0 ? Math.min(1, totalBarrierStrength / overallBarriers.length) : 0;
    const structuralBarrierCount = overallBarriers.filter(b => b.removalDifficulty === "structural").length;
    const removableBarrierCount = overallBarriers.filter(b => b.removalDifficulty === "feasible" || b.removalDifficulty === "moderate").length;

    const overallMilestones = milestones.filter(m => !m.segmentId);
    const readyMilestones = overallMilestones.filter(m => m.currentStatus === "substantially_ready" || m.currentStatus === "on_track");
    const blockedMilestones = overallMilestones.filter(m => m.currentStatus === "blocked" || m.currentStatus === "blocked_but_unlockable");
    const avgReadiness = overallMilestones.length > 0
      ? overallMilestones.reduce((s, m) => s + (m.readinessScore ?? 0), 0) / overallMilestones.length
      : 0.5;

    const nearTermMilestones = overallMilestones.filter(m =>
      m.expectedTimeWindow === "0-3 months" || m.expectedTimeWindow === "3-6 months"
    );
    const nearTermReadiness = nearTermMilestones.length > 0
      ? nearTermMilestones.reduce((s, m) => s + (m.readinessScore ?? 0), 0) / nearTermMilestones.length
      : avgReadiness * 0.8;

    const overallRisks = risks.filter(r => !r.segmentId);
    const competitiveRiskLoad = overallRisks.length > 0
      ? Math.min(1, overallRisks.reduce((s, r) => s + (r.riskStrength ?? 0), 0) / overallRisks.length)
      : 0;

    const overallInput: FeasibilityInput = {
      adoptionLikelihood: baseProbability,
      barrierLoad,
      readinessScore: avgReadiness,
      competitiveRiskLoad,
      structuralBarrierCount,
      removableBarrierCount,
      blockedMilestoneCount: blockedMilestones.length,
      readyMilestoneCount: readyMilestones.length,
      nearTermReadiness,
      upwardLevers: [],
      movementBlockers: [],
      barrierNames: overallBarriers.map(b => b.barrierName ?? "Unknown"),
      readyMilestones: readyMilestones.map(m => m.milestoneName ?? ""),
      blockedMilestones: blockedMilestones.map(m => m.milestoneName ?? ""),
      competitiveThreats: overallRisks.slice(0, 3).map(r => r.riskName ?? ""),
    };

    const overallScore = computeFeasibilityScore(overallInput);
    const overallTier = classifyTier(overallScore, overallInput);
    const overallNearTerm = computeNearTermPotential(overallInput);
    const overallMediumTerm = computeMediumTermPotential(overallInput);
    const overallNearLabel = labelPotential(overallNearTerm);
    const overallMedLabel = labelPotential(overallMediumTerm);

    const allRows: any[] = [];

    const overallId = `GF-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}-overall`;
    allRows.push({
      id: overallId,
      feasibilityId: overallId,
      caseId,
      scope: "overall",
      segmentName: null,
      segmentType: null,
      feasibilityScore: Number(overallScore.toFixed(3)),
      feasibilityTier: overallTier,
      nearTermPotential: Number(overallNearTerm.toFixed(3)),
      nearTermLabel: overallNearLabel,
      mediumTermPotential: Number(overallMediumTerm.toFixed(3)),
      mediumTermLabel: overallMedLabel,
      topUnlocks: JSON.stringify(deriveUnlocks(overallInput)),
      topConstraints: JSON.stringify(deriveConstraints(overallInput)),
      adoptionLikelihood: baseProbability,
      barrierLoad: Number(barrierLoad.toFixed(3)),
      readinessScore: Number(avgReadiness.toFixed(3)),
      competitiveRiskLoad: Number(competitiveRiskLoad.toFixed(3)),
      scalabilityRating: determineScalability(overallInput),
      revenueTranslation: determineRevenueTranslation(overallInput),
      rationale: buildRationale(overallInput, overallTier, overallNearLabel, overallMedLabel),
      confidenceLevel: determineConfidence(activeSignals.length, segments.length),
      priorityRank: 0,
      derivedFrom: JSON.stringify({
        signalCount: activeSignals.length,
        segmentCount: segments.length,
        barrierCount: overallBarriers.length,
        milestoneCount: overallMilestones.length,
        riskCount: overallRisks.length,
        dependencyDiversity: depAnalysis?.metrics?.evidenceDiversityScore ?? null,
      }),
    });

    const segmentResults: Array<{ name: string; score: number; tier: FeasibilityTier; rank: number }> = [];

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const segAdoption = seg.adoptionLikelihood ?? baseProbability;
      const segName = seg.segmentName ?? `Segment ${i + 1}`;
      const segType = seg.segmentType ?? "unknown";

      const segBarriers = barriers.filter(b => b.segmentId === seg.segmentId || b.segmentName === segName);
      const segMilestones = milestones.filter(m => m.segmentId === seg.segmentId || m.segmentName === segName);
      const segRisks = risks.filter(r => r.segmentId === seg.segmentId || r.segmentName === segName);

      const hasOwnBarriers = segBarriers.length > 0;
      const hasOwnMilestones = segMilestones.length > 0;
      const hasOwnRisks = segRisks.length > 0;

      const effectiveBarriers = hasOwnBarriers ? segBarriers : overallBarriers;
      const effectiveMilestones = hasOwnMilestones ? segMilestones : overallMilestones;
      const effectiveRisks = hasOwnRisks ? segRisks : overallRisks;

      const segBarrierLoad = effectiveBarriers.length > 0
        ? Math.min(1, effectiveBarriers.reduce((s, b) => s + (b.barrierStrength ?? 0), 0) / effectiveBarriers.length)
        : barrierLoad;

      const barrierIsInherited = !hasOwnBarriers && overallBarriers.length > 0;
      const milestoneIsInherited = !hasOwnMilestones && overallMilestones.length > 0;
      const isInherited = barrierIsInherited || milestoneIsInherited;

      const segStructural = effectiveBarriers.filter(b => b.removalDifficulty === "structural").length;
      const segRemovable = effectiveBarriers.filter(b => b.removalDifficulty === "feasible" || b.removalDifficulty === "moderate").length;
      const segReady = effectiveMilestones.filter(m => m.currentStatus === "substantially_ready" || m.currentStatus === "on_track");
      const segBlocked = effectiveMilestones.filter(m => m.currentStatus === "blocked" || m.currentStatus === "blocked_but_unlockable");
      const segAvgReadiness = effectiveMilestones.length > 0
        ? effectiveMilestones.reduce((s, m) => s + (m.readinessScore ?? 0), 0) / effectiveMilestones.length
        : avgReadiness;
      const segCompRisk = effectiveRisks.length > 0
        ? Math.min(1, effectiveRisks.reduce((s, r) => s + (r.riskStrength ?? 0), 0) / effectiveRisks.length)
        : competitiveRiskLoad;

      const segNearTermMilestones = effectiveMilestones.filter(m =>
        m.expectedTimeWindow === "0-3 months" || m.expectedTimeWindow === "3-6 months"
      );
      const segNearTermReadiness = segNearTermMilestones.length > 0
        ? segNearTermMilestones.reduce((s, m) => s + (m.readinessScore ?? 0), 0) / segNearTermMilestones.length
        : segAvgReadiness * 0.8;

      let segUpwardLevers: string[] = [];
      let segMovementBlockers: string[] = [];
      try {
        segUpwardLevers = JSON.parse(seg.upwardLevers ?? "[]");
        segMovementBlockers = JSON.parse(seg.movementBlockers ?? "[]");
      } catch {}

      const segInput: FeasibilityInput = {
        adoptionLikelihood: segAdoption,
        barrierLoad: segBarrierLoad,
        readinessScore: segAvgReadiness,
        competitiveRiskLoad: segCompRisk,
        structuralBarrierCount: segStructural,
        removableBarrierCount: segRemovable,
        blockedMilestoneCount: segBlocked.length,
        readyMilestoneCount: segReady.length,
        nearTermReadiness: segNearTermReadiness,
        segmentName: segName,
        segmentType: segType,
        upwardLevers: segUpwardLevers,
        movementBlockers: segMovementBlockers,
        barrierNames: effectiveBarriers.map(b => b.barrierName ?? "Unknown"),
        readyMilestones: segReady.map(m => m.milestoneName ?? ""),
        blockedMilestones: segBlocked.map(m => m.milestoneName ?? ""),
        competitiveThreats: effectiveRisks.slice(0, 2).map(r => r.riskName ?? ""),
        priorityTier: seg.priorityTier ?? undefined,
        isInherited,
        segmentSpecificBarrierCount: segBarriers.length,
        totalBarrierCount: effectiveBarriers.length,
      };

      const segScore = computeFeasibilityScore(segInput);
      const segTier = classifyTier(segScore, segInput);
      const segNearTerm = computeNearTermPotential(segInput);
      const segMediumTerm = computeMediumTermPotential(segInput);
      const segNearLabel = labelPotential(segNearTerm);
      const segMedLabel = labelPotential(segMediumTerm);

      segmentResults.push({ name: segName, score: segScore, tier: segTier, rank: 0 });

      const segId = `GF-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}-${segType.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15)}`;
      allRows.push({
        id: segId,
        feasibilityId: segId,
        caseId,
        scope: "segment",
        segmentName: segName,
        segmentType: segType,
        feasibilityScore: Number(segScore.toFixed(3)),
        feasibilityTier: segTier,
        nearTermPotential: Number(segNearTerm.toFixed(3)),
        nearTermLabel: segNearLabel,
        mediumTermPotential: Number(segMediumTerm.toFixed(3)),
        mediumTermLabel: segMedLabel,
        topUnlocks: JSON.stringify(deriveUnlocks(segInput)),
        topConstraints: JSON.stringify(deriveConstraints(segInput)),
        adoptionLikelihood: segAdoption,
        barrierLoad: Number(segBarrierLoad.toFixed(3)),
        readinessScore: Number(segAvgReadiness.toFixed(3)),
        competitiveRiskLoad: Number(segCompRisk.toFixed(3)),
        scalabilityRating: determineScalability(segInput),
        revenueTranslation: determineRevenueTranslation(segInput),
        rationale: buildRationale(segInput, segTier, segNearLabel, segMedLabel),
        confidenceLevel: determineConfidence(activeSignals.length, segments.length),
        priorityRank: 0,
        derivedFrom: JSON.stringify({
          segmentAdoption: segAdoption,
          segmentBarrierCount: effectiveBarriers.length,
          segmentMilestoneCount: effectiveMilestones.length,
          segmentRiskCount: effectiveRisks.length,
        }),
      });
    }

    segmentResults.sort((a, b) => b.score - a.score);
    for (let r = 0; r < segmentResults.length; r++) {
      segmentResults[r].rank = r + 1;
      const row = allRows.find(row => row.scope === "segment" && row.segmentName === segmentResults[r].name);
      if (row) row.priorityRank = r + 1;
    }

    await db.delete(growthFeasibilityTable).where(eq(growthFeasibilityTable.caseId, caseId));
    if (allRows.length > 0) {
      await db.insert(growthFeasibilityTable).values(allRows);
    }

    const overall = allRows.find(r => r.scope === "overall");
    const segmentRows = allRows.filter(r => r.scope === "segment").sort((a, b) => a.priorityRank - b.priorityRank);

    res.json({
      overall,
      segments: segmentRows,
      meta: {
        caseId,
        signalCount: activeSignals.length,
        segmentCount: segments.length,
        barrierCount: barriers.length,
        milestoneCount: milestones.length,
        riskCount: risks.length,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error("Growth feasibility generation error:", err);
    res.status(500).json({ error: "Failed to generate growth feasibility" });
  }
});

export default router;
