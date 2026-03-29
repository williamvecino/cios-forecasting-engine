import { Router } from "express";
import { db, casesTable, adoptionSegmentsTable, barrierDiagnosisTable, readinessTimelineTable, competitiveRiskTable, simulationScenariosTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { ModifiedVariable, FeasibilitySnapshot, ReadinessSnapshot, SegmentShift } from "@workspace/db";
import { SIGNAL_CLASSIFICATION_TYPES } from "../lib/case-type-router.js";

const router = Router();

interface ScenarioType {
  id: string;
  name: string;
  category: "access" | "workflow" | "guideline" | "kol" | "competitive" | "barrier" | "segment";
  description: string;
  variableTargets: VariableTarget[];
}

interface VariableTarget {
  target: "barrier" | "readiness" | "competitive" | "segment" | "signal";
  categoryMatch?: string[];
  field: string;
  operation: "multiply" | "add" | "set";
  value: number;
  condition?: string;
}

const SCENARIO_TAXONOMY: ScenarioType[] = [
  {
    id: "access_improvement",
    name: "Access Improvement",
    category: "access",
    description: "Payer coverage expands, prior authorization requirements reduce, formulary placement improves",
    variableTargets: [
      { target: "barrier", categoryMatch: ["access_reimbursement", "payer_resistance", "identity_role", "economics"], field: "barrierStrength", operation: "multiply", value: 0.6 },
      { target: "readiness", categoryMatch: ["payer_access", "distribution_readiness", "identity_role"], field: "readinessScore", operation: "multiply", value: 1.3 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.12, condition: "access_sensitive" },
    ],
  },
  {
    id: "access_delay",
    name: "Access Delay",
    category: "access",
    description: "Coverage decisions delayed, prior auth requirements persist, formulary barriers remain",
    variableTargets: [
      { target: "barrier", categoryMatch: ["access_reimbursement", "payer_resistance", "identity_role", "economics"], field: "barrierStrength", operation: "multiply", value: 1.4 },
      { target: "readiness", categoryMatch: ["payer_access", "distribution_readiness", "identity_role"], field: "readinessScore", operation: "multiply", value: 0.7 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.88, condition: "access_sensitive" },
    ],
  },
  {
    id: "workflow_friction_reduction",
    name: "Workflow Friction Reduction",
    category: "workflow",
    description: "Operational barriers reduced, clinical workflows simplified, staffing constraints eased",
    variableTargets: [
      { target: "barrier", categoryMatch: ["workflow_integration", "operational_complexity", "workflow_operational"], field: "barrierStrength", operation: "multiply", value: 0.5 },
      { target: "readiness", categoryMatch: ["operational_infrastructure", "clinical_workflow_integration", "workflow_operational", "workflow"], field: "readinessScore", operation: "multiply", value: 1.35 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.08, condition: "workflow_sensitive" },
    ],
  },
  {
    id: "workflow_friction_persistence",
    name: "Workflow Friction Persistence",
    category: "workflow",
    description: "Operational barriers persist, workflow integration remains complex, staffing constraints continue",
    variableTargets: [
      { target: "barrier", categoryMatch: ["workflow_integration", "operational_complexity", "workflow_operational"], field: "barrierStrength", operation: "multiply", value: 1.3 },
      { target: "readiness", categoryMatch: ["operational_infrastructure", "clinical_workflow_integration", "workflow_operational", "workflow"], field: "readinessScore", operation: "multiply", value: 0.75 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.92, condition: "workflow_sensitive" },
    ],
  },
  {
    id: "guideline_acceleration",
    name: "Guideline Acceleration",
    category: "guideline",
    description: "Society guidelines updated favorably, NCCN/institutional endorsement achieved earlier",
    variableTargets: [
      { target: "barrier", categoryMatch: ["evidence_gap", "guideline_absence", "awareness_translation"], field: "barrierStrength", operation: "multiply", value: 0.5 },
      { target: "readiness", categoryMatch: ["guideline_endorsement", "evidence_consolidation", "awareness", "guideline"], field: "readinessScore", operation: "multiply", value: 1.4 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.15, condition: "guideline_sensitive" },
    ],
  },
  {
    id: "guideline_delay",
    name: "Guideline Delay",
    category: "guideline",
    description: "Guideline update delayed, institutional endorsement postponed, evidence review pending",
    variableTargets: [
      { target: "barrier", categoryMatch: ["evidence_gap", "guideline_absence", "awareness_translation"], field: "barrierStrength", operation: "multiply", value: 1.3 },
      { target: "readiness", categoryMatch: ["guideline_endorsement", "evidence_consolidation", "awareness", "guideline"], field: "readinessScore", operation: "multiply", value: 0.7 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.87, condition: "guideline_sensitive" },
    ],
  },
  {
    id: "kol_diffusion_increase",
    name: "KOL Diffusion Increase",
    category: "kol",
    description: "Key opinion leader advocacy increases, conference presentations expand, peer influence grows",
    variableTargets: [
      { target: "barrier", categoryMatch: ["physician_skepticism", "evidence_gap", "awareness_translation", "identity_role"], field: "barrierStrength", operation: "multiply", value: 0.7 },
      { target: "readiness", categoryMatch: ["kol_advocacy", "professional_education", "awareness", "evidence_consolidation"], field: "readinessScore", operation: "multiply", value: 1.25 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.10 },
    ],
  },
  {
    id: "kol_diffusion_stagnation",
    name: "KOL Diffusion Stagnation",
    category: "kol",
    description: "KOL enthusiasm plateaus, conference coverage declines, peer influence remains limited",
    variableTargets: [
      { target: "barrier", categoryMatch: ["physician_skepticism", "evidence_gap", "awareness_translation", "identity_role"], field: "barrierStrength", operation: "multiply", value: 1.2 },
      { target: "readiness", categoryMatch: ["kol_advocacy", "professional_education", "awareness", "evidence_consolidation"], field: "readinessScore", operation: "multiply", value: 0.8 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.93 },
    ],
  },
  {
    id: "competitive_pressure_increase",
    name: "Competitive Pressure Increase",
    category: "competitive",
    description: "Competitor launches earlier, expands indication, increases defensive rebates or marketing",
    variableTargets: [
      { target: "competitive", field: "riskStrength", operation: "multiply", value: 1.4 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.88 },
    ],
  },
  {
    id: "competitive_pressure_decrease",
    name: "Competitive Pressure Decrease",
    category: "competitive",
    description: "Competitor delays, withdraws indication, safety issue emerges for competitor product",
    variableTargets: [
      { target: "competitive", field: "riskStrength", operation: "multiply", value: 0.6 },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.10 },
    ],
  },
  {
    id: "barrier_partial_resolution",
    name: "Barrier Partial Resolution",
    category: "barrier",
    description: "One or more non-structural barriers partially resolve, reducing overall barrier load",
    variableTargets: [
      { target: "barrier", categoryMatch: ["workflow_integration", "access_reimbursement", "physician_skepticism", "evidence_gap", "workflow_operational", "awareness_translation"], field: "barrierStrength", operation: "multiply", value: 0.65, condition: "non_structural" },
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.06 },
    ],
  },
  {
    id: "segment_activation",
    name: "Segment Activation",
    category: "segment",
    description: "A previously inert or blocked segment begins to move due to barrier removal or evidence accumulation",
    variableTargets: [
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 1.25, condition: "blocked_or_low" },
      { target: "barrier", field: "barrierStrength", operation: "multiply", value: 0.75 },
    ],
  },
  {
    id: "segment_inertia",
    name: "Segment Inertia",
    category: "segment",
    description: "Segments that were expected to move remain static due to persistent barriers or evidence gaps",
    variableTargets: [
      { target: "segment", field: "adoptionLikelihood", operation: "multiply", value: 0.85, condition: "mid_tier" },
      { target: "barrier", field: "barrierStrength", operation: "multiply", value: 1.15 },
    ],
  },
];

