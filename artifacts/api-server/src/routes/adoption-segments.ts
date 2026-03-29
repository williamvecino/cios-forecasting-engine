import { Router } from "express";
import { db, adoptionSegmentsTable, casesTable, signalsTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";
import { runForecast } from "../lib/forecast-engine.js";
import { isRegulatoryCase } from "../lib/case-type-router.js";

const router = Router();

interface SegmentDefinition {
  name: string;
  type: string;
  signalWeights: {
    signalTypes: string[];
    directionBias: "positive" | "negative" | "neutral";
    accessSensitivity: number;
    workflowSensitivity: number;
    evidenceThreshold: number;
    competitiveSensitivity: number;
  };
  baseAdoptionModifier: number;
  description: string;
}

const SEGMENT_DEFINITIONS: SegmentDefinition[] = [
  {
    name: "Academic KOLs",
    type: "kol_academic",
    signalWeights: {
      signalTypes: ["Phase III clinical", "Clinical evidence", "Mechanism of action", "Expert opinion", "Guideline update"],
      directionBias: "positive",
      accessSensitivity: 0.2,
      workflowSensitivity: 0.1,
      evidenceThreshold: 0.6,
      competitiveSensitivity: 0.3,
    },
    baseAdoptionModifier: 1.15,
    description: "Typically first movers driven by clinical evidence strength. Low sensitivity to access/workflow friction.",
  },
  {
    name: "Community High Adopters",
    type: "community_high",
    signalWeights: {
      signalTypes: ["Guideline update", "Clinical evidence", "Real-world evidence", "Payer coverage"],
      directionBias: "positive",
      accessSensitivity: 0.5,
      workflowSensitivity: 0.4,
      evidenceThreshold: 0.4,
      competitiveSensitivity: 0.4,
    },
    baseAdoptionModifier: 1.05,
    description: "Follow KOL signals once guidelines or coverage support. Moderate sensitivity to workflow and access.",
  },
  {
    name: "Community Cautious Adopters",
    type: "community_cautious",
    signalWeights: {
      signalTypes: ["Real-world evidence", "Guideline update", "Safety signal", "Payer coverage"],
      directionBias: "neutral",
      accessSensitivity: 0.6,
      workflowSensitivity: 0.7,
      evidenceThreshold: 0.7,
      competitiveSensitivity: 0.3,
    },
    baseAdoptionModifier: 0.75,
    description: "Wait for broad evidence consensus and favorable access conditions. High workflow sensitivity.",
  },
  {
    name: "Access-Constrained Accounts",
    type: "access_constrained",
    signalWeights: {
      signalTypes: ["Payer coverage", "Access / commercial", "Reimbursement", "Prior authorization"],
      directionBias: "negative",
      accessSensitivity: 0.95,
      workflowSensitivity: 0.5,
      evidenceThreshold: 0.5,
      competitiveSensitivity: 0.6,
    },
    baseAdoptionModifier: 0.55,
    description: "Positive in principle but blocked by access barriers. Payer decisions are the primary constraint.",
  },
  {
    name: "Workflow-Sensitive Clinicians",
    type: "workflow_sensitive",
    signalWeights: {
      signalTypes: ["Operational friction", "Workflow", "Administration complexity", "Site readiness"],
      directionBias: "negative",
      accessSensitivity: 0.4,
      workflowSensitivity: 0.95,
      evidenceThreshold: 0.5,
      competitiveSensitivity: 0.3,
    },
    baseAdoptionModifier: 0.65,
    description: "Clinical interest exists but operational complexity creates friction. Movement requires workflow simplification.",
  },
  {
    name: "Guideline-Led Adopters",
    type: "guideline_led",
    signalWeights: {
      signalTypes: ["Guideline update", "Consensus recommendation", "Clinical evidence", "Expert opinion"],
      directionBias: "positive",
      accessSensitivity: 0.3,
      workflowSensitivity: 0.3,
      evidenceThreshold: 0.8,
      competitiveSensitivity: 0.2,
    },
    baseAdoptionModifier: 0.85,
    description: "Move only after guideline endorsement. High evidence threshold but low friction sensitivity once guidelines change.",
  },
  {
    name: "Economics-Sensitive Decision-Makers",
    type: "economics_sensitive",
    signalWeights: {
      signalTypes: ["Cost-effectiveness", "Budget impact", "Value demonstration", "Payer coverage", "Access / commercial"],
      directionBias: "neutral",
      accessSensitivity: 0.8,
      workflowSensitivity: 0.3,
      evidenceThreshold: 0.5,
      competitiveSensitivity: 0.7,
    },
    baseAdoptionModifier: 0.7,
    description: "Decisions driven by economic justification. Require clear value demonstration relative to alternatives.",
  },
  {
    name: "Competitive Incumbency Defenders",
    type: "competitive_defender",
    signalWeights: {
      signalTypes: ["Competitive intelligence", "Market share", "Switching cost", "Head-to-head data"],
      directionBias: "negative",
      accessSensitivity: 0.4,
      workflowSensitivity: 0.5,
      evidenceThreshold: 0.8,
      competitiveSensitivity: 0.95,
    },
    baseAdoptionModifier: 0.45,
    description: "Entrenched with current therapy. Require compelling head-to-head differentiation to switch.",
  },
];

const REGULATORY_SEGMENT_DEFINITIONS: SegmentDefinition[] = [
  {
    name: "FDA Review Division",
    type: "fda_review_division",
    signalWeights: {
      signalTypes: ["Clinical evidence", "Phase III clinical", "Safety signal", "Regulatory", "Mechanism of action"],
      directionBias: "neutral",
      accessSensitivity: 0.05,
      workflowSensitivity: 0.05,
      evidenceThreshold: 0.9,
      competitiveSensitivity: 0.1,
    },
    baseAdoptionModifier: 1.0,
    description: "Primary regulatory review team evaluating benefit-risk balance, clinical evidence package, and label scope.",
  },
  {
    name: "Advisory Committee Members",
    type: "advisory_committee",
    signalWeights: {
      signalTypes: ["Clinical evidence", "Safety signal", "Expert opinion", "Phase III clinical", "Real-world evidence"],
      directionBias: "neutral",
      accessSensitivity: 0.05,
      workflowSensitivity: 0.05,
      evidenceThreshold: 0.85,
      competitiveSensitivity: 0.15,
    },
    baseAdoptionModifier: 0.9,
    description: "External expert panel providing recommendations on approvability, risk management, and label conditions.",
  },
  {
    name: "Sponsor Regulatory & Clinical Team",
    type: "regulatory_clinical_team",
    signalWeights: {
      signalTypes: ["Regulatory", "Clinical evidence", "Safety signal", "Phase III clinical"],
      directionBias: "positive",
      accessSensitivity: 0.1,
      workflowSensitivity: 0.1,
      evidenceThreshold: 0.7,
      competitiveSensitivity: 0.15,
    },
    baseAdoptionModifier: 1.1,
    description: "Company regulatory affairs and clinical development team managing submission, responses, and risk mitigation.",
  },
  {
    name: "Safety Reviewers",
    type: "safety_reviewers",
    signalWeights: {
      signalTypes: ["Safety signal", "Clinical evidence", "Real-world evidence", "Regulatory"],
      directionBias: "negative",
      accessSensitivity: 0.05,
      workflowSensitivity: 0.05,
      evidenceThreshold: 0.95,
      competitiveSensitivity: 0.05,
    },
    baseAdoptionModifier: 0.7,
    description: "FDA pharmacovigilance and safety evaluation specialists assessing risk signals, REMS requirements, and post-marketing obligations.",
  },
  {
    name: "Patient Advocacy Groups",
    type: "patient_advocacy",
    signalWeights: {
      signalTypes: ["Real-world evidence", "Clinical evidence", "Expert opinion"],
      directionBias: "positive",
      accessSensitivity: 0.3,
      workflowSensitivity: 0.1,
      evidenceThreshold: 0.4,
      competitiveSensitivity: 0.1,
    },
    baseAdoptionModifier: 0.8,
    description: "Patient organizations influencing advisory sentiment, public testimony, and benefit-risk framing. Active pre-approval in regulatory cases.",
  },
];

function computeSegmentAdoption(
  baseProbability: number,
  signals: any[],
  segDef: SegmentDefinition,
  depAnalysis: any,
): {
  adoptionLikelihood: number;
  confidenceLevel: string;
  drivers: string[];
  barriers: string[];
  operationalConstraints: string[];
  accessConstraints: string[];
  behavioralSignals: string[];
  upwardLevers: string[];
  movementBlockers: string[];
  positiveCount: number;
  negativeCount: number;
  evidenceDiversity: number;
  fragility: number;
} {
  const relevantSignals = signals.filter(s => {
    const sType = (s.signalType || "").toLowerCase();
    return segDef.signalWeights.signalTypes.some(t => sType.includes(t.toLowerCase()));
  });

  const signalPool = relevantSignals.length >= 2 ? relevantSignals : signals;

  const positiveSignals = signalPool.filter(s => s.direction === "Positive" && (s.likelihoodRatio ?? 1) > 1);
  const negativeSignals = signalPool.filter(s => s.direction === "Negative" && (s.likelihoodRatio ?? 1) < 1);

  const accessSignals = signals.filter(s => {
    const sType = (s.signalType || "").toLowerCase();
    return sType.includes("access") || sType.includes("payer") || sType.includes("reimbursement") || sType.includes("coverage");
  });

  const workflowSignals = signals.filter(s => {
    const sType = (s.signalType || "").toLowerCase();
    return sType.includes("workflow") || sType.includes("operational") || sType.includes("administration") || sType.includes("site");
  });

  const competitiveSignals = signals.filter(s => {
    const sType = (s.signalType || "").toLowerCase();
    return sType.includes("compet") || sType.includes("market share") || sType.includes("switching");
  });

  let modifier = segDef.baseAdoptionModifier;

  const accessNegatives = accessSignals.filter(s => s.direction === "Negative");
  if (accessNegatives.length > 0) {
    modifier -= segDef.signalWeights.accessSensitivity * 0.15 * accessNegatives.length;
  }
  const accessPositives = accessSignals.filter(s => s.direction === "Positive");
  if (accessPositives.length > 0) {
    modifier += (1 - segDef.signalWeights.accessSensitivity) * 0.1 * accessPositives.length;
  }

  const workflowNegatives = workflowSignals.filter(s => s.direction === "Negative");
  if (workflowNegatives.length > 0) {
    modifier -= segDef.signalWeights.workflowSensitivity * 0.12 * workflowNegatives.length;
  }

  const competitiveNegatives = competitiveSignals.filter(s => s.direction === "Negative");
  if (competitiveNegatives.length > 0) {
    modifier -= segDef.signalWeights.competitiveSensitivity * 0.1 * competitiveNegatives.length;
  }

  if (relevantSignals.length > 0) {
    const relevantPositive = relevantSignals.filter(s => s.direction === "Positive");
    const relevantNegative = relevantSignals.filter(s => s.direction === "Negative");
    const relevantBalance = (relevantPositive.length - relevantNegative.length) / relevantSignals.length;
    modifier += relevantBalance * 0.1;
  }

  const diversity = depAnalysis?.metrics?.evidenceDiversityScore ?? 0.5;
  if (diversity < segDef.signalWeights.evidenceThreshold) {
    modifier -= (segDef.signalWeights.evidenceThreshold - diversity) * 0.2;
  }

  modifier = Math.max(0.2, Math.min(1.5, modifier));
  let adoptionLikelihood = Math.max(0.01, Math.min(0.99, baseProbability * modifier));

  const fragility = depAnalysis?.metrics?.posteriorFragilityScore ?? 0;
  const totalSignals = signals.length;
  let confidenceLevel: string;
  if (totalSignals >= 5 && fragility < 0.2 && diversity > 0.5) {
    confidenceLevel = "High";
  } else if (totalSignals >= 3 && fragility < 0.4) {
    confidenceLevel = "Moderate";
  } else if (totalSignals >= 1) {
    confidenceLevel = "Developing";
  } else {
    confidenceLevel = "Low";
  }

  const drivers = positiveSignals
    .sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1))
    .slice(0, 4)
    .map(s => s.signalDescription?.slice(0, 120) ?? "Unnamed positive signal");

  const barriers = negativeSignals
    .sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1))
    .slice(0, 4)
    .map(s => s.signalDescription?.slice(0, 120) ?? "Unnamed barrier");

  const operationalConstraints = workflowNegatives
    .slice(0, 3)
    .map(s => s.signalDescription?.slice(0, 120) ?? "Workflow constraint");

  const accessConstraintsArr = accessNegatives
    .slice(0, 3)
    .map(s => s.signalDescription?.slice(0, 120) ?? "Access constraint");

  const behavioralSignalsArr = signals
    .filter(s => {
      const sType = (s.signalType || "").toLowerCase();
      return sType.includes("behavior") || sType.includes("attitude") || sType.includes("perception") || sType.includes("adoption");
    })
    .slice(0, 3)
    .map(s => s.signalDescription?.slice(0, 120) ?? "Behavioral signal");

  const upwardLevers: string[] = [];
  if (accessNegatives.length > 0 && segDef.signalWeights.accessSensitivity > 0.5) {
    upwardLevers.push("Resolve access barriers (payer coverage, reimbursement)");
  }
  if (workflowNegatives.length > 0 && segDef.signalWeights.workflowSensitivity > 0.5) {
    upwardLevers.push("Simplify workflow integration and reduce operational friction");
  }
  if (diversity < segDef.signalWeights.evidenceThreshold) {
    upwardLevers.push("Broaden evidence base with additional data types");
  }
  if (competitiveNegatives.length > 0 && segDef.signalWeights.competitiveSensitivity > 0.5) {
    upwardLevers.push("Generate differentiation data vs current standard of care");
  }
  if (positiveSignals.length > 0 && upwardLevers.length === 0) {
    upwardLevers.push("Maintain current trajectory; evidence base supports adoption");
  }

  const movementBlockers: string[] = [];
  if (accessNegatives.length > 0) {
    movementBlockers.push(`${accessNegatives.length} active access barrier(s) constraining adoption`);
  }
  if (workflowNegatives.length > 0) {
    movementBlockers.push(`${workflowNegatives.length} operational friction point(s) limiting uptake`);
  }
  if (competitiveNegatives.length > 0) {
    movementBlockers.push(`${competitiveNegatives.length} competitive signal(s) favoring incumbents`);
  }
  if (fragility > 0.3) {
    movementBlockers.push("High forecast fragility — conclusion could change with new evidence");
  }
  if (diversity < 0.3) {
    movementBlockers.push("Low evidence diversity — forecast rests on narrow evidence base");
  }

  return {
    adoptionLikelihood,
    confidenceLevel,
    drivers,
    barriers,
    operationalConstraints,
    accessConstraints: accessConstraintsArr,
    behavioralSignals: behavioralSignalsArr,
    upwardLevers,
    movementBlockers,
    positiveCount: positiveSignals.length,
    negativeCount: negativeSignals.length,
    evidenceDiversity: diversity,
    fragility,
  };
}

