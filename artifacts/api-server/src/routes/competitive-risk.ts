import { Router } from "express";
import { db, competitiveRiskTable, casesTable, signalsTable, adoptionSegmentsTable, barrierDiagnosisTable, readinessTimelineTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { runDependencyAnalysis } from "../lib/signal-dependency-engine.js";

const router = Router();

interface RiskCategoryDef {
  key: string;
  label: string;
  signalPatterns: string[];
  barrierCategories: string[];
  structuralDefault: boolean;
  threatMechanismTemplate: string;
  description: string;
}

const RISK_CATEGORIES: RiskCategoryDef[] = [
  {
    key: "incumbent_entrenchment",
    label: "Incumbent Entrenchment",
    signalPatterns: ["incumbent", "entrenched", "standard of care", "established", "market leader", "dominant", "switching cost"],
    barrierCategories: ["competitive_entrenchment", "guideline_soc_inertia"],
    structuralDefault: true,
    threatMechanismTemplate: "Established competitor holds deep prescriber loyalty, guideline positioning, and payer contracts that create high switching barriers.",
    description: "Deeply entrenched competitor making displacement extremely difficult without step-change differentiation.",
  },
  {
    key: "superior_differentiation",
    label: "Superior Competitor Differentiation",
    signalPatterns: ["differentiat", "superior", "head-to-head", "outperform", "better efficacy", "better safety", "advantage"],
    barrierCategories: ["competitive_entrenchment", "evidence_data_quality"],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor demonstrates clinically meaningful advantages on key endpoints, undermining the asset's value proposition.",
    description: "Competitor has demonstrable clinical or commercial advantages that weaken the asset's positioning.",
  },
  {
    key: "guideline_lockout",
    label: "Guideline Lockout / First-Mover Advantage",
    signalPatterns: ["guideline", "first-mover", "first-in-class", "recommendation", "nccn", "asco", "category a", "preferred"],
    barrierCategories: ["guideline_soc_inertia"],
    structuralDefault: true,
    threatMechanismTemplate: "Competitor achieved guideline inclusion first, creating a structural preference that new entrants must overcome with substantially stronger evidence.",
    description: "Competitor secured guideline positioning first, creating structural prescribing preference.",
  },
  {
    key: "access_disadvantage",
    label: "Access / Formulary Disadvantage",
    signalPatterns: ["formulary", "access", "tier", "step therapy", "prior auth", "restricted", "non-preferred", "coverage denial"],
    barrierCategories: ["access_reimbursement", "economic_budget"],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor has favorable formulary position, lower tier placement, or fewer access restrictions, giving it a structural access advantage.",
    description: "Competitor holds superior payer access position through contracts, pricing, or formulary tier.",
  },
  {
    key: "field_force_disadvantage",
    label: "Commercial Field Force Disadvantage",
    signalPatterns: ["field force", "sales", "representative", "commercial", "promotion", "share of voice", "detailing"],
    barrierCategories: [],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor has larger, better-positioned, or more experienced field force with deeper account relationships.",
    description: "Competitor commercial execution capability exceeds asset team's ability to compete for prescriber attention.",
  },
  {
    key: "kol_advocacy_capture",
    label: "KOL / Advocacy Capture",
    signalPatterns: ["kol", "key opinion", "advocacy", "speaker", "advisory", "champion", "thought leader", "expert endorse"],
    barrierCategories: ["awareness_translation", "identity_role"],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor has captured key opinion leaders and advocacy networks, limiting the asset's ability to build peer influence and credibility.",
    description: "Competitor controls KOL relationships and advocacy channels that influence prescribing decisions.",
  },
  {
    key: "workflow_preference",
    label: "Workflow Preference for Existing Standard",
    signalPatterns: ["workflow", "convenience", "administration", "oral", "subcutaneous", "infusion", "dosing frequency", "simpler"],
    barrierCategories: ["workflow_operational"],
    structuralDefault: true,
    threatMechanismTemplate: "Existing treatment has workflow advantages (route, frequency, monitoring) that create practical resistance to switching.",
    description: "Competitor treatment has operational/workflow advantages that create prescriber and site-level preference.",
  },
  {
    key: "category_crowding",
    label: "Category Crowding / Confusion",
    signalPatterns: ["crowded", "multiple", "category", "confusion", "many options", "differentiation gap", "similar", "me-too"],
    barrierCategories: ["awareness_translation"],
    structuralDefault: false,
    threatMechanismTemplate: "Multiple competitors in the category dilute attention, differentiation, and prescriber willingness to evaluate yet another option.",
    description: "Crowded therapeutic category reduces differentiation clarity and prescriber willingness to evaluate new entrants.",
  },
  {
    key: "evidence_acceleration",
    label: "Competitor Evidence Acceleration",
    signalPatterns: ["competitor data", "competitor trial", "competitor evidence", "competitor publication", "competitor phase", "competitor approval"],
    barrierCategories: ["evidence_data_quality"],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor is generating new evidence faster, expanding indications, or publishing supportive data that shifts the evidence landscape.",
    description: "Competitor is outpacing the asset in evidence generation, publication, or regulatory milestones.",
  },
  {
    key: "pricing_contracting",
    label: "Pricing / Contracting Pressure",
    signalPatterns: ["price", "pricing", "discount", "rebate", "contract", "value", "cost-effective", "biosimilar", "generic", "loe"],
    barrierCategories: ["economic_budget", "access_reimbursement"],
    structuralDefault: false,
    threatMechanismTemplate: "Competitor pricing or contracting strategy creates economic pressure that undermines the asset's value proposition or access position.",
    description: "Competitor uses pricing, rebates, or contracting to create economic disadvantage for the asset.",
  },
  {
    key: "channel_account_control",
    label: "Channel / Account Control",
    signalPatterns: ["account", "channel", "exclusive", "partnership", "distribution", "network", "pathway", "preferred vendor"],
    barrierCategories: ["access_reimbursement", "workflow_operational"],
    structuralDefault: true,
    threatMechanismTemplate: "Competitor has established exclusive or preferred relationships with key accounts, distribution channels, or specialty networks.",
    description: "Competitor controls key distribution channels or account relationships that limit the asset's commercial reach.",
  },
  {
    key: "switching_inertia",
    label: "Switching Inertia",
    signalPatterns: ["switching", "inertia", "loyalty", "habit", "familiar", "comfort", "stable patient", "continue current"],
    barrierCategories: ["competitive_entrenchment", "clinical_reasoning"],
    structuralDefault: true,
    threatMechanismTemplate: "Prescribers and patients are reluctant to switch from a stable, familiar treatment even when clinical evidence supports a change.",
    description: "Behavioral inertia — prescribers resist switching from known treatments to unfamiliar alternatives.",
  },
];

const SEGMENT_RISK_PROFILES: Record<string, {
  amplifiedRisks: string[];
  dampened: string[];
  primaryExposures: string[];
}> = {
  kol_academic: {
    amplifiedRisks: ["superior_differentiation", "evidence_acceleration", "guideline_lockout"],
    dampened: ["access_disadvantage", "field_force_disadvantage", "pricing_contracting"],
    primaryExposures: ["evidence_acceleration", "kol_advocacy_capture", "guideline_lockout"],
  },
  community_high: {
    amplifiedRisks: ["guideline_lockout", "access_disadvantage", "incumbent_entrenchment"],
    dampened: ["kol_advocacy_capture"],
    primaryExposures: ["guideline_lockout", "access_disadvantage", "switching_inertia"],
  },
  community_cautious: {
    amplifiedRisks: ["switching_inertia", "workflow_preference", "category_crowding"],
    dampened: ["evidence_acceleration"],
    primaryExposures: ["switching_inertia", "workflow_preference", "incumbent_entrenchment"],
  },
  access_constrained: {
    amplifiedRisks: ["access_disadvantage", "pricing_contracting", "channel_account_control"],
    dampened: ["kol_advocacy_capture", "evidence_acceleration"],
    primaryExposures: ["access_disadvantage", "pricing_contracting", "channel_account_control"],
  },
  workflow_sensitive: {
    amplifiedRisks: ["workflow_preference", "switching_inertia"],
    dampened: ["guideline_lockout", "kol_advocacy_capture"],
    primaryExposures: ["workflow_preference", "switching_inertia", "incumbent_entrenchment"],
  },
  guideline_led: {
    amplifiedRisks: ["guideline_lockout", "evidence_acceleration", "superior_differentiation"],
    dampened: ["field_force_disadvantage", "pricing_contracting"],
    primaryExposures: ["guideline_lockout", "incumbent_entrenchment", "evidence_acceleration"],
  },
  economics_sensitive: {
    amplifiedRisks: ["pricing_contracting", "access_disadvantage", "channel_account_control"],
    dampened: ["kol_advocacy_capture", "superior_differentiation"],
    primaryExposures: ["pricing_contracting", "access_disadvantage", "incumbent_entrenchment"],
  },
  competitive_defender: {
    amplifiedRisks: ["incumbent_entrenchment", "switching_inertia", "channel_account_control"],
    dampened: ["category_crowding"],
    primaryExposures: ["incumbent_entrenchment", "switching_inertia", "kol_advocacy_capture"],
  },
};

function classifySignalToRisks(signal: any): string[] {
  const combined = `${signal.signalType || ""} ${signal.signalDescription || ""}`.toLowerCase();
  const matched: string[] = [];
  for (const cat of RISK_CATEGORIES) {
    if (cat.signalPatterns.some(p => combined.includes(p))) {
      matched.push(cat.key);
    }
  }
  return matched.length > 0 ? matched : [];
}

function computeRiskStrength(
  negativeSignals: any[],
  counterSignals: any[],
  barriers: any[],
  segProfile: typeof SEGMENT_RISK_PROFILES[string] | null,
  categoryKey: string,
): number {
  if (negativeSignals.length === 0 && barriers.length === 0) return 0;

  let signalBase = 0;
  for (const s of negativeSignals) {
    const lr = s.likelihoodRatio ?? 1;
    const impact = lr < 1 ? (1 - lr) : 0;
    const strength = s.strengthScore ?? 0.5;
    signalBase += impact * strength;
  }
  signalBase = Math.min(0.6, signalBase / Math.max(1, negativeSignals.length) * 1.5);

  let barrierBase = 0;
  for (const b of barriers) {
    barrierBase += (b.barrierStrength ?? 0.3) * 0.3;
  }
  barrierBase = Math.min(0.4, barrierBase);

  let total = signalBase + barrierBase;

  if (negativeSignals.length === 0 && barriers.length > 0) {
    total = barrierBase * 0.6;
  }

  if (counterSignals.length > 0) {
    const counterWeight = Math.min(0.35, counterSignals.length * 0.08);
    total *= (1 - counterWeight);
  }

  if (segProfile) {
    if (segProfile.amplifiedRisks.includes(categoryKey)) {
      total = Math.min(0.99, total * 1.35);
    }
    if (segProfile.dampened.includes(categoryKey)) {
      total *= 0.55;
    }
  }

  return Math.min(0.99, total);
}

function determineStructuralVsEmerging(
  catDef: RiskCategoryDef,
  strength: number,
  barrierCount: number,
): "structural" | "emerging" | "watch_list" {
  if (catDef.structuralDefault && strength >= 0.3) return "structural";
  if (strength >= 0.4 && !catDef.structuralDefault) return "emerging";
  if (strength >= 0.2) return "emerging";
  return "watch_list";
}

function determineConfidence(signalCount: number, diversity: number, fragility: number): string {
  if (signalCount >= 4 && diversity > 0.5 && fragility < 0.2) return "High";
  if (signalCount >= 2 && fragility < 0.4) return "Moderate";
  if (signalCount >= 1) return "Developing";
  return "Low";
}

function estimateForecastImpact(
  riskStrength: number,
  isStructural: boolean,
  baseProbability: number,
): number {
  const maxImpact = isStructural ? 0.12 : 0.18;
  const impact = riskStrength * maxImpact * baseProbability;
  return Math.max(0.01, Math.min(0.25, impact));
}

function classifyPriority(
  strength: number,
  structuralVsEmerging: string,
  impact: number,
  isEcho: boolean,
): { priorityClass: string; rank: number } {
  if (isEcho) return { priorityClass: "downstream_echo", rank: 5 };
  if ((strength >= 0.4 || impact >= 0.05) && structuralVsEmerging === "structural") return { priorityClass: "high_impact_structural", rank: 1 };
  if ((strength >= 0.4 || impact >= 0.05) && structuralVsEmerging === "emerging") return { priorityClass: "high_impact_emerging", rank: 2 };
  if (strength >= 0.2) return { priorityClass: "segment_specific", rank: 3 };
  return { priorityClass: "watch_list", rank: 4 };
}

function generateThreatMechanism(catDef: RiskCategoryDef, topSignals: any[], barriers: any[]): string {
  let mechanism = catDef.threatMechanismTemplate;
  if (topSignals.length > 0 && topSignals[0].signalDescription) {
    const desc = (topSignals[0].signalDescription as string).slice(0, 100);
    mechanism += ` Key signal: "${desc}".`;
  }
  if (barriers.length > 0) {
    mechanism += ` Reinforced by ${barriers.length} active barrier${barriers.length !== 1 ? "s" : ""}.`;
  }
  return mechanism;
}

function generateWhyItMatters(catDef: RiskCategoryDef, strength: number, impact: number, segmentName?: string): string {
  let base = catDef.description;
  if (strength >= 0.6) {
    base += ` This is a strong competitive risk (${(strength * 100).toFixed(0)}% intensity) with estimated ${(impact * 100).toFixed(1)}pp forecast impact.`;
  } else if (strength >= 0.3) {
    base += ` Moderate competitive risk with estimated ${(impact * 100).toFixed(1)}pp forecast impact.`;
  } else {
    base += ` Currently a developing risk worth monitoring.`;
  }
  if (segmentName) {
    base += ` For ${segmentName}, this competitive pressure is particularly relevant.`;
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

function diagnoseCompetitiveRisks(
  signals: any[],
  barriers: any[],
  readinessMilestones: any[],
  baseProbability: number,
  depAnalysis: any,
  segmentId: string | null,
  segmentName: string | null,
  segmentType: string | null,
  caseId: string,
): any[] {
  const segSignals = filterSignalsForSegment(signals, segmentType);
  const diversity = depAnalysis?.metrics?.evidenceDiversityScore ?? 0.5;
  const fragility = depAnalysis?.metrics?.posteriorFragilityScore ?? 0;
  const segProfile = segmentType ? SEGMENT_RISK_PROFILES[segmentType] ?? null : null;

  const negativeSignals = segSignals.filter(s => {
    const dir = s.direction;
    const lr = s.likelihoodRatio ?? 1;
    return dir === "Negative" && lr < 1;
  });
  const positiveSignals = segSignals.filter(s => {
    const dir = s.direction;
    const lr = s.likelihoodRatio ?? 1;
    return dir === "Positive" && lr > 1;
  });

  const riskBuckets: Record<string, { negative: any[]; counter: any[]; barriers: any[] }> = {};
  for (const cat of RISK_CATEGORIES) {
    riskBuckets[cat.key] = { negative: [], counter: [], barriers: [] };
  }

  for (const sig of negativeSignals) {
    const cats = classifySignalToRisks(sig);
    for (const c of cats) {
      if (riskBuckets[c]) riskBuckets[c].negative.push(sig);
    }
  }

  for (const sig of positiveSignals) {
    const cats = classifySignalToRisks(sig);
    for (const c of cats) {
      if (riskBuckets[c]) riskBuckets[c].counter.push(sig);
    }
  }

  for (const b of barriers) {
    for (const cat of RISK_CATEGORIES) {
      if (cat.barrierCategories.includes(b.barrierCategory)) {
        riskBuckets[cat.key].barriers.push(b);
      }
    }
  }

  const blockedMilestones = readinessMilestones.filter(
    m => m.currentStatus === "blocked" || m.currentStatus === "unlikely_within_horizon"
  );

  const risks: any[] = [];

  for (const catDef of RISK_CATEGORIES) {
    const bucket = riskBuckets[catDef.key];
    const totalEvidence = bucket.negative.length + bucket.barriers.length;

    if (totalEvidence === 0) continue;

    const strength = computeRiskStrength(bucket.negative, bucket.counter, bucket.barriers, segProfile, catDef.key);
    if (strength < 0.03) continue;

    const isEcho = bucket.negative.length > 0 && bucket.negative.every(s =>
      (s.echoVsTranslation || "").toLowerCase() === "echo" ||
      (s.dependencyRole || "").toLowerCase() === "downstream"
    );

    const isStructural = catDef.structuralDefault && strength >= 0.3;
    const structuralVsEmerging = determineStructuralVsEmerging(catDef, strength, bucket.barriers.length);
    const impact = estimateForecastImpact(strength, isStructural, baseProbability);
    const confidence = determineConfidence(bucket.negative.length + bucket.barriers.length, diversity, fragility);
    const { priorityClass, rank } = classifyPriority(strength, structuralVsEmerging, impact, isEcho);

    const topNeg = [...bucket.negative].sort((a, b) => (a.likelihoodRatio ?? 1) - (b.likelihoodRatio ?? 1));
    const topCounter = [...bucket.counter].sort((a, b) => (b.likelihoodRatio ?? 1) - (a.likelihoodRatio ?? 1));

    const threatMechanism = generateThreatMechanism(catDef, topNeg, bucket.barriers);
    const whyItMatters = generateWhyItMatters(catDef, strength, impact, segmentName ?? undefined);

    let riskName = catDef.label;
    if (topNeg.length > 0 && topNeg[0].signalDescription) {
      const desc = topNeg[0].signalDescription as string;
      if (desc.length <= 80) riskName = desc;
      else riskName = desc.slice(0, 77) + "…";
    }

    let rationale = `${catDef.label} risk detected. `;
    rationale += `${bucket.negative.length} negative signal${bucket.negative.length !== 1 ? "s" : ""}, `;
    rationale += `${bucket.barriers.length} reinforcing barrier${bucket.barriers.length !== 1 ? "s" : ""}. `;
    if (bucket.counter.length > 0) {
      rationale += `${bucket.counter.length} counter-signal${bucket.counter.length !== 1 ? "s" : ""} partially offset. `;
    }
    if (isEcho) {
      rationale += "All supporting signals appear to be downstream echoes. ";
    }
    if (segProfile?.amplifiedRisks.includes(catDef.key)) {
      rationale += `This risk category is amplified for ${segmentName ?? "this segment"}. `;
    }

    const relatedBlocked = blockedMilestones.filter(m => {
      let deps: string[] = [];
      try { deps = JSON.parse(m.dependsOnMilestones || "[]"); } catch { deps = []; }
      return catDef.barrierCategories.some(bc =>
        m.milestoneCategory === bc || deps.includes(bc)
      );
    });
    if (relatedBlocked.length > 0) {
      rationale += `Linked to ${relatedBlocked.length} blocked readiness milestone${relatedBlocked.length !== 1 ? "s" : ""}. `;
    }

    risks.push({
      id: randomUUID(),
      competitiveRiskId: `CRISK-${caseId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8)}-${segmentId ? segmentId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6) + "-" : ""}${catDef.key}`,
      caseId,
      segmentId,
      segmentName,
      riskName,
      riskCategory: catDef.key,
      riskStrength: Number(strength.toFixed(4)),
      riskConfidence: confidence,
      riskScope: segmentId ? "segment" : "overall",
      primarySignals: JSON.stringify(
        topNeg.slice(0, 5).map(s => ({
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
      threatMechanism,
      whyItMatters,
      structuralVsEmerging,
      estimatedForecastImpact: Number(impact.toFixed(4)),
      priorityRank: rank,
      priorityClass,
      rationaleSummary: rationale,
      signalCount: bucket.negative.length,
      counterSignalCount: bucket.counter.length,
      derivedFrom: JSON.stringify({
        baseProbability,
        categoryKey: catDef.key,
        segmentType: segmentType ?? "overall",
        barrierCount: bucket.barriers.length,
        blockedMilestoneCount: relatedBlocked.length,
        depAnalysisAvailable: depAnalysis != null,
      }),
    });
  }

  risks.sort((a, b) => {
    if (a.priorityRank !== b.priorityRank) return a.priorityRank - b.priorityRank;
    return b.riskStrength - a.riskStrength;
  });
  risks.forEach((r, idx) => { r.priorityRank = idx + 1; });

  return risks;
}

router.get("/cases/:caseId/competitive-risk", async (req, res) => {
  const risks = await db
    .select()
    .from(competitiveRiskTable)
    .where(eq(competitiveRiskTable.caseId, req.params.caseId))
    .orderBy(competitiveRiskTable.priorityRank);
  res.json(risks);
});

router.post("/cases/:caseId/competitive-risk/generate", async (req, res) => {
  const { caseId } = req.params;

  const caseRows = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRows[0]) return res.status(404).json({ error: "Case not found" });
  const caseData = caseRows[0];

  const signals = await db
    .select()
    .from(signalsTable)
    .where(and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active")));

  if (signals.length === 0) {
    return res.status(400).json({ error: "No active signals for this case. Add signals before generating competitive risk analysis." });
  }

  const baseProbability = caseData.currentProbability ?? caseData.priorProbability ?? 0.5;

  let depAnalysis: any = null;
  try {
    depAnalysis = runDependencyAnalysis(signals);
  } catch (e) {
    console.error("Dependency analysis failed during competitive risk:", e);
  }

  const barriers = await db
    .select()
    .from(barrierDiagnosisTable)
    .where(eq(barrierDiagnosisTable.caseId, caseId));

  const readinessMilestones = await db
    .select()
    .from(readinessTimelineTable)
    .where(eq(readinessTimelineTable.caseId, caseId));

  const overallBarriers = barriers.filter(b => !b.segmentId);
  const overallMilestones = readinessMilestones.filter(m => !m.segmentId);

  await db.delete(competitiveRiskTable).where(eq(competitiveRiskTable.caseId, caseId));

  const overallRisks = diagnoseCompetitiveRisks(
    signals, overallBarriers, overallMilestones, baseProbability, depAnalysis,
    null, null, null, caseId,
  );

  const segments = await db
    .select()
    .from(adoptionSegmentsTable)
    .where(eq(adoptionSegmentsTable.caseId, caseId))
    .orderBy(adoptionSegmentsTable.priorityRank);

  const segmentRisks: any[] = [];
  for (const seg of segments) {
    const segBarriers = barriers.filter(b => b.segmentId === seg.segmentId);
    const segMilestones = readinessMilestones.filter(m => m.segmentId === seg.segmentId);
    const effectiveBarriers = segBarriers.length > 0 ? segBarriers : overallBarriers;
    const effectiveMilestones = segMilestones.length > 0 ? segMilestones : overallMilestones;

    const segRisks = diagnoseCompetitiveRisks(
      signals, effectiveBarriers, effectiveMilestones, seg.adoptionLikelihood, depAnalysis,
      seg.segmentId, seg.segmentName, seg.segmentType, caseId,
    );
    segmentRisks.push(...segRisks);
  }

  const allRisks = [...overallRisks, ...segmentRisks];

  if (allRisks.length > 0) {
    await db.insert(competitiveRiskTable).values(allRisks);
  }

  const structuralCount = overallRisks.filter(r => r.structuralVsEmerging === "structural").length;
  const emergingCount = overallRisks.filter(r => r.structuralVsEmerging === "emerging").length;
  const watchListCount = overallRisks.filter(r => r.structuralVsEmerging === "watch_list").length;

  const mostExposedSegment = segments.length > 0
    ? segments.reduce((worst, seg) => {
        const segRs = segmentRisks.filter(r => r.segmentId === seg.segmentId);
        const avgStrength = segRs.length > 0
          ? segRs.reduce((sum: number, r: any) => sum + r.riskStrength, 0) / segRs.length
          : 0;
        if (avgStrength > (worst.avgStrength ?? 0)) {
          return { segmentName: seg.segmentName, avgStrength };
        }
        return worst;
      }, { segmentName: null as string | null, avgStrength: 0 })
    : null;

  res.status(201).json({
    overall: overallRisks,
    bySegment: segments.reduce((acc: Record<string, any[]>, seg) => {
      acc[seg.segmentName] = segmentRisks.filter(r => r.segmentId === seg.segmentId);
      return acc;
    }, {}),
    summary: {
      totalRisks: allRisks.length,
      overallCount: overallRisks.length,
      segmentCount: segmentRisks.length,
      structuralCount,
      emergingCount,
      watchListCount,
      topRisk: overallRisks[0] ?? null,
      mostExposedSegment: mostExposedSegment?.segmentName ?? null,
      categoryDistribution: RISK_CATEGORIES.reduce((acc: Record<string, number>, cat) => {
        acc[cat.label] = allRisks.filter(r => r.riskCategory === cat.key).length;
        return acc;
      }, {}),
    },
  });
});

router.get("/competitive-risk/categories", (_req, res) => {
  res.json(
    RISK_CATEGORIES.map(c => ({
      key: c.key,
      label: c.label,
      description: c.description,
      structuralDefault: c.structuralDefault,
    })),
  );
});

export default router;