const ACCESS_CATEGORIES = ["access_reimbursement", "payer_resistance", "access / reimbursement", "payer", "economics", "identity_role"];
const WORKFLOW_CATEGORIES = ["workflow_integration", "operational_complexity", "workflow / integration", "operational", "workflow_operational", "workflow"];
const GUIDELINE_CATEGORIES = ["evidence_gap", "guideline_absence", "evidence gap", "guideline", "awareness_translation", "awareness"];
const COMPETITIVE_CATEGORIES = ["competitive_threat", "incumbent_defense", "competitive", "competitive_entrenchment"];

function matchesCategory(itemCategory: string, targetCategories: string[]): boolean {
  const norm = itemCategory.toLowerCase().replace(/[_\s/]+/g, " ").trim();
  return targetCategories.some(c => {
    const cn = c.toLowerCase().replace(/[_\s/]+/g, " ").trim();
    return norm.includes(cn) || cn.includes(norm);
  });
}

function isSegmentAccessSensitive(segType: string): boolean {
  return ["access_constrained", "economics_sensitive", "community_cautious", "payer", "late_movers", "resistant", "safety_reviewers", "prac_safety"].some(t => segType.includes(t));
}

function isSegmentWorkflowSensitive(segType: string): boolean {
  return ["workflow_sensitive", "community_high", "community_cautious", "late_movers", "operational_pragmatist"].some(t => segType.includes(t));
}