function assignPriorityTier(
  adoptionLikelihood: number,
  barriers: string[],
  movementBlockers: string[],
): { rank: number; tier: string } {
  if (adoptionLikelihood >= 0.6 && movementBlockers.length <= 1) {
    return { rank: 1, tier: "early_mover" };
  }
  if (adoptionLikelihood >= 0.4 && movementBlockers.length >= 1) {
    return { rank: 2, tier: "persuadable_blocked" };
  }
  if (adoptionLikelihood >= 0.3) {
    return { rank: 3, tier: "persuadable_effort" };
  }
  return { rank: 4, tier: "low_near_term" };
}

router.get("/cases/:caseId/adoption-segments", async (req, res) => {
  const segments = await db
    .select()
    .from(adoptionSegmentsTable)
    .where(eq(adoptionSegmentsTable.caseId, req.params.caseId))
    .orderBy(adoptionSegmentsTable.priorityRank);
  res.json(segments);
});

router.post("/cases/:caseId/adoption-segments/generate", async (req, res) => {
  const { caseId } = req.params;

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  const signals = await db
    .select()
    .from(signalsTable)
    .where(and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active")));

  if (signals.length === 0) {
    return res.status(400).json({ error: "No active signals for this case. Add signals before generating segments." });
  }

  const baseProbability = caseData.currentProbability ?? caseData.priorProbability ?? 0.5;
  const timeHorizon = caseData.timeHorizon ?? "12 months";

  let depAnalysis: any = null;
  try {
    depAnalysis = runDependencyAnalysis(signals);
  } catch (e) {
    console.error("Dependency analysis failed during segment generation:", e);
  }

  await db.delete(adoptionSegmentsTable).where(eq(adoptionSegmentsTable.caseId, caseId));

  const question = caseData.question || "";
  const useRegulatory = isRegulatoryCase(question);
  const segmentDefs = useRegulatory ? REGULATORY_SEGMENT_DEFINITIONS : SEGMENT_DEFINITIONS;

  const generatedSegments: any[] = [];

  for (const segDef of segmentDefs) {
    const result = computeSegmentAdoption(baseProbability, signals, segDef, depAnalysis);
    const priority = assignPriorityTier(result.adoptionLikelihood, result.barriers, result.movementBlockers);

    const segmentId = `SEG-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}-${segDef.type}`;

    let rationale = `${segDef.description} `;
    if (result.adoptionLikelihood > baseProbability) {
      rationale += `This segment is estimated above the base forecast (${(baseProbability * 100).toFixed(0)}%) due to favorable signal alignment. `;
    } else if (result.adoptionLikelihood < baseProbability * 0.8) {
      rationale += `This segment is estimated well below the base forecast due to structural barriers. `;
    } else {
      rationale += `This segment tracks near the base forecast. `;
    }
    if (result.movementBlockers.length > 0) {
      rationale += `Key blockers: ${result.movementBlockers.join("; ")}. `;
    }

    const segment = {
      id: randomUUID(),
      segmentId,
      caseId,
      segmentName: segDef.name,
      segmentType: segDef.type,
      adoptionLikelihood: Number(result.adoptionLikelihood.toFixed(4)),
      confidenceLevel: result.confidenceLevel,
      evidenceDiversityScore: result.evidenceDiversity != null ? Number(result.evidenceDiversity.toFixed(4)) : null,
      posteriorFragilityScore: result.fragility != null ? Number(result.fragility.toFixed(4)) : null,
      primaryDrivers: JSON.stringify(result.drivers),
      primaryBarriers: JSON.stringify(result.barriers),
      operationalConstraints: JSON.stringify(result.operationalConstraints),
      accessConstraints: JSON.stringify(result.accessConstraints),
      behavioralSignals: JSON.stringify(result.behavioralSignals),
      forecastHorizon: timeHorizon,
      priorityRank: priority.rank,
      priorityTier: priority.tier,
      rationaleSummary: rationale.trim(),
      upwardLevers: JSON.stringify(result.upwardLevers),
      movementBlockers: JSON.stringify(result.movementBlockers),
      signalCount: signals.length,
      positiveSignalCount: result.positiveCount,
      negativeSignalCount: result.negativeCount,
      derivedFrom: JSON.stringify({
        baseProbability,
        segmentModifier: segDef.baseAdoptionModifier,
        signalCount: signals.length,
        depAnalysisAvailable: depAnalysis != null,
        forecastSource: "forecast-engine-translation",
      }),
    };

    generatedSegments.push(segment);
  }

  generatedSegments.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return b.adoptionLikelihood - a.adoptionLikelihood;
  });

  generatedSegments.forEach((s, idx) => {
    s.priorityRank = idx + 1;
  });

  await db.insert(adoptionSegmentsTable).values(generatedSegments);

  res.status(201).json(generatedSegments);
});

router.get("/cases/:caseId/adoption-segments/:segmentId", async (req, res) => {
  const rows = await db
    .select()
    .from(adoptionSegmentsTable)
    .where(
      and(
        eq(adoptionSegmentsTable.caseId, req.params.caseId),
        eq(adoptionSegmentsTable.segmentId, req.params.segmentId),
      ),
    )
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Segment not found" });
  res.json(rows[0]);
});

router.get("/adoption-segments/summary", async (_req, res) => {
  const allSegments = await db
    .select()
    .from(adoptionSegmentsTable)
    .orderBy(adoptionSegmentsTable.priorityRank);

  const tierCounts = { early_mover: 0, persuadable_blocked: 0, persuadable_effort: 0, low_near_term: 0 };
  for (const s of allSegments) {
    const tier = s.priorityTier as keyof typeof tierCounts;
    if (tier in tierCounts) tierCounts[tier]++;
  }

  const caseIds = [...new Set(allSegments.map(s => s.caseId))];

  res.json({
    totalSegments: allSegments.length,
    casesWithSegments: caseIds.length,
    tierCounts,
    segmentTypes: [...new Set(allSegments.map(s => s.segmentType))],
  });
});

export default router;
