import { Router } from "express";
import { db, readinessTimelineTable, casesTable, signalsTable, adoptionSegmentsTable, barrierDiagnosisTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";

const router = Router();

interface MilestoneCategoryDef {
  key: string;
  label: string;
  signalPatterns: string[];
  barrierCategories: string[];
  baseTimeWindow: string;
  sequenceOrder: number;
  description: string;
}

const MILESTONE_CATEGORIES: MilestoneCategoryDef[] = [
  {
    key: "evidence_consolidation",
    label: "Evidence Consolidation",
    signalPatterns: ["phase", "clinical", "trial", "endpoint", "efficacy", "data", "mechanism", "real-world"],
    barrierCategories: ["evidence_data_quality", "clinical_reasoning"],
    baseTimeWindow: "0-3 months",
    sequenceOrder: 1,
    description: "Clinical evidence reaches threshold for confident prescribing decisions.",
  },
  {
    key: "guideline_movement",
    label: "Guideline Movement",
    signalPatterns: ["guideline", "consensus", "recommendation", "nccn", "asco", "esmo", "standard of care"],
    barrierCategories: ["guideline_soc_inertia"],
    baseTimeWindow: "6-12 months",
    sequenceOrder: 3,
    description: "Professional guidelines update to include or elevate the asset.",
  },
  {
    key: "access_reimbursement",
    label: "Access / Reimbursement Change",
    signalPatterns: ["access", "payer", "formulary", "coverage", "reimbursement", "prior auth", "tier", "copay"],
    barrierCategories: ["access_reimbursement", "economic_budget"],
    baseTimeWindow: "3-6 months",
    sequenceOrder: 2,
    description: "Payer decisions, formulary placement, or reimbursement pathways open.",
  },
  {
    key: "workflow_readiness",
    label: "Operational / Workflow Readiness",
    signalPatterns: ["workflow", "operational", "administration", "infusion", "site", "logistics", "dosing"],
    barrierCategories: ["workflow_operational"],
    baseTimeWindow: "0-3 months",
    sequenceOrder: 2,
    description: "Site-level operational readiness for administration, monitoring, and workflow integration.",
  },
  {
    key: "kol_diffusion",
    label: "KOL / Peer Diffusion",
    signalPatterns: ["expert", "kol", "opinion leader", "peer", "congress", "presentation", "publication"],
    barrierCategories: ["awareness_translation"],
    baseTimeWindow: "3-6 months",
    sequenceOrder: 4,
    description: "Key opinion leaders adopt and begin influencing peer prescribing behavior.",
  },
  {
    key: "community_translation",
    label: "Community Translation",
    signalPatterns: ["community", "adoption", "prescribing", "real-world", "practice", "physician", "uptake"],
    barrierCategories: ["awareness_translation", "clinical_reasoning"],
    baseTimeWindow: "6-12 months",
    sequenceOrder: 5,
    description: "Broader community clinicians translate KOL adoption into regular practice.",
  },
  {
    key: "competitive_displacement",
    label: "Competitive Displacement",
    signalPatterns: ["competi", "market share", "switching", "incumbent", "head-to-head", "differentiation"],
    barrierCategories: ["competitive_entrenchment"],
    baseTimeWindow: "12-18 months",
    sequenceOrder: 6,
    description: "Asset gains share from entrenched competitor through differentiation or clinical advantage.",
  },
  {
    key: "supply_manufacturing",
    label: "Supply / Manufacturing Readiness",
    signalPatterns: ["supply", "manufacturing", "distribution", "inventory", "cold chain", "production", "capacity"],
    barrierCategories: [],
    baseTimeWindow: "0-3 months",
    sequenceOrder: 1,
    description: "Manufacturing capacity and supply chain ready to support commercial demand.",
  },
  {
    key: "field_readiness",
    label: "Sales / Field Readiness",
    signalPatterns: ["field force", "sales", "representative", "training", "launch", "deployment", "territory"],
    barrierCategories: [],
    baseTimeWindow: "0-3 months",
    sequenceOrder: 1,
    description: "Field force trained, deployed, and equipped for promotional activity.",
  },
  {
    key: "account_pathway",
    label: "Account Pathway Enablement",
    signalPatterns: ["account", "pathway", "hub", "patient support", "enrollment", "referral", "onboarding"],
    barrierCategories: ["workflow_operational", "access_reimbursement"],
    baseTimeWindow: "3-6 months",
    sequenceOrder: 3,
    description: "Patient access pathways, hub services, and account-level protocols established.",
  },
];

const TIME_WINDOWS = [
  { key: "now", label: "Now / Immediate", months: 0, order: 0 },
  { key: "0-3 months", label: "0–3 months", months: 3, order: 1 },
  { key: "3-6 months", label: "3–6 months", months: 6, order: 2 },
  { key: "6-12 months", label: "6–12 months", months: 12, order: 3 },
  { key: "12-18 months", label: "12–18 months", months: 18, order: 4 },
  { key: "18+ months", label: "18+ months", months: 24, order: 5 },
];

const SEGMENT_READINESS_PROFILES: Record<string, {
  earlyCategories: string[];
  lateCategories: string[];
  timeShift: number;
}> = {
  kol_academic: {
    earlyCategories: ["evidence_consolidation", "kol_diffusion"],
    lateCategories: ["account_pathway", "competitive_displacement"],
    timeShift: -1,
  },
  community_high: {
    earlyCategories: ["guideline_movement", "access_reimbursement"],
    lateCategories: ["competitive_displacement"],
    timeShift: 0,
  },
  community_cautious: {
    earlyCategories: ["evidence_consolidation", "guideline_movement"],
    lateCategories: ["community_translation"],
    timeShift: 1,
  },
  access_constrained: {
    earlyCategories: ["access_reimbursement", "account_pathway"],
    lateCategories: ["community_translation", "competitive_displacement"],
    timeShift: 1,
  },
  workflow_sensitive: {
    earlyCategories: ["workflow_readiness", "account_pathway"],
    lateCategories: ["community_translation", "competitive_displacement"],
    timeShift: 1,
  },
  guideline_led: {
    earlyCategories: ["evidence_consolidation", "guideline_movement"],
    lateCategories: ["competitive_displacement", "account_pathway"],
    timeShift: 1,
  },
  economics_sensitive: {
    earlyCategories: ["access_reimbursement"],
    lateCategories: ["community_translation", "competitive_displacement"],
    timeShift: 1,
  },
  competitive_defender: {
    earlyCategories: ["competitive_displacement", "evidence_consolidation"],
    lateCategories: ["community_translation"],
    timeShift: 2,
  },
};

function classifySignalToMilestones(signal: any): string[] {
  const combined = `${signal.signalType || ""} ${signal.signalDescription || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const cat of MILESTONE_CATEGORIES) {
    if (cat.signalPatterns.some(p => combined.includes(p))) {
      matched.push(cat.key);
    }
  }
  return matched.length > 0 ? matched : ["community_translation"];
}

function computeReadinessScore(
  supportingSignals: any[],
  counterSignals: any[],
  gatingBarrierStrengths: number[],
  segProfile: typeof SEGMENT_READINESS_PROFILES[string] | null,
  categoryKey: string,
): number {
  let evidence = 0;
  for (const s of supportingSignals) {
    const lr = s.likelihoodRatio ?? 1;
    const strength = s.strengthScore ?? 0.5;
    const reliability = s.reliabilityScore ?? 0.5;
    evidence += (lr > 1 ? Math.min(0.5, (lr - 1) * 0.3) : 0) * strength * reliability;
  }
  evidence = Math.min(0.8, evidence / Math.max(1, supportingSignals.length) * 2);

  if (supportingSignals.length === 0) evidence = 0.1;

  let counterPenalty = 0;
  for (const s of counterSignals) {
    const lr = s.likelihoodRatio ?? 1;
    counterPenalty += lr < 1 ? (1 - lr) * 0.15 : 0;
  }
  counterPenalty = Math.min(0.3, counterPenalty);

  let barrierPenalty = 0;
  for (const bs of gatingBarrierStrengths) {
    barrierPenalty += bs * 0.25;
  }
  barrierPenalty = Math.min(0.5, barrierPenalty);

  let score = 0.15 + evidence - counterPenalty - barrierPenalty;

  if (segProfile) {
    if (segProfile.earlyCategories.includes(categoryKey)) {
      score = Math.min(0.95, score * 1.2 + 0.05);
    }
    if (segProfile.lateCategories.includes(categoryKey)) {
      score *= 0.7;
    }
  }

  return Math.max(0.05, Math.min(0.95, score));
}

function determineTimeWindow(
  catDef: MilestoneCategoryDef,
  readinessScore: number,
  segProfile: typeof SEGMENT_READINESS_PROFILES[string] | null,
  gatingBarrierCount: number,
): string {
  const baseIdx = TIME_WINDOWS.findIndex(t => t.key === catDef.baseTimeWindow);
  let idx = baseIdx >= 0 ? baseIdx : 2;

  if (readinessScore >= 0.7) {
    idx = Math.max(0, idx - 1);
  } else if (readinessScore >= 0.5) {
  } else if (readinessScore >= 0.3) {
    idx = Math.min(TIME_WINDOWS.length - 1, idx + 1);
  } else {
    idx = Math.min(TIME_WINDOWS.length - 1, idx + 2);
  }

  if (gatingBarrierCount >= 3) {
    idx = Math.min(TIME_WINDOWS.length - 1, idx + 1);
  }

  if (segProfile) {
    idx = Math.max(0, Math.min(TIME_WINDOWS.length - 1, idx + segProfile.timeShift));
  }

  if (readinessScore >= 0.8) {
    idx = 0;
  }

  return TIME_WINDOWS[Math.max(0, Math.min(TIME_WINDOWS.length - 1, idx))].key;
}

function determineCurrentStatus(readinessScore: number, gatingBarrierCount: number): string {
  if (readinessScore >= 0.8) return "substantially_ready";
  if (readinessScore >= 0.5 && gatingBarrierCount === 0) return "on_track";
  if (readinessScore >= 0.3 && gatingBarrierCount <= 2) return "blocked_but_unlockable";
  if (gatingBarrierCount > 0) return "blocked";
  return "unlikely_within_horizon";
}

function determineConfidence(signalCount: number, diversity: number, fragility: number): string {
  if (signalCount >= 4 && diversity > 0.5 && fragility < 0.2) return "High";
  if (signalCount >= 2 && fragility < 0.4) return "Moderate";
  if (signalCount >= 1) return "Developing";
  return "Low";
}

function getMilestoneDependencies(categoryKey: string): string[] {
  const DEPENDENCY_MAP: Record<string, string[]> = {
    evidence_consolidation: [],
    guideline_movement: ["evidence_consolidation"],
    access_reimbursement: ["evidence_consolidation"],
    workflow_readiness: [],
    kol_diffusion: ["evidence_consolidation"],
    community_translation: ["kol_diffusion", "guideline_movement", "access_reimbursement"],
    competitive_displacement: ["evidence_consolidation", "access_reimbursement", "community_translation"],
    supply_manufacturing: [],
    field_readiness: [],
    account_pathway: ["access_reimbursement", "workflow_readiness"],
  };
  return DEPENDENCY_MAP[categoryKey] ?? [];
}

function generateMilestones(
  signals: any[],
  barriers: any[],
  baseProbability: number,
  depAnalysis: any,
  segmentId: string | null,
  segmentName: string | null,
  segmentType: string | null,
  caseId: string,
): any[] {
  const diversity = depAnalysis?.metrics?.evidenceDiversityScore ?? 0.5;
  const fragility = depAnalysis?.metrics?.posteriorFragilityScore ?? 0;

  const segProfile = segmentType ? SEGMENT_READINESS_PROFILES[segmentType] ?? null : null;

  const positiveSignals = signals.filter(s => {
    const dir = s.direction;
    const lr = s.likelihoodRatio ?? 1;
    if (dir === "Positive" && lr >= 1) return true;
    if (!dir && lr > 1) return true;
    return false;
  });
  const negativeSignals = signals.filter(s => {
    const dir = s.direction;
    const lr = s.likelihoodRatio ?? 1;
    if (dir === "Negative" && lr <= 1) return true;
    if (!dir && lr < 1) return true;
    return false;
  });

  const milestoneBuckets: Record<string, { supporting: any[]; counter: any[] }> = {};
  for (const cat of MILESTONE_CATEGORIES) {
    milestoneBuckets[cat.key] = { supporting: [], counter: [] };
  }

  for (const sig of positiveSignals) {
    const cats = classifySignalToMilestones(sig);
    for (const c of cats) {
      if (milestoneBuckets[c]) milestoneBuckets[c].supporting.push(sig);
    }
  }

  for (const sig of negativeSignals) {
    const cats = classifySignalToMilestones(sig);
    for (const c of cats) {
      if (milestoneBuckets[c]) milestoneBuckets[c].counter.push(sig);
    }
  }

  const barriersByCategory: Record<string, any[]> = {};
  for (const b of barriers) {
    const cat = b.barrierCategory;
    if (!barriersByCategory[cat]) barriersByCategory[cat] = [];
    barriersByCategory[cat].push(b);
  }

  const milestones: any[] = [];

  for (const catDef of MILESTONE_CATEGORIES) {
    const bucket = milestoneBuckets[catDef.key];
    const totalSignals = bucket.supporting.length + bucket.counter.length;

    if (totalSignals === 0 && catDef.barrierCategories.every(bc => !barriersByCategory[bc]?.length)) {
      continue;
    }

    const gatingBarriers: any[] = [];
    for (const bc of catDef.barrierCategories) {
      if (barriersByCategory[bc]) {
        gatingBarriers.push(...barriersByCategory[bc]);
      }
    }
    const gatingStrengths = gatingBarriers.map(b => b.barrierStrength ?? 0.3);

    const readinessScore = computeReadinessScore(
      bucket.supporting, bucket.counter, gatingStrengths, segProfile, catDef.key,
    );

    const timeWindow = determineTimeWindow(catDef, readinessScore, segProfile, gatingBarriers.length);
    const currentStatus = determineCurrentStatus(readinessScore, gatingBarriers.length);
    const confidence = determineConfidence(totalSignals, diversity, fragility);

    const impactBase = readinessScore * baseProbability * 0.15;
    const estimatedImpact = Math.max(0.01, Math.min(0.2, impactBase));

    const topSupporting = [...bucket.supporting]
      .sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1))
      .slice(0, 5);
    const topCounter = [...bucket.counter]
      .sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1))
      .slice(0, 3);

    const accelerators: string[] = [];
    if (bucket.supporting.length >= 3) accelerators.push("Strong supporting evidence base");
    if (gatingBarriers.some(b => b.removalDifficulty === "feasible")) accelerators.push("Feasibly removable barriers present");
    if (readinessScore >= 0.5) accelerators.push("Above-threshold readiness — momentum exists");
    for (const s of topSupporting.slice(0, 2)) {
      if (s.signalDescription) accelerators.push((s.signalDescription as string).slice(0, 80));
    }

    const delayRisks: string[] = [];
    if (gatingBarriers.some(b => b.isStructural === "yes")) delayRisks.push("Structural barriers present");
    if (bucket.counter.length >= 2) delayRisks.push(`${bucket.counter.length} counter-signals detected`);
    if (readinessScore < 0.3) delayRisks.push("Low readiness — significant movement needed");
    for (const b of gatingBarriers.slice(0, 2)) {
      delayRisks.push(`Gating barrier: ${b.barrierName?.slice(0, 60) ?? b.barrierCategory}`);
    }

    const requiredSignals: string[] = [];
    if (bucket.supporting.length < 2) requiredSignals.push("Additional supporting evidence needed");
    for (const bc of catDef.barrierCategories) {
      if (barriersByCategory[bc]?.some((b: any) => b.barrierStrength >= 0.4)) {
        requiredSignals.push(`Evidence to address ${bc.replace(/_/g, " ")} barrier`);
      }
    }

    let milestoneName = catDef.label;
    if (segmentName) {
      milestoneName = `${catDef.label} — ${segmentName}`;
    }

    let rationale = `${catDef.description} `;
    rationale += `Readiness: ${(readinessScore * 100).toFixed(0)}%. `;
    rationale += `${bucket.supporting.length} supporting signal${bucket.supporting.length !== 1 ? "s" : ""}, `;
    rationale += `${bucket.counter.length} counter-signal${bucket.counter.length !== 1 ? "s" : ""}. `;
    if (gatingBarriers.length > 0) {
      rationale += `${gatingBarriers.length} gating barrier${gatingBarriers.length !== 1 ? "s" : ""} identified. `;
    }
    if (segmentName) {
      rationale += `Timeline adjusted for ${segmentName} adoption profile.`;
    }

    const deps = getMilestoneDependencies(catDef.key);

    milestones.push({
      id: randomUUID(),
      readinessId: `RDY-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${segmentId ? segmentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) + "-" : ""}${catDef.key}`,
      caseId,
      segmentId,
      segmentName,
      milestoneName,
      milestoneCategory: catDef.key,
      expectedTimeWindow: timeWindow,
      currentStatus,
      readinessScore: Number(readinessScore.toFixed(4)),
      gatingBarriers: JSON.stringify(
        gatingBarriers.slice(0, 5).map(b => ({
          barrierId: b.barrierId,
          name: (b.barrierName || "").slice(0, 80),
          category: b.barrierCategory,
          strength: b.barrierStrength,
          isStructural: b.isStructural,
          removalDifficulty: b.removalDifficulty,
        })),
      ),
      requiredSignals: JSON.stringify(requiredSignals),
      supportingSignals: JSON.stringify(
        topSupporting.map(s => ({
          signalId: s.signalId,
          description: (s.signalDescription || "").slice(0, 120),
          type: s.signalType,
          likelihoodRatio: s.likelihoodRatio,
        })),
      ),
      counterSignals: JSON.stringify(
        topCounter.map(s => ({
          signalId: s.signalId,
          description: (s.signalDescription || "").slice(0, 120),
          type: s.signalType,
          likelihoodRatio: s.likelihoodRatio,
        })),
      ),
      accelerators: JSON.stringify(accelerators),
      delayRisks: JSON.stringify(delayRisks),
      estimatedImpactOnAdoption: Number(estimatedImpact.toFixed(4)),
      confidenceLevel: confidence,
      priorityRank: catDef.sequenceOrder,
      dependsOnMilestones: JSON.stringify(deps),
      rationaleSummary: rationale,
      derivedFrom: JSON.stringify({
        baseProbability,
        categoryKey: catDef.key,
        segmentType: segmentType ?? "overall",
        signalCount: totalSignals,
        barrierCount: gatingBarriers.length,
        depAnalysisAvailable: depAnalysis != null,
      }),
    });
  }

  const milestoneByCategory: Record<string, any> = {};
  for (const m of milestones) milestoneByCategory[m.milestoneCategory] = m;

  for (const m of milestones) {
    const deps = getMilestoneDependencies(m.milestoneCategory);
    if (deps.length === 0) continue;

    let latestDepWindowIdx = -1;
    let anyDepBlocked = false;

    for (const depKey of deps) {
      const depMilestone = milestoneByCategory[depKey];
      if (!depMilestone) continue;
      const depIdx = TIME_WINDOWS.findIndex(t => t.key === depMilestone.expectedTimeWindow);
      if (depIdx > latestDepWindowIdx) latestDepWindowIdx = depIdx;
      if (depMilestone.currentStatus === "blocked" || depMilestone.currentStatus === "unlikely_within_horizon") {
        anyDepBlocked = true;
      }
    }

    if (latestDepWindowIdx >= 0) {
      const myIdx = TIME_WINDOWS.findIndex(t => t.key === m.expectedTimeWindow);
      const minIdx = Math.min(TIME_WINDOWS.length - 1, latestDepWindowIdx + 1);
      if (myIdx < minIdx) {
        m.expectedTimeWindow = TIME_WINDOWS[minIdx].key;
      }
    }

    if (anyDepBlocked && m.currentStatus === "substantially_ready") {
      m.currentStatus = "blocked_but_unlockable";
    }
    if (anyDepBlocked && m.currentStatus === "on_track") {
      m.currentStatus = "blocked_but_unlockable";
    }
  }

  milestones.sort((a, b) => {
    const aOrder = TIME_WINDOWS.findIndex(t => t.key === a.expectedTimeWindow);
    const bOrder = TIME_WINDOWS.findIndex(t => t.key === b.expectedTimeWindow);
    if (aOrder !== bOrder) return aOrder - bOrder;
    return b.readinessScore - a.readinessScore;
  });

  milestones.forEach((m, idx) => {
    m.priorityRank = idx + 1;
  });

  return milestones;
}

router.get("/cases/:caseId/readiness-timeline", async (req, res) => {
  const milestones = await db
    .select()
    .from(readinessTimelineTable)
    .where(eq(readinessTimelineTable.caseId, req.params.caseId))
    .orderBy(readinessTimelineTable.priorityRank);
  res.json(milestones);
});

router.post("/cases/:caseId/readiness-timeline/generate", async (req, res) => {
  const { caseId } = req.params;

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  const signals = await db
    .select()
    .from(signalsTable)
    .where(and(
      eq(signalsTable.caseId, caseId),
      eq(signalsTable.status, "active"),
    ));

  if (signals.length === 0) {
    return res.status(400).json({ error: "No signals for this case. Add signals before generating readiness timeline." });
  }

  const baseProbability = caseData.currentProbability ?? caseData.priorProbability ?? 0.5;

  let depAnalysis: any = null;
  try {
    depAnalysis = runDependencyAnalysis(signals);
  } catch (e) {
    console.error("Dependency analysis failed during readiness timeline:", e);
  }

  const barriers = await db
    .select()
    .from(barrierDiagnosisTable)
    .where(eq(barrierDiagnosisTable.caseId, caseId));

  const overallBarriers = barriers.filter(b => !b.segmentId);

  await db.delete(readinessTimelineTable).where(eq(readinessTimelineTable.caseId, caseId));

  const overallMilestones = generateMilestones(
    signals, overallBarriers, baseProbability, depAnalysis, null, null, null, caseId,
  );

  const segments = await db
    .select()
    .from(adoptionSegmentsTable)
    .where(eq(adoptionSegmentsTable.caseId, caseId))
    .orderBy(adoptionSegmentsTable.priorityRank);

  const segmentMilestones: any[] = [];
  for (const seg of segments) {
    const segBarriers = barriers.filter(b => b.segmentId === seg.segmentId);
    const effectiveBarriers = segBarriers.length > 0 ? segBarriers : overallBarriers;
    const segMilestones = generateMilestones(
      signals, effectiveBarriers, seg.adoptionLikelihood, depAnalysis,
      seg.segmentId, seg.segmentName, seg.segmentType, caseId,
    );
    segmentMilestones.push(...segMilestones);
  }

  const allMilestones = [...overallMilestones, ...segmentMilestones];

  if (allMilestones.length > 0) {
    await db.insert(readinessTimelineTable).values(allMilestones);
  }

  const readyNow = overallMilestones.filter(m => m.currentStatus === "substantially_ready");
  const blocked = overallMilestones.filter(m => m.currentStatus === "blocked");
  const unlockable = overallMilestones.filter(m => m.currentStatus === "blocked_but_unlockable");

  const timeDistribution: Record<string, number> = {};
  for (const m of overallMilestones) {
    timeDistribution[m.expectedTimeWindow] = (timeDistribution[m.expectedTimeWindow] || 0) + 1;
  }

  const firstMover = segments.length > 0
    ? segments.reduce((best, seg) => {
        const segMs = segmentMilestones.filter(m => m.segmentId === seg.segmentId);
        const avgReadiness = segMs.length > 0
          ? segMs.reduce((sum: number, m: any) => sum + m.readinessScore, 0) / segMs.length
          : 0;
        if (avgReadiness > (best.avgReadiness ?? 0)) {
          return { segmentName: seg.segmentName, segmentType: seg.segmentType, avgReadiness };
        }
        return best;
      }, { segmentName: null as string | null, segmentType: null as string | null, avgReadiness: 0 })
    : null;

  res.status(201).json({
    overall: overallMilestones,
    bySegment: segments.reduce((acc: Record<string, any[]>, seg) => {
      acc[seg.segmentName] = segmentMilestones.filter(m => m.segmentId === seg.segmentId);
      return acc;
    }, {}),
    summary: {
      totalMilestones: allMilestones.length,
      overallCount: overallMilestones.length,
      segmentCount: segmentMilestones.length,
      readyNow: readyNow.length,
      blocked: blocked.length,
      unlockable: unlockable.length,
      timeDistribution,
      firstMoverSegment: firstMover?.segmentName ?? null,
      overallReadinessScore: overallMilestones.length > 0
        ? Number((overallMilestones.reduce((s, m) => s + m.readinessScore, 0) / overallMilestones.length).toFixed(4))
        : 0,
    },
  });
});

router.get("/readiness-timeline/categories", (_req, res) => {
  res.json(
    MILESTONE_CATEGORIES.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
      sequenceOrder: c.sequenceOrder,
      baseTimeWindow: c.baseTimeWindow,
    })),
  );
});

export default router;