function isSegmentGuidelineSensitive(segType: string): boolean {
  return ["guideline_led", "kol_academic", "community_cautious", "late_movers", "advisory_committee", "ema_scientific_advisory", "chmp_rapporteur"].some(t => segType.includes(t));
}

function isBlockedOrLow(adoption: number, tier: string): boolean {
  return adoption < 0.3 || tier === "blocked" || tier === "monitor_only";
}

function isMidTier(adoption: number, tier: string): boolean {
  return adoption >= 0.3 && adoption <= 0.6 && (tier === "constrained_growth" || tier === "moderate_growth");
}

function applyOperation(original: number, operation: string, value: number): number {
  switch (operation) {
    case "multiply": return Math.max(0, Math.min(1, original * value));
    case "add": return Math.max(0, Math.min(1, original + value));
    case "set": return Math.max(0, Math.min(1, value));
    default: return original;
  }
}

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
  isInherited: boolean;
}

function computeFeasibilityScore(input: FeasibilityInput): number {
  const adoptionComponent = input.adoptionLikelihood * 0.30;
  const barrierComponent = (1 - Math.min(input.barrierLoad, 1)) * 0.25;
  const readinessComponent = input.readinessScore * 0.25;
  const competitiveComponent = (1 - Math.min(input.competitiveRiskLoad, 1)) * 0.20;

  let raw = adoptionComponent + barrierComponent + readinessComponent + competitiveComponent;

  const structPenalty = input.isInherited
    ? Math.min(input.structuralBarrierCount, 2) * 0.5
    : input.structuralBarrierCount;

  if (structPenalty >= 2) raw *= 0.7;
  else if (structPenalty >= 1) raw *= 0.85;

  const blockedPenalty = input.isInherited
    ? Math.floor(input.blockedMilestoneCount * 0.5)
    : input.blockedMilestoneCount;

  if (blockedPenalty >= 3) raw *= 0.75;

  return Math.max(0, Math.min(1, raw));
}

type FeasibilityTier = "high_growth" | "moderate_growth" | "constrained_growth" | "blocked" | "monitor_only";

