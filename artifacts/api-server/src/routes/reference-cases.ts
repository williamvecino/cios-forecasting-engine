import { Router } from "express";
import { db, referenceCasesTable, forecastLedgerTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const SEED_CASES = [
  {
    referenceCaseId: "REF-001",
    caseName: "Orphan Pulmonary — Strong Clinical, Slow Access",
    decisionDomain: "Rare disease / Orphan",
    questionText: "Will the orphan drug achieve target specialist adoption within 12 months given strong Phase III data but limited payer coverage?",
    comparisonGroups: JSON.stringify(["Rapid adoption", "Slow adoption"]),
    forecastHorizon: "12 months",
    initialForecast: 0.72,
    finalForecast: 0.58,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.35,
    posteriorFragilityScore: 0.42,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 4,
    keyDrivers: JSON.stringify([
      { desc: "Phase III met primary endpoint with statistical significance", lr: 2.4 },
      { desc: "KOL endorsement at major pulmonary conference", lr: 1.8 },
      { desc: "Orphan drug designation provided regulatory pathway advantage", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Payer prior authorization requirements created 6-week delays", lr: 0.65 },
      { desc: "Community pulmonologists unfamiliar with nebulized delivery protocol", lr: 0.72 },
      { desc: "Specialty pharmacy distribution limited to 3 networks", lr: 0.78 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 4, echoes: 2, translations: 1 },
      { cluster: "KOL opinion", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "Adoption reached 60% of target at 12 months",
    resolutionType: "partially_resolved",
    brierScore: 0.0196,
    calibrationLesson: "Clinical strength alone did not overcome workflow friction in community settings. Payer access barriers and unfamiliar delivery protocols created adoption ceilings that strong efficacy data could not breach within the forecast horizon.",
    biasPattern: "KOL enthusiasm inflation",
    structuralTags: JSON.stringify(["strong clinical / weak access", "workflow friction", "payer resistance", "specialty ownership mismatch"]),
    caseSummary: "Strong Phase III data and KOL enthusiasm drove initial high confidence, but payer access friction and community workflow unfamiliarity created a persistent adoption ceiling. The forecast overestimated how quickly clinical evidence would translate to practice change."
  },
  {
    referenceCaseId: "REF-002",
    caseName: "Oncology Biosimilar — Competitive Disruption Success",
    decisionDomain: "Oncology",
    questionText: "Will the biosimilar achieve formulary placement in top 20 health systems within 6 months of launch?",
    comparisonGroups: JSON.stringify(["Rapid formulary placement", "Delayed formulary placement"]),
    forecastHorizon: "6 months",
    initialForecast: 0.55,
    finalForecast: 0.82,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.6,
    posteriorFragilityScore: 0.25,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 6,
    keyDrivers: JSON.stringify([
      { desc: "30% cost advantage over reference biologic", lr: 2.1 },
      { desc: "FDA interchangeability designation removed switching barriers", lr: 1.9 },
      { desc: "Three large GPOs announced preferred status", lr: 1.7 },
      { desc: "Reference biologic manufacturer did not counter with rebates", lr: 1.4 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Oncologist preference for originator in treatment-naive patients", lr: 0.82 },
      { desc: "Limited real-world safety data at launch", lr: 0.88 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Regulatory evidence", count: 2, echoes: 0, translations: 1 }
    ]),
    outcome: "Achieved formulary placement in 17 of top 20 systems by month 5",
    resolutionType: "resolved_true",
    brierScore: 0.0324,
    calibrationLesson: "Interchangeability designation combined with cost advantage created faster formulary uptake than initial forecasts predicted. The initial forecast underweighted the GPO channel effect and overweighted physician brand loyalty.",
    biasPattern: "Early underconfidence corrected by access signals",
    structuralTags: JSON.stringify(["competitive disruption", "strong clinical / weak access", "payer resistance"]),
    caseSummary: "Initial skepticism about biosimilar adoption in oncology was overcome by interchangeability status, GPO endorsement, and the reference manufacturer's failure to offer competitive rebates. Access signals proved more predictive than physician sentiment."
  },
  {
    referenceCaseId: "REF-003",
    caseName: "CNS Launch — False Confidence Collapse",
    decisionDomain: "CNS / Psychiatry",
    questionText: "Will the novel antipsychotic achieve 15% market share within 18 months given differentiated mechanism of action?",
    comparisonGroups: JSON.stringify(["Rapid share gain", "Slow share gain"]),
    forecastHorizon: "18 months",
    initialForecast: 0.78,
    finalForecast: 0.31,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.2,
    posteriorFragilityScore: 0.68,
    concentrationPenalty: 0.36,
    independentEvidenceFamilyCount: 2,
    keyDrivers: JSON.stringify([
      { desc: "Novel mechanism differentiation from existing antipsychotics", lr: 2.2 },
      { desc: "Favorable metabolic side effect profile vs competitors", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Step therapy requirements in 70% of commercial plans", lr: 0.45 },
      { desc: "Psychiatrists required REMS certification for prescribing", lr: 0.52 },
      { desc: "Patient identification workflow incompatible with community practice", lr: 0.61 },
      { desc: "Competitor launched branded generic at 40% lower price", lr: 0.55 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 3, echoes: 2, translations: 0 },
      { cluster: "KOL opinion", count: 2, echoes: 2, translations: 0 }
    ]),
    outcome: "Achieved 4% market share at 18 months — well below target",
    resolutionType: "resolved_false",
    brierScore: 0.4761,
    calibrationLesson: "High initial confidence was driven by a narrow evidence base concentrated in clinical trial data and KOL enthusiasm. The forecast failed to weight access barriers, REMS friction, and competitive pricing. Evidence diversity was critically low — all supportive signals traced to the same clinical program.",
    biasPattern: "False diversity — multiple signals traced to single evidence source",
    structuralTags: JSON.stringify(["false diversity", "early overconfidence", "workflow friction", "payer resistance", "competitive disruption"]),
    caseSummary: "The novel mechanism generated strong clinical enthusiasm but the forecast was built on concentrated evidence from a single trial program. Access barriers, REMS requirements, and competitive pricing created insurmountable friction that clinical differentiation could not overcome."
  },
  {
    referenceCaseId: "REF-004",
    caseName: "Immunology — Guideline Acceleration",
    decisionDomain: "Immunology / Rheumatology",
    questionText: "Will updated ACR guidelines recommending the biologic as first-line accelerate adoption among community rheumatologists within 12 months?",
    comparisonGroups: JSON.stringify(["Guideline-driven acceleration", "No material change"]),
    forecastHorizon: "12 months",
    initialForecast: 0.62,
    finalForecast: 0.79,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.55,
    posteriorFragilityScore: 0.18,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 5,
    keyDrivers: JSON.stringify([
      { desc: "ACR guideline update explicitly recommended as first-line option", lr: 2.5 },
      { desc: "Real-world registry data confirmed trial efficacy in community patients", lr: 1.7 },
      { desc: "Payer coverage expanded following guideline inclusion", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Community rheumatologists slow to adopt guideline changes historically", lr: 0.78 },
      { desc: "Infusion scheduling capacity constrained at community sites", lr: 0.82 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Guideline/regulatory evidence", count: 2, echoes: 0, translations: 1 },
      { cluster: "Real-world evidence", count: 3, echoes: 1, translations: 1 }
    ]),
    outcome: "Adoption increased 35% year-over-year in community settings",
    resolutionType: "resolved_true",
    brierScore: 0.0441,
    calibrationLesson: "Guideline endorsement created a payer coverage cascade that amplified adoption beyond direct physician behavior change. The forecast initially underweighted the indirect payer effect of guideline inclusion.",
    biasPattern: "Underweighting guideline cascade effects",
    structuralTags: JSON.stringify(["guideline acceleration", "strong clinical / weak access", "operational constraint"]),
    caseSummary: "ACR guideline inclusion triggered a cascade: payer coverage expanded, removing the primary adoption barrier. The direct effect on physician prescribing was moderate, but the indirect payer pathway amplified adoption significantly."
  },
  {
    referenceCaseId: "REF-005",
    caseName: "Gene Therapy — Operational Constraint Ceiling",
    decisionDomain: "Rare disease / Gene therapy",
    questionText: "Will the gene therapy achieve 50 treated patients in year one despite manufacturing and site-readiness constraints?",
    comparisonGroups: JSON.stringify(["On-track delivery", "Delayed delivery"]),
    forecastHorizon: "12 months",
    initialForecast: 0.65,
    finalForecast: 0.38,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.3,
    posteriorFragilityScore: 0.55,
    concentrationPenalty: 0.1,
    independentEvidenceFamilyCount: 3,
    keyDrivers: JSON.stringify([
      { desc: "Breakthrough therapy designation and strong clinical efficacy", lr: 2.3 },
      { desc: "Patient advocacy groups driving urgent referral volume", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Manufacturing capacity limited to 80 doses per year globally", lr: 0.55 },
      { desc: "Only 12 certified treatment centers operational at launch", lr: 0.6 },
      { desc: "Apheresis scheduling required 8-week lead time", lr: 0.7 },
      { desc: "Insurance pre-authorization for gene therapy averaged 14 weeks", lr: 0.5 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 2, echoes: 1, translations: 0 },
      { cluster: "Manufacturing/supply evidence", count: 3, echoes: 0, translations: 2 }
    ]),
    outcome: "22 patients treated in year one — 44% of target",
    resolutionType: "partially_resolved",
    brierScore: 0.0729,
    calibrationLesson: "Operational constraints — manufacturing throughput, site certification, and insurance authorization timelines — created a hard ceiling on adoption that no amount of clinical demand could overcome. The forecast overweighted demand signals relative to supply-side constraints.",
    biasPattern: "Demand-side bias — ignoring supply constraints",
    structuralTags: JSON.stringify(["supply / manufacturing constraint", "operational constraint", "workflow friction", "payer resistance"]),
    caseSummary: "Extraordinary clinical demand existed but was throttled by manufacturing capacity, site readiness, and insurance authorization timelines. The forecast correctly identified demand but failed to model the supply-side ceiling."
  },
  {
    referenceCaseId: "REF-006",
    caseName: "Cardiovascular — Canonical Success",
    decisionDomain: "Cardiovascular",
    questionText: "Will the PCSK9 inhibitor achieve broad formulary access within 12 months following outcomes trial publication?",
    comparisonGroups: JSON.stringify(["Broad access achieved", "Access remains restricted"]),
    forecastHorizon: "12 months",
    initialForecast: 0.7,
    finalForecast: 0.75,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.7,
    posteriorFragilityScore: 0.12,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 7,
    keyDrivers: JSON.stringify([
      { desc: "Cardiovascular outcomes trial showed 15% MACE reduction", lr: 2.6 },
      { desc: "Updated AHA/ACC guidelines incorporated outcomes data", lr: 2.0 },
      { desc: "Manufacturer reduced list price by 60%", lr: 1.8 },
      { desc: "PBMs removed prior authorization for high-risk patients", lr: 1.6 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Primary care physicians slow to initiate specialty medications", lr: 0.8 },
      { desc: "Patient injection burden reduced adherence in some segments", lr: 0.85 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 3, echoes: 0, translations: 1 },
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 },
      { cluster: "Guideline/regulatory evidence", count: 2, echoes: 0, translations: 1 }
    ]),
    outcome: "Formulary access expanded from 30% to 78% of commercial lives within 10 months",
    resolutionType: "resolved_true",
    brierScore: 0.0625,
    calibrationLesson: "Convergence of outcomes data, guideline update, and price reduction created a multi-signal reinforcement pattern. When independent evidence families align across clinical, economic, and regulatory domains, forecasts should weight the convergence signal itself.",
    biasPattern: "None — well-calibrated multi-source forecast",
    structuralTags: JSON.stringify(["guideline acceleration", "strong clinical / weak access"]),
    caseSummary: "A textbook case of well-calibrated forecasting. Multiple independent evidence sources (outcomes trial, guideline update, price reduction, PBM action) converged to support broad access. High evidence diversity and low fragility produced an accurate forecast."
  },
  {
    referenceCaseId: "REF-007",
    caseName: "Rare Disease — Access-Constrained Despite Strong Evidence",
    decisionDomain: "Rare disease / Metabolic",
    questionText: "Will the enzyme replacement therapy achieve target enrollment in the first year despite $500K annual cost?",
    comparisonGroups: JSON.stringify(["Enrollment on track", "Enrollment delayed"]),
    forecastHorizon: "12 months",
    initialForecast: 0.6,
    finalForecast: 0.42,
    confidenceLevel: "Moderate",
    evidenceDiversityScore: 0.4,
    posteriorFragilityScore: 0.35,
    concentrationPenalty: 0,
    independentEvidenceFamilyCount: 4,
    keyDrivers: JSON.stringify([
      { desc: "Only approved therapy for the condition", lr: 2.0 },
      { desc: "Patient advocacy groups actively supporting enrollment", lr: 1.5 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Annual cost of $500K triggered intensive utilization management", lr: 0.45 },
      { desc: "Insurance denials required multiple appeals averaging 4 months", lr: 0.55 },
      { desc: "Copay assistance programs capped, leaving residual patient burden", lr: 0.7 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "Clinical trial evidence", count: 2, echoes: 1, translations: 0 },
      { cluster: "Economic/payer evidence", count: 3, echoes: 1, translations: 1 }
    ]),
    outcome: "Enrollment reached 65% of target at 12 months due to payer delays",
    resolutionType: "partially_resolved",
    brierScore: 0.0324,
    calibrationLesson: "Ultra-high-cost therapies face systematic payer friction regardless of clinical necessity. The insurance appeal timeline creates a structural delay that should be modeled as a hard constraint on the adoption rate, not as a signal that might or might not materialize.",
    biasPattern: "Underweighting cost-driven payer friction",
    structuralTags: JSON.stringify(["payer resistance", "strong clinical / weak access", "operational constraint"]),
    caseSummary: "Clinical evidence was strong and the therapy was the only option, but the $500K price triggered systematic payer resistance. Insurance denial and appeal timelines created a structural delay that limited enrollment regardless of clinical demand."
  },
  {
    referenceCaseId: "REF-008",
    caseName: "Specialty Oral — KOL Enthusiasm vs Community Reality",
    decisionDomain: "Gastroenterology",
    questionText: "Will the oral biologic achieve 20% switch rate from injectable competitors within 12 months?",
    comparisonGroups: JSON.stringify(["High switch rate", "Low switch rate"]),
    forecastHorizon: "12 months",
    initialForecast: 0.74,
    finalForecast: 0.45,
    confidenceLevel: "High",
    evidenceDiversityScore: 0.25,
    posteriorFragilityScore: 0.6,
    concentrationPenalty: 0.2,
    independentEvidenceFamilyCount: 3,
    keyDrivers: JSON.stringify([
      { desc: "KOLs presented compelling switch data at DDW conference", lr: 2.1 },
      { desc: "Patient preference surveys strongly favored oral route", lr: 1.7 }
    ]),
    keyConstraints: JSON.stringify([
      { desc: "Community GIs concerned about efficacy loss on switch", lr: 0.6 },
      { desc: "Prior authorization required for switch — not new starts", lr: 0.65 },
      { desc: "Competitor injectable manufacturer offered loyalty rebates", lr: 0.7 }
    ]),
    majorLineageClusters: JSON.stringify([
      { cluster: "KOL opinion", count: 3, echoes: 2, translations: 0 },
      { cluster: "Patient preference data", count: 2, echoes: 1, translations: 0 }
    ]),
    outcome: "Switch rate reached 9% at 12 months — well below target",
    resolutionType: "resolved_false",
    brierScore: 0.2025,
    calibrationLesson: "KOL enthusiasm and patient preference data created a concentrated evidence base that overestimated community physician willingness to switch stable patients. The forecast treated KOL opinion and patient preference as independent evidence families when they were structurally correlated.",
    biasPattern: "KOL enthusiasm inflation",
    structuralTags: JSON.stringify(["KOL enthusiasm inflation", "false diversity", "early overconfidence", "competitive disruption"]),
    caseSummary: "KOL enthusiasm at conferences did not translate to community practice. Community GIs were reluctant to switch stable patients, payer barriers added friction, and competitor rebates protected incumbent share. The evidence base was concentrated in correlated KOL and patient preference signals."
  },
];

async function seedReferenceCases() {
  const existing = await db.select({ id: referenceCasesTable.referenceCaseId }).from(referenceCasesTable);
  const existingIds = new Set(existing.map(e => e.id));
  const toInsert = SEED_CASES.filter(c => !existingIds.has(c.referenceCaseId));

  if (toInsert.length === 0) return;

  for (const c of toInsert) {
    await db.insert(referenceCasesTable).values({
      id: randomUUID(),
      ...c,
    }).onConflictDoNothing();
  }
  console.log(`[reference-cases] Seeded ${toInsert.length} reference cases.`);
}

seedReferenceCases().catch(err => console.error("[reference-cases] Seed error:", err));

router.get("/reference-cases", async (_req, res) => {
  const cases = await db.select().from(referenceCasesTable).orderBy(referenceCasesTable.caseName);
  res.json(cases);
});

router.get("/reference-cases/tags/all", async (_req, res) => {
  const cases = await db.select({ structuralTags: referenceCasesTable.structuralTags }).from(referenceCasesTable);
  const tagSet = new Set<string>();
  for (const c of cases) {
    try {
      const tags: string[] = JSON.parse(c.structuralTags || "[]");
      tags.forEach(t => tagSet.add(t));
    } catch {}
  }
  res.json([...tagSet].sort());
});

router.get("/reference-cases/similar/:predictionId", async (req, res) => {
  const ledgerRows = await db.select().from(forecastLedgerTable)
    .where(eq(forecastLedgerTable.predictionId, req.params.predictionId))
    .limit(1);

  if (!ledgerRows[0]) return res.status(404).json({ error: "Ledger entry not found" });
  const entry = ledgerRows[0];

  const allRef = await db.select().from(referenceCasesTable);
  if (allRef.length === 0) return res.json([]);

  const scored = allRef.map(ref => {
    let score = 0;

    if (entry.decisionDomain && ref.decisionDomain) {
      const eDomain = entry.decisionDomain.toLowerCase();
      const rDomain = ref.decisionDomain.toLowerCase();
      if (eDomain === rDomain) score += 3;
      else if (eDomain.includes(rDomain) || rDomain.includes(eDomain)) score += 1.5;
    }

    if (entry.confidenceLevel && ref.confidenceLevel) {
      if (entry.confidenceLevel === ref.confidenceLevel) score += 1;
    }

    if (entry.evidenceDiversityScore != null && ref.evidenceDiversityScore != null) {
      const diff = Math.abs(entry.evidenceDiversityScore - ref.evidenceDiversityScore);
      if (diff <= 0.15) score += 2;
      else if (diff <= 0.3) score += 1;
    }

    if (entry.posteriorFragilityScore != null && ref.posteriorFragilityScore != null) {
      const diff = Math.abs(entry.posteriorFragilityScore - ref.posteriorFragilityScore);
      if (diff <= 0.15) score += 2;
      else if (diff <= 0.3) score += 1;
    }

    if (entry.forecastProbability != null && ref.finalForecast != null) {
      const diff = Math.abs(entry.forecastProbability - ref.finalForecast);
      if (diff <= 0.1) score += 1.5;
      else if (diff <= 0.2) score += 0.75;
    }

    if (entry.confidenceCeilingApplied != null && ref.concentrationPenalty != null && ref.concentrationPenalty > 0) {
      score += 1;
    }

    return {
      referenceCaseId: ref.referenceCaseId,
      caseName: ref.caseName,
      similarityScore: Number(score.toFixed(2)),
      matchReasons: [] as string[],
      calibrationLesson: ref.calibrationLesson,
      biasPattern: ref.biasPattern,
      structuralTags: ref.structuralTags,
      outcome: ref.outcome,
      brierScore: ref.brierScore,
      finalForecast: ref.finalForecast,
    };
  });

  const filtered = scored
    .filter(s => s.similarityScore >= 2)
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .slice(0, 5);

  res.json(filtered);
});

interface ChallengeCaseDefinition {
  referenceCaseId: string;
  caseName: string;
  expectedProbabilityRange: { min: number; max: number };
  tolerancePp: number;
  validationCriteria: string[];
}

const CHALLENGE_CASES: ChallengeCaseDefinition[] = [
  {
    referenceCaseId: "REF-001",
    caseName: "Orphan Pulmonary — Strong Clinical, Slow Access",
    expectedProbabilityRange: { min: 0.53, max: 0.63 },
    tolerancePp: 5,
    validationCriteria: [
      "Forecast reflects payer access barriers constraining clinical strength",
      "Workflow friction identified as adoption ceiling factor",
      "Initial probability not inflated by KOL enthusiasm alone",
    ],
  },
  {
    referenceCaseId: "REF-002",
    caseName: "Oncology Biosimilar — Competitive Disruption",
    expectedProbabilityRange: { min: 0.77, max: 0.87 },
    tolerancePp: 5,
    validationCriteria: [
      "Interchangeability designation weighted appropriately",
      "GPO channel effect reflected in probability",
      "Physician brand loyalty not overweighted vs access signals",
    ],
  },
];

router.get("/reference-cases/challenge-library", async (_req, res) => {
  try {
    res.json({ challengeCases: CHALLENGE_CASES, count: CHALLENGE_CASES.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/reference-cases/:referenceCaseId", async (req, res) => {
  const rows = await db.select().from(referenceCasesTable)
    .where(eq(referenceCasesTable.referenceCaseId, req.params.referenceCaseId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Reference case not found" });
  res.json(rows[0]);
});

router.post("/reference-cases/challenge-validate", async (req, res) => {
  try {
    const { referenceCaseId, actualProbability } = req.body;
    if (!referenceCaseId || actualProbability == null) {
      res.status(400).json({ error: "referenceCaseId and actualProbability are required" });
      return;
    }

    const challenge = CHALLENGE_CASES.find(c => c.referenceCaseId === referenceCaseId);
    if (!challenge) {
      res.status(404).json({ error: `No challenge case found for ${referenceCaseId}` });
      return;
    }

    const toleranceDecimal = challenge.tolerancePp / 100;
    const effectiveMin = challenge.expectedProbabilityRange.min - toleranceDecimal;
    const effectiveMax = challenge.expectedProbabilityRange.max + toleranceDecimal;
    const withinRange = actualProbability >= effectiveMin && actualProbability <= effectiveMax;

    const deviation = actualProbability < challenge.expectedProbabilityRange.min
      ? challenge.expectedProbabilityRange.min - actualProbability
      : actualProbability > challenge.expectedProbabilityRange.max
        ? actualProbability - challenge.expectedProbabilityRange.max
        : 0;

    let grade: "pass" | "marginal" | "fail";
    if (deviation === 0) {
      grade = "pass";
    } else if (deviation <= toleranceDecimal) {
      grade = "marginal";
    } else {
      grade = "fail";
    }

    res.json({
      referenceCaseId,
      caseName: challenge.caseName,
      actualProbability,
      expectedRange: challenge.expectedProbabilityRange,
      tolerancePp: challenge.tolerancePp,
      effectiveRange: { min: effectiveMin, max: effectiveMax },
      withinRange,
      deviationPp: Math.round(deviation * 100),
      grade,
      validationCriteria: challenge.validationCriteria,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
