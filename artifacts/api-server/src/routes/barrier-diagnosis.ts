import { Router } from "express";
import { db, barrierDiagnosisTable, casesTable, signalsTable, adoptionSegmentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";

const router = Router();

interface BarrierCategoryDef {
  key: string;
  label: string;
  signalPatterns: string[];
  structuralDefault: boolean;
  removabilityBase: "hard" | "moderate" | "feasible";
  description: string;
}

const BARRIER_CATEGORIES: BarrierCategoryDef[] = [
  {
    key: "evidence_data_quality",
    label: "Evidence / Data Quality",
    signalPatterns: ["clinical evidence", "phase", "data", "trial", "endpoint", "efficacy", "mechanism"],
    structuralDefault: false,
    removabilityBase: "moderate",
    description: "Insufficient or unconvincing clinical evidence to support adoption decisions.",
  },
  {
    key: "clinical_reasoning",
    label: "Clinical Reasoning",
    signalPatterns: ["clinical", "treatment", "therapy", "outcome", "patient selection", "indication"],
    structuralDefault: false,
    removabilityBase: "moderate",
    description: "Clinical logic or treatment paradigm does not yet favor switching.",
  },
  {
    key: "safety_risk",
    label: "Safety / Risk Perception",
    signalPatterns: ["safety", "adverse", "risk", "toxicity", "side effect", "tolerability", "black box"],
    structuralDefault: true,
    removabilityBase: "hard",
    description: "Real or perceived safety concerns suppressing willingness to prescribe.",
  },
  {
    key: "access_reimbursement",
    label: "Access / Reimbursement",
    signalPatterns: ["access", "payer", "reimbursement", "coverage", "prior auth", "formulary", "tier", "copay"],
    structuralDefault: true,
    removabilityBase: "hard",
    description: "Payer access, reimbursement, or formulary barriers blocking prescribing.",
  },
  {
    key: "workflow_operational",
    label: "Workflow / Operational Burden",
    signalPatterns: ["workflow", "operational", "administration", "infusion", "site readiness", "logistics", "dosing"],
    structuralDefault: false,
    removabilityBase: "feasible",
    description: "Operational complexity or workflow disruption creating adoption friction.",
  },
  {
    key: "guideline_soc_inertia",
    label: "Guideline / Standard-of-Care Inertia",
    signalPatterns: ["guideline", "standard of care", "consensus", "recommendation", "nccn", "asco", "esmo"],
    structuralDefault: true,
    removabilityBase: "hard",
    description: "Current guidelines do not yet endorse or position the asset favorably.",
  },
  {
    key: "identity_role",
    label: "Identity / Role Ownership",
    signalPatterns: ["specialty", "role", "ownership", "referral", "prescribing authority", "gatekeeper"],
    structuralDefault: true,
    removabilityBase: "hard",
    description: "Prescribing authority, specialty ownership, or role identity creates resistance.",
  },
  {
    key: "economic_budget",
    label: "Economic / Budget Pressure",
    signalPatterns: ["cost", "budget", "economic", "value", "price", "spend", "financial", "affordability"],
    structuralDefault: false,
    removabilityBase: "moderate",
    description: "Economic or budget constraints reducing willingness to adopt.",
  },
  {
    key: "competitive_entrenchment",
    label: "Competitive Entrenchment",
    signalPatterns: ["competi", "market share", "switching", "incumbent", "head-to-head", "differentiation", "loyalty"],
    structuralDefault: true,
    removabilityBase: "hard",
    description: "Entrenched competitor making switching difficult without compelling differentiation.",
  },
  {
    key: "awareness_translation",
    label: "Awareness / Translation Gap",
    signalPatterns: ["awareness", "education", "translation", "knowledge", "perception", "adoption", "familiarity"],
    structuralDefault: false,
    removabilityBase: "feasible",
    description: "Insufficient awareness, education, or translation of evidence into practice.",
  },
];

const SEGMENT_BARRIER_PROFILES: Record<string, { primaryCategories: string[]; amplifiedCategories: string[]; dampened: string[] }> = {
  kol_academic: {
    primaryCategories: ["evidence_data_quality", "guideline_soc_inertia", "clinical_reasoning"],
    amplifiedCategories: ["guideline_soc_inertia"],
    dampened: ["workflow_operational", "access_reimbursement", "economic_budget"],
  },
  community_high: {
    primaryCategories: ["guideline_soc_inertia", "evidence_data_quality", "access_reimbursement", "awareness_translation"],
    amplifiedCategories: ["guideline_soc_inertia", "access_reimbursement"],
    dampened: ["identity_role"],
  },
  community_cautious: {
    primaryCategories: ["evidence_data_quality", "safety_risk", "workflow_operational", "awareness_translation"],
    amplifiedCategories: ["workflow_operational", "safety_risk", "awareness_translation"],
    dampened: ["competitive_entrenchment"],
  },
  access_constrained: {
    primaryCategories: ["access_reimbursement", "economic_budget", "competitive_entrenchment"],
    amplifiedCategories: ["access_reimbursement", "economic_budget"],
    dampened: ["evidence_data_quality", "clinical_reasoning", "identity_role"],
  },
  workflow_sensitive: {
    primaryCategories: ["workflow_operational", "access_reimbursement", "awareness_translation"],
    amplifiedCategories: ["workflow_operational"],
    dampened: ["guideline_soc_inertia", "competitive_entrenchment"],
  },
  guideline_led: {
    primaryCategories: ["guideline_soc_inertia", "evidence_data_quality", "clinical_reasoning"],
    amplifiedCategories: ["guideline_soc_inertia", "evidence_data_quality"],
    dampened: ["workflow_operational", "economic_budget"],
  },
  economics_sensitive: {
    primaryCategories: ["economic_budget", "access_reimbursement", "competitive_entrenchment"],
    amplifiedCategories: ["economic_budget", "competitive_entrenchment"],
    dampened: ["clinical_reasoning", "identity_role"],
  },
  competitive_defender: {
    primaryCategories: ["competitive_entrenchment", "evidence_data_quality", "awareness_translation"],
    amplifiedCategories: ["competitive_entrenchment"],
    dampened: ["workflow_operational", "guideline_soc_inertia"],
  },
};

function classifySignalToCategories(signal: any): string[] {
  const combined = `${signal.signalType || ""} ${signal.signalDescription || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const cat of BARRIER_CATEGORIES) {
    if (cat.signalPatterns.some(p => combined.includes(p))) {
      matched.push(cat.key);
    }
  }
  return matched.length > 0 ? matched : ["awareness_translation"];
}

function computeBarrierStrength(
  negativeSignals: any[],
  counterSignals: any[],
  segProfile: { amplifiedCategories: string[]; dampened: string[] } | null,
  categoryKey: string,
): number {
  if (negativeSignals.length === 0) return 0;

  let base = 0;
  for (const s of negativeSignals) {
    const lr = s.likelihoodRatio ?? 1;
    const impact = lr < 1 ? (1 - lr) : 0;
    const strength = s.strengthScore ?? 0.5;
    const reliability = s.reliabilityScore ?? 0.5;
    base += impact * strength * reliability;
  }
  base = Math.min(1, base / Math.max(1, negativeSignals.length) * 1.5);

  if (counterSignals.length > 0) {
    const counterWeight = Math.min(0.4, counterSignals.length * 0.1);
    base *= (1 - counterWeight);
  }

  if (segProfile) {
    if (segProfile.amplifiedCategories.includes(categoryKey)) {
      base = Math.min(1, base * 1.35);
    }
    if (segProfile.dampened.includes(categoryKey)) {
      base *= 0.6;
    }
  }

  return Math.max(0.05, Math.min(0.99, base));
}

function determineConfidence(signalCount: number, diversity: number, fragility: number): string {
  if (signalCount >= 4 && diversity > 0.5 && fragility < 0.2) return "High";
  if (signalCount >= 2 && fragility < 0.4) return "Moderate";
  if (signalCount >= 1) return "Developing";
  return "Low";
}

function estimateImpact(
  barrierStrength: number,
  isStructural: boolean,
  baseProbability: number,
): number {
  const maxLift = isStructural ? 0.08 : 0.15;
  const lift = barrierStrength * maxLift * (1 - baseProbability * 0.3);
  return Math.max(0.01, Math.min(0.25, lift));
}

function classifyPriority(
  strength: number,
  isStructural: boolean,
  impact: number,
  isEcho: boolean,
): { priorityClass: string; rank: number } {
  if (isEcho) return { priorityClass: "downstream_echo", rank: 4 };
  if (strength >= 0.4 && !isStructural && impact >= 0.05) return { priorityClass: "high_impact_removable", rank: 1 };
  if (strength >= 0.4 && isStructural) return { priorityClass: "high_impact_structural", rank: 2 };
  return { priorityClass: "secondary", rank: 3 };
}

function generateBarrierName(catDef: BarrierCategoryDef, topSignal: any | null): string {
  if (topSignal && topSignal.signalDescription) {
    const desc = topSignal.signalDescription as string;
    if (desc.length <= 80) return desc;
    return desc.slice(0, 77) + "…";
  }
  return catDef.label;
}

function generateWhyItMatters(catDef: BarrierCategoryDef, strength: number, negCount: number, segmentName?: string): string {
  let base = catDef.description;
  if (strength >= 0.6) {
    base += ` This barrier is strong (${(strength * 100).toFixed(0)}% intensity) with ${negCount} supporting signal${negCount !== 1 ? "s" : ""}.`;
  } else if (strength >= 0.3) {
    base += ` Moderate barrier intensity with ${negCount} contributing signal${negCount !== 1 ? "s" : ""}.`;
  } else {
    base += ` This is a minor barrier currently, but worth monitoring.`;
  }
  if (segmentName) {
    base += ` For ${segmentName}, this factor is particularly relevant to adoption decisions.`;
  }
  return base;
}

const SEGMENT_SIGNAL_AFFINITIES: Record<string, string[]> = {
  kol_academic: ["phase", "clinical", "mechanism", "expert", "guideline", "evidence", "endpoint", "trial"],
  community_high: ["guideline", "clinical", "real-world", "payer", "coverage", "evidence"],
  community_cautious: ["real-world", "safety", "guideline", "payer", "workflow", "adverse", "tolerability"],
  access_constrained: ["payer", "access", "reimbursement", "formulary", "coverage", "copay", "tier", "prior auth", "cost", "budget"],
  workflow_sensitive: ["workflow", "operational", "administration", "infusion", "site", "logistics", "dosing", "complexity"],
  guideline_led: ["guideline", "consensus", "recommendation", "nccn", "asco", "esmo", "evidence", "clinical"],
  economics_sensitive: ["cost", "budget", "economic", "value", "price", "spend", "financial", "payer", "access"],
  competitive_defender: ["competi", "market share", "switching", "incumbent", "head-to-head", "differentiation", "loyalty"],
};

function filterSignalsForSegment(signals: any[], segmentType: string | null): any[] {
  if (!segmentType) return signals;
  const affinities = SEGMENT_SIGNAL_AFFINITIES[segmentType];
  if (!affinities || affinities.length === 0) return signals;

  const relevant = signals.filter(s => {
    const combined = `${s.signalType || ""} ${s.signalDescription || ""}`.toLowerCase();
    return affinities.some(a => combined.includes(a));
  });

  return relevant.length >= 2 ? relevant : signals;
}

function diagnoseBarriers(
  signals: any[],
  baseProbability: number,
  depAnalysis: any,
  segmentId: string | null,
  segmentName: string | null,
  segmentType: string | null,
  caseId: string,
): any[] {
  const segSignals = filterSignalsForSegment(signals, segmentType);

  const negativeSignals = segSignals.filter(s => s.direction === "Negative" || (s.likelihoodRatio ?? 1) < 1);
  const positiveSignals = segSignals.filter(s => s.direction === "Positive" && (s.likelihoodRatio ?? 1) > 1);

  const diversity = depAnalysis?.metrics?.evidenceDiversityScore ?? 0.5;
  const fragility = depAnalysis?.metrics?.posteriorFragilityScore ?? 0;

  const segProfile = segmentType ? SEGMENT_BARRIER_PROFILES[segmentType] ?? null : null;

  const categoryBuckets: Record<string, { negative: any[]; counter: any[] }> = {};
  for (const cat of BARRIER_CATEGORIES) {
    categoryBuckets[cat.key] = { negative: [], counter: [] };
  }

  for (const sig of negativeSignals) {
    const cats = classifySignalToCategories(sig);
    for (const c of cats) {
      if (categoryBuckets[c]) categoryBuckets[c].negative.push(sig);
    }
  }

  for (const sig of positiveSignals) {
    const cats = classifySignalToCategories(sig);
    for (const c of cats) {
      if (categoryBuckets[c]) categoryBuckets[c].counter.push(sig);
    }
  }

  const barriers: any[] = [];

  for (const catDef of BARRIER_CATEGORIES) {
    const bucket = categoryBuckets[catDef.key];
    if (bucket.negative.length === 0) continue;

    const strength = computeBarrierStrength(bucket.negative, bucket.counter, segProfile, catDef.key);
    if (strength < 0.03) continue;

    const isEcho = bucket.negative.every(s =>
      (s.echoVsTranslation || "").toLowerCase() === "echo" ||
      (s.dependencyRole || "").toLowerCase() === "downstream"
    );

    const isStructural = catDef.structuralDefault && strength >= 0.3;

    const impact = estimateImpact(strength, isStructural, baseProbability);
    const confidence = determineConfidence(bucket.negative.length, diversity, fragility);
    const { priorityClass, rank } = classifyPriority(strength, isStructural, impact, isEcho);

    const topNegative = [...bucket.negative].sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1));
    const topCounter = [...bucket.counter].sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1));

    const barrierName = generateBarrierName(catDef, topNegative[0]);
    const whyItMatters = generateWhyItMatters(catDef, strength, bucket.negative.length, segmentName ?? undefined);

    let removalDifficulty: string;
    if (isStructural && catDef.removabilityBase === "hard") {
      removalDifficulty = "structural";
    } else if (catDef.removabilityBase === "hard") {
      removalDifficulty = "difficult";
    } else if (catDef.removabilityBase === "moderate") {
      removalDifficulty = "moderate";
    } else {
      removalDifficulty = "feasible";
    }

    let rationale = `${catDef.label} barrier detected with ${bucket.negative.length} negative signal${bucket.negative.length !== 1 ? "s" : ""}.`;
    if (bucket.counter.length > 0) {
      rationale += ` ${bucket.counter.length} counter-signal${bucket.counter.length !== 1 ? "s" : ""} partially offset.`;
    }
    if (isEcho) {
      rationale += " All supporting signals appear to be downstream echoes rather than root constraints.";
    }
    if (segProfile?.amplifiedCategories.includes(catDef.key)) {
      rationale += ` This category is amplified for ${segmentName ?? "this segment"}.`;
    }

    barriers.push({
      id: randomUUID(),
      barrierId: `BAR-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${segmentId ? segmentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8) + "-" : ""}${catDef.key}`,
      caseId,
      segmentId,
      segmentName,
      barrierName,
      barrierCategory: catDef.key,
      barrierStrength: Number(strength.toFixed(4)),
      barrierConfidence: confidence,
      barrierScope: segmentId ? "segment" : "overall",
      primarySignals: JSON.stringify(
        topNegative.slice(0, 5).map(s => ({
          signalId: s.signalId,
          description: (s.signalDescription || "").slice(0, 120),
          type: s.signalType,
          direction: s.direction,
          likelihoodRatio: s.likelihoodRatio,
        })),
      ),
      counterSignals: JSON.stringify(
        topCounter.slice(0, 3).map(s => ({
          signalId: s.signalId,
          description: (s.signalDescription || "").slice(0, 120),
          type: s.signalType,
          direction: s.direction,
          likelihoodRatio: s.likelihoodRatio,
        })),
      ),
      whyItMatters,
      removalDifficulty,
      isStructural: isStructural ? "yes" : "no",
      estimatedImpactIfResolved: Number(impact.toFixed(4)),
      priorityRank: rank,
      priorityClass,
      rationaleSummary: rationale,
      signalCount: bucket.negative.length,
      counterSignalCount: bucket.counter.length,
      derivedFrom: JSON.stringify({
        baseProbability,
        categoryKey: catDef.key,
        segmentType: segmentType ?? "overall",
        depAnalysisAvailable: depAnalysis != null,
        isEcho,
      }),
    });
  }

  barriers.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return b.barrierStrength - a.barrierStrength;
  });

  barriers.forEach((b, idx) => {
    b.priorityRank = idx + 1;
  });

  return barriers;
}

router.get("/cases/:caseId/barrier-diagnosis", async (req, res) => {
  const barriers = await db
    .select()
    .from(barrierDiagnosisTable)
    .where(eq(barrierDiagnosisTable.caseId, req.params.caseId))
    .orderBy(barrierDiagnosisTable.priorityRank);
  res.json(barriers);
});

router.post("/cases/:caseId/barrier-diagnosis/generate", async (req, res) => {
  const { caseId } = req.params;

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  const signals = await db
    .select()
    .from(signalsTable)
    .where(and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active")));

  if (signals.length === 0) {
    return res.status(400).json({ error: "No active signals for this case. Add signals before generating barrier diagnosis." });
  }

  const baseProbability = caseData.currentProbability ?? caseData.priorProbability ?? 0.5;

  let depAnalysis: any = null;
  try {
    depAnalysis = runDependencyAnalysis(signals);
  } catch (e) {
    console.error("Dependency analysis failed during barrier diagnosis:", e);
  }

  await db.delete(barrierDiagnosisTable).where(eq(barrierDiagnosisTable.caseId, caseId));

  const overallBarriers = diagnoseBarriers(signals, baseProbability, depAnalysis, null, null, null, caseId);

  const segments = await db
    .select()
    .from(adoptionSegmentsTable)
    .where(eq(adoptionSegmentsTable.caseId, caseId))
    .orderBy(adoptionSegmentsTable.priorityRank);

  const segmentBarriers: any[] = [];
  for (const seg of segments) {
    const segBarriers = diagnoseBarriers(
      signals,
      seg.adoptionLikelihood,
      depAnalysis,
      seg.segmentId,
      seg.segmentName,
      seg.segmentType,
      caseId,
    );
    segmentBarriers.push(...segBarriers);
  }

  const allBarriers = [...overallBarriers, ...segmentBarriers];

  if (allBarriers.length > 0) {
    await db.insert(barrierDiagnosisTable).values(allBarriers);
  }

  res.status(201).json({
    overall: overallBarriers,
    bySegment: segments.reduce((acc: Record<string, any[]>, seg) => {
      acc[seg.segmentName] = segmentBarriers.filter(b => b.segmentId === seg.segmentId);
      return acc;
    }, {}),
    summary: {
      totalBarriers: allBarriers.length,
      overallCount: overallBarriers.length,
      segmentCount: segmentBarriers.length,
      categoryDistribution: BARRIER_CATEGORIES.reduce((acc: Record<string, number>, cat) => {
        acc[cat.label] = allBarriers.filter(b => b.barrierCategory === cat.key).length;
        return acc;
      }, {}),
      topPriority: overallBarriers[0] ?? null,
    },
  });
});

router.get("/barrier-diagnosis/categories", (_req, res) => {
  res.json(
    BARRIER_CATEGORIES.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
      structuralDefault: c.structuralDefault,
      removabilityBase: c.removabilityBase,
    })),
  );
});

export default router;