function classifyTier(score: number, input: FeasibilityInput): FeasibilityTier {
  const effectiveStructural = input.isInherited
    ? Math.min(input.structuralBarrierCount, 2) * 0.5
    : input.structuralBarrierCount;
  const effectiveBlocked = input.isInherited
    ? Math.floor(input.blockedMilestoneCount * 0.5)
    : input.blockedMilestoneCount;

  if (score >= 0.65 && effectiveStructural < 1 && effectiveBlocked <= 1) return "high_growth";
  if (score >= 0.45 && effectiveStructural <= 1) return "moderate_growth";
  if (score >= 0.25) {
    if (effectiveStructural >= 2 && input.adoptionLikelihood < 0.5) return "blocked";
    if (effectiveBlocked >= 3 && input.readinessScore < 0.4) return "blocked";
    return "constrained_growth";
  }
  if (input.adoptionLikelihood < 0.25 && input.readinessScore < 0.3) return "monitor_only";
  if (score < 0.15) return "monitor_only";
  return "blocked";
}

function computeNearTermPotential(input: FeasibilityInput): number {
  let near = input.adoptionLikelihood * 0.4 + input.nearTermReadiness * 0.3 + (1 - input.barrierLoad) * 0.3;
  const effectiveBlocked = input.isInherited ? Math.floor(input.blockedMilestoneCount * 0.5) : input.blockedMilestoneCount;
  const effectiveStructural = input.isInherited ? Math.min(input.structuralBarrierCount, 2) * 0.5 : input.structuralBarrierCount;
  if (effectiveBlocked >= 2) near *= 0.6;
  if (effectiveStructural >= 1) near *= 0.8;
  return Math.max(0, Math.min(1, near));
}

function computeMediumTermPotential(input: FeasibilityInput): number {
  const totalBarriers = input.removableBarrierCount + input.structuralBarrierCount;
  const removableRatio = totalBarriers > 0 ? input.removableBarrierCount / totalBarriers : 0.5;
  let medium = input.adoptionLikelihood * 0.35 + input.readinessScore * 0.25 + (1 - input.competitiveRiskLoad) * 0.2 + 0.2 * removableRatio;
  if (input.removableBarrierCount >= 2) medium *= 1.1;
  return Math.max(0, Math.min(1, medium));
}

router.get("/simulation/scenarios", async (_req, res) => {
  res.json({
    scenarios: SCENARIO_TAXONOMY.map(s => ({
      id: s.id,
      name: s.name,
      category: s.category,
      description: s.description,
    })),
    count: SCENARIO_TAXONOMY.length,
  });
});

router.get("/simulation/signal-classification-types", async (_req, res) => {
  res.json({
    types: [...SIGNAL_CLASSIFICATION_TYPES],
    count: SIGNAL_CLASSIFICATION_TYPES.length,
  });
});

router.get("/simulation/cases/:caseId/history", async (req, res) => {
  try {
    const rows = await db.select().from(simulationScenariosTable)
      .where(eq(simulationScenariosTable.caseId, req.params.caseId))
      .orderBy(simulationScenariosTable.createdAt);
    res.json({ simulations: rows, count: rows.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/simulation/cases/:caseId/run", async (req, res) => {
  try {
    const { caseId } = req.params;
    const { scenarioId, scenarioName, signalClassificationType } = req.body;

    if (signalClassificationType && !SIGNAL_CLASSIFICATION_TYPES.includes(signalClassificationType)) {
      res.status(400).json({
        error: `Invalid signalClassificationType: ${signalClassificationType}`,
        validTypes: [...SIGNAL_CLASSIFICATION_TYPES],
      });
      return;
    }

    if (!scenarioId) {
      res.status(400).json({ error: "scenarioId is required" });
      return;
    }

    const scenario = SCENARIO_TAXONOMY.find(s => s.id === scenarioId);
    if (!scenario) {
      res.status(400).json({ error: `Unknown scenario: ${scenarioId}` });
      return;
    }

    const caseRows = await db.select().from(casesTable)
      .where(eq(casesTable.caseId, caseId)).limit(1);
    if (!caseRows[0]) {
      const caseByUuid = await db.select().from(casesTable)
        .where(eq(casesTable.id, caseId)).limit(1);
      if (!caseByUuid[0]) {
        res.status(404).json({ error: "Case not found" });
        return;
      }
    }
    const caseData = caseRows[0] || (await db.select().from(casesTable).where(eq(casesTable.id, caseId)).limit(1))[0];
    const effectiveCaseId = caseData.caseId || caseId;

    const [segments, barriers, readiness, competitive] = await Promise.all([
      db.select().from(adoptionSegmentsTable).where(eq(adoptionSegmentsTable.caseId, effectiveCaseId)),
      db.select().from(barrierDiagnosisTable).where(eq(barrierDiagnosisTable.caseId, effectiveCaseId)),
      db.select().from(readinessTimelineTable).where(eq(readinessTimelineTable.caseId, effectiveCaseId)),
      db.select().from(competitiveRiskTable).where(eq(competitiveRiskTable.caseId, effectiveCaseId)),
    ]);

    const baselinePosterior = caseData.currentProbability ?? 0.5;

    function computeInputsFromData(
      segs: typeof segments,
      barrs: typeof barriers,
      rdns: typeof readiness,
      comp: typeof competitive
    ) {
      const avgAdoption = segs.length > 0
        ? segs.reduce((sum, s) => sum + (s.adoptionLikelihood ?? 0), 0) / segs.length
        : baselinePosterior;

      const barrierLoad = barrs.length > 0
        ? barrs.reduce((sum, b) => sum + (b.barrierStrength ?? 0), 0) / barrs.length
        : 0;

      const readinessScore = rdns.length > 0
        ? rdns.reduce((sum, r) => sum + (r.readinessScore ?? 0), 0) / rdns.length
        : 0.5;

      const competitiveLoad = comp.length > 0
        ? comp.reduce((sum, c) => sum + (c.riskStrength ?? 0), 0) / comp.length
        : 0;

      const structuralCount = barrs.filter(b =>
        (b.removalDifficulty ?? "").toLowerCase() === "structural"
      ).length;
      const removableCount = barrs.length - structuralCount;

      const blocked = rdns.filter(r => {
        const status = (r.currentStatus ?? "").toLowerCase();
        return status.includes("blocked") || status.includes("at risk");
      });
      const onTrack = rdns.filter(r => {
        const status = (r.currentStatus ?? "").toLowerCase();
        return status.includes("on track") || status.includes("ready") || status.includes("substantially");
      });

      const nearTermReady = rdns.filter(r => {
        const window = (r.expectedTimeWindow ?? "").toLowerCase();
        return window.includes("now") || window.includes("0-3") || window.includes("3-6");
      });
      const nearTermReadiness = nearTermReady.length > 0
        ? nearTermReady.reduce((sum, r) => sum + (r.readinessScore ?? 0), 0) / nearTermReady.length
        : 0.5;

      const feasInput: FeasibilityInput = {
        adoptionLikelihood: avgAdoption,
        barrierLoad,
        readinessScore,
        competitiveRiskLoad: competitiveLoad,
        structuralBarrierCount: structuralCount,
        removableBarrierCount: removableCount,
        blockedMilestoneCount: blocked.length,
        readyMilestoneCount: onTrack.length,
        nearTermReadiness,
        isInherited: false,
      };

      const feasScore = computeFeasibilityScore(feasInput);
      const feasTier = classifyTier(feasScore, feasInput);
      const nearTerm = computeNearTermPotential(feasInput);
      const mediumTerm = computeMediumTermPotential(feasInput);

      return {
        avgAdoption,
        barrierLoad,
        readinessScore,
        competitiveLoad,
        structuralCount,
        removableCount,
        blockedCount: blocked.length,
        onTrackCount: onTrack.length,
        nearTermReadiness,
        feasInput,
        feasScore,
        feasTier,
        nearTerm,
        mediumTerm,
      };
    }

    const baselineComputed = computeInputsFromData(segments, barriers, readiness, competitive);

    const baselineFeasibilitySnap: FeasibilitySnapshot = {
      score: Number(baselineComputed.feasScore.toFixed(4)),
      tier: baselineComputed.feasTier,
      nearTermPotential: Number(baselineComputed.nearTerm.toFixed(4)),
      mediumTermPotential: Number(baselineComputed.mediumTerm.toFixed(4)),
    };

    const baselineReadinessSnap: ReadinessSnapshot = {
      overallScore: Number(baselineComputed.readinessScore.toFixed(4)),
      blockedCount: baselineComputed.blockedCount,
      onTrackCount: baselineComputed.onTrackCount,
    };

    const modifiedVariables: ModifiedVariable[] = [];
    const simulatedBarriers = barriers.map(b => ({ ...b }));
    const simulatedReadiness = readiness.map(r => ({ ...r }));
    const simulatedCompetitive = competitive.map(c => ({ ...c }));
    const simulatedSegments = segments.map(s => ({ ...s }));

    for (const varTarget of scenario.variableTargets) {
      if (varTarget.target === "barrier") {
        for (const b of simulatedBarriers) {
          const cat = (b.barrierCategory ?? "").toLowerCase();
          const isStructural = (b.removalDifficulty ?? "").toLowerCase() === "structural";

          if (varTarget.condition === "non_structural" && isStructural) continue;

          if (varTarget.categoryMatch) {
            if (!matchesCategory(cat, varTarget.categoryMatch)) continue;
          }

          const original = b.barrierStrength ?? 0;
          const newVal = applyOperation(original, varTarget.operation, varTarget.value);
          if (original !== newVal) {
            modifiedVariables.push({
              variableName: `barrier:${b.barrierName}:strength`,
              originalValue: original,
              simulatedValue: Number(newVal.toFixed(4)),
              modificationReason: scenario.description,
            });
            (b as any).barrierStrength = newVal;
          }
        }
      }

      if (varTarget.target === "readiness") {
        for (const r of simulatedReadiness) {
          const cat = (r.milestoneCategory ?? "").toLowerCase();
          if (varTarget.categoryMatch && !matchesCategory(cat, varTarget.categoryMatch)) continue;

          const original = r.readinessScore ?? 0;
          const newVal = applyOperation(original, varTarget.operation, varTarget.value);
          if (original !== newVal) {
            modifiedVariables.push({
              variableName: `readiness:${r.milestoneName}:score`,
              originalValue: original,
              simulatedValue: Number(newVal.toFixed(4)),
              modificationReason: scenario.description,
            });
            (r as any).readinessScore = newVal;
          }
        }
      }

      if (varTarget.target === "competitive") {
        for (const c of simulatedCompetitive) {
          const original = c.riskStrength ?? 0;
          const newVal = applyOperation(original, varTarget.operation, varTarget.value);
          if (original !== newVal) {
            modifiedVariables.push({
              variableName: `competitive:${c.riskName}:strength`,
              originalValue: original,
              simulatedValue: Number(newVal.toFixed(4)),
              modificationReason: scenario.description,
            });
            (c as any).riskStrength = newVal;
          }
        }
      }

      if (varTarget.target === "segment") {
        for (const s of simulatedSegments) {
          const segType = (s.segmentType ?? "").toLowerCase();
          const adoption = s.adoptionLikelihood ?? 0;
          const tier = (s.priorityTier ?? "").toLowerCase();

          if (varTarget.condition === "access_sensitive" && !isSegmentAccessSensitive(segType)) continue;
          if (varTarget.condition === "workflow_sensitive" && !isSegmentWorkflowSensitive(segType)) continue;
          if (varTarget.condition === "guideline_sensitive" && !isSegmentGuidelineSensitive(segType)) continue;
          if (varTarget.condition === "blocked_or_low" && !isBlockedOrLow(adoption, tier)) continue;
          if (varTarget.condition === "mid_tier" && !isMidTier(adoption, tier)) continue;

          const original = adoption;
          const newVal = applyOperation(original, varTarget.operation, varTarget.value);
          if (original !== newVal) {
            modifiedVariables.push({
              variableName: `segment:${s.segmentName}:adoption`,
              originalValue: original,
              simulatedValue: Number(newVal.toFixed(4)),
              modificationReason: scenario.description,
            });
            (s as any).adoptionLikelihood = newVal;
          }
        }
      }
    }

    const simComputed = computeInputsFromData(simulatedSegments, simulatedBarriers, simulatedReadiness, simulatedCompetitive);

    const simulatedFeasibilitySnap: FeasibilitySnapshot = {
      score: Number(simComputed.feasScore.toFixed(4)),
      tier: simComputed.feasTier,
      nearTermPotential: Number(simComputed.nearTerm.toFixed(4)),
      mediumTermPotential: Number(simComputed.mediumTerm.toFixed(4)),
    };

    const posteriorShift = simComputed.avgAdoption - baselineComputed.avgAdoption;
    const simulatedPosterior = Math.max(0.01, Math.min(0.99,
      baselinePosterior + posteriorShift * 0.5
    ));

    const simulatedReadinessSnap: ReadinessSnapshot = {
      overallScore: Number(simComputed.readinessScore.toFixed(4)),
      blockedCount: simComputed.blockedCount,
      onTrackCount: simComputed.onTrackCount,
    };

    const segmentShifts: SegmentShift[] = segments.map(baseline => {
      const simulated = simulatedSegments.find(s => s.segmentId === baseline.segmentId);
      if (!simulated) return null;

      const baseAdoption = baseline.adoptionLikelihood ?? 0;
      const simAdoption = simulated.adoptionLikelihood ?? 0;
      const shift = simAdoption - baseAdoption;
      const shiftMagnitude = Math.abs(shift);

      let movementDirection: SegmentShift["movementDirection"];
      if (baseAdoption < 0.15 && simAdoption >= 0.25) {
        movementDirection = "newly_activated";
      } else if (shift > 0.02) {
        movementDirection = "upward";
      } else if (shift < -0.02) {
        movementDirection = "decline";
      } else {
        movementDirection = "stable";
      }

      return {
        segmentName: baseline.segmentName ?? "",
        segmentType: baseline.segmentType ?? "",
        baselineAdoption: Number(baseAdoption.toFixed(4)),
        simulatedAdoption: Number(simAdoption.toFixed(4)),
        baselineTier: baseline.priorityTier ?? "unknown",
        simulatedTier: simulated.priorityTier ?? baseline.priorityTier ?? "unknown",
        movementDirection,
        shiftMagnitude: Number(shiftMagnitude.toFixed(4)),
      };
    }).filter(Boolean) as SegmentShift[];

    const upwardSegments = segmentShifts.filter(s => s.movementDirection === "upward" || s.movementDirection === "newly_activated");
    const declineSegments = segmentShifts.filter(s => s.movementDirection === "decline");

    const primaryDrivers: string[] = [];
    const primaryConstraints: string[] = [];

    if (upwardSegments.length > 0) {
      primaryDrivers.push(`${upwardSegments.length} segment(s) moved upward under ${scenario.name}`);
    }
    if (simComputed.barrierLoad < baselineComputed.barrierLoad) {
      primaryDrivers.push("Barrier load reduced");
    }
    if (simComputed.readinessScore > baselineComputed.readinessScore) {
      primaryDrivers.push("Readiness improved");
    }

    if (declineSegments.length > 0) {
      primaryConstraints.push(`${declineSegments.length} segment(s) declined`);
    }
    if (simComputed.barrierLoad > baselineComputed.barrierLoad) {
      primaryConstraints.push("Barrier load increased");
    }
    if (simComputed.competitiveLoad > baselineComputed.competitiveLoad) {
      primaryConstraints.push("Competitive pressure increased");
    }

    const simFeasTier = simComputed.feasTier;
    const feasScoreDelta = simComputed.feasScore - baselineComputed.feasScore;
    const posteriorDelta = simulatedPosterior - baselinePosterior;
    const impactMagnitude = Math.abs(feasScoreDelta) + Math.abs(posteriorDelta);

    let impactDirection: string;
    if (feasScoreDelta > 0.02 || posteriorDelta > 0.02) impactDirection = "positive";
    else if (feasScoreDelta < -0.02 || posteriorDelta < -0.02) impactDirection = "negative";
    else impactDirection = "neutral";

    const confidenceLevel = modifiedVariables.length >= 3 ? "Moderate" : modifiedVariables.length >= 1 ? "High" : "Low";

    const rationaleSummary = `${scenario.name}: ${modifiedVariables.length} variable(s) modified. ` +
      `Posterior shifted ${posteriorDelta >= 0 ? "+" : ""}${(posteriorDelta * 100).toFixed(1)}pp. ` +
      `Feasibility ${feasScoreDelta >= 0 ? "improved" : "declined"} by ${Math.abs(feasScoreDelta * 100).toFixed(1)}pp ` +
      `(${baselineFeasibilitySnap.tier} → ${simFeasTier}). ` +
      `${upwardSegments.length} segment(s) up, ${declineSegments.length} down, ` +
      `${segmentShifts.filter(s => s.movementDirection === "stable").length} stable.`;

    const simulationId = `SIM-${effectiveCaseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)}-${Date.now().toString(36)}`;

    const record = {
      id: randomUUID(),
      simulationId,
      caseId: effectiveCaseId,
      scenarioName: scenarioName || scenario.name,
      scenarioType: scenario.id,
      scenarioCategory: scenario.category,
      modifiedVariables,
      affectedSegments: segmentShifts.filter(s => s.movementDirection !== "stable").map(s => s.segmentName),
      baselinePosterior: Number(baselinePosterior.toFixed(4)),
      simulatedPosterior: Number(simulatedPosterior.toFixed(4)),
      baselineFeasibility: baselineFeasibilitySnap,
      simulatedFeasibility: simulatedFeasibilitySnap,
      baselineReadiness: baselineReadinessSnap,
      simulatedReadiness: simulatedReadinessSnap,
      segmentShifts,
      primaryShiftDrivers: primaryDrivers,
      primaryShiftConstraints: primaryConstraints,
      confidenceLevel,
      impactMagnitude: Number(impactMagnitude.toFixed(4)),
      impactDirection,
      rationaleSummary,
      ...(signalClassificationType ? { signalClassificationType } : {}),
    };

    await db.insert(simulationScenariosTable).values(record);

    res.json({
      simulation: record,
      signalClassificationType: signalClassificationType || null,
      baseline: {
        posterior: baselinePosterior,
        feasibility: baselineFeasibilitySnap,
        readiness: baselineReadinessSnap,
        segmentCount: segments.length,
        barrierCount: barriers.length,
        readinessMilestoneCount: readiness.length,
        competitiveRiskCount: competitive.length,
      },
      simulated: {
        posterior: simulatedPosterior,
        feasibility: simulatedFeasibilitySnap,
        readiness: simulatedReadinessSnap,
      },
      deltas: {
        posteriorDelta: Number(posteriorDelta.toFixed(4)),
        feasibilityDelta: Number(feasScoreDelta.toFixed(4)),
        readinessDelta: Number((simComputed.readinessScore - baselineComputed.readinessScore).toFixed(4)),
      },
      segmentShifts,
      modifiedVariables,
    });
  } catch (err: any) {
    console.error("[simulation-engine] Error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
