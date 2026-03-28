import { Router } from "express";
import { db } from "@workspace/db";
import { caseLibraryTable, casesTable, signalsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { retrieveAnalogs } from "../lib/analog-engine.js";

const router = Router();

router.get("/case-library", async (_req, res) => {
  const rows = await db.select().from(caseLibraryTable).orderBy(caseLibraryTable.createdAt);
  res.json(rows);
});

router.post("/case-library", async (req, res) => {
  const body = req.body;
  const [created] = await db.insert(caseLibraryTable).values({
    id: randomUUID(),
    caseId: body.caseId || `ANALOG-${Date.now()}`,
    therapyArea: body.therapyArea,
    productType: body.productType,
    specialty: body.specialty,
    evidenceType: body.evidenceType,
    lifecycleStage: body.lifecycleStage,
    actorMix: body.actorMix,
    marketAccessConditions: body.marketAccessConditions,
    outcomePattern: body.outcomePattern,
    adoptionTrajectory: body.adoptionTrajectory,
    keyInflectionSignals: body.keyInflectionSignals,
    finalObservedOutcome: body.finalObservedOutcome,
    finalProbability: body.finalProbability,
    notes: body.notes,
  }).returning();
  res.status(201).json(created);
});

router.put("/case-library/:analogId", async (req, res) => {
  const body = req.body;
  const [updated] = await db.update(caseLibraryTable)
    .set({
      therapyArea: body.therapyArea,
      productType: body.productType,
      specialty: body.specialty,
      evidenceType: body.evidenceType,
      lifecycleStage: body.lifecycleStage,
      actorMix: body.actorMix,
      marketAccessConditions: body.marketAccessConditions,
      outcomePattern: body.outcomePattern,
      adoptionTrajectory: body.adoptionTrajectory,
      keyInflectionSignals: body.keyInflectionSignals,
      finalObservedOutcome: body.finalObservedOutcome,
      finalProbability: body.finalProbability,
      notes: body.notes,
    })
    .where(eq(caseLibraryTable.id, req.params.analogId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.delete("/case-library/:analogId", async (req, res) => {
  await db.delete(caseLibraryTable).where(eq(caseLibraryTable.id, req.params.analogId));
  res.status(204).send();
});

// Derive evidenceType from the active signal types on this case
function deriveEvidenceType(signalTypes: string[]): string {
  if (signalTypes.includes("Phase III clinical")) return "Phase III RCT";
  if (signalTypes.includes("Regulatory / clinical")) return "Regulatory/Clinical Evidence";
  if (signalTypes.includes("Guideline inclusion")) return "Guideline-Backed Evidence";
  if (signalTypes.includes("KOL endorsement")) return "KOL/Expert Evidence";
  return "Real-World Evidence";
}

router.get("/cases/:caseId/analogs", async (req, res) => {
  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, req.params.caseId));
  const library = await db.select().from(caseLibraryTable);

  const row = caseRow as any;
  const signalTypes = signals.map((s) => s.signalType).filter(Boolean) as string[];

  const query = {
    therapyArea: row?.therapeuticArea || row?.primaryBrand,
    specialty: row?.specialty || row?.primarySpecialtyProfile,
    diseaseState: row?.diseaseState ?? undefined,
    productType: row?.assetType || "Medication",
    evidenceType: deriveEvidenceType(signalTypes),
    specialtyProfile: row?.primarySpecialtyProfile,
    payerEnvironment: row?.payerEnvironment ?? undefined,
    primaryBrand: (row?.assetName || row?.primaryBrand) ?? undefined,
  };

  const matches = retrieveAnalogs(query, library, 5);
  res.json(matches);
});

// Analog Context — enriched response with scenario frames derived from matched analogs
router.get("/cases/:caseId/analog-context", async (req, res) => {
  const { caseId } = req.params;

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const [signals, library] = await Promise.all([
    db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId)),
    db.select().from(caseLibraryTable),
  ]);

  const signalTypes = signals.map((s) => s.signalType).filter(Boolean) as string[];
  const derivedEvidenceType = deriveEvidenceType(signalTypes);

  const row = caseRow as any;
  const query = {
    therapyArea: row.therapeuticArea || row.primaryBrand,
    specialty: row.specialty || row.primarySpecialtyProfile,
    diseaseState: row.diseaseState ?? undefined,
    productType: row.assetType || "Medication",
    evidenceType: derivedEvidenceType,
    specialtyProfile: row.primarySpecialtyProfile,
    payerEnvironment: row.payerEnvironment ?? undefined,
    primaryBrand: row.assetName || row.primaryBrand,
  };

  const matches = retrieveAnalogs(query, library, 5);

  // Compute scenario frames from analogs that have a finalProbability
  const calibrated = matches.filter(
    (m) => m.analogCase.finalProbability !== null && m.similarityScore >= 15
  );

  let optimistic: object | null = null;
  let pessimistic: object | null = null;
  let base: object | null = null;

  if (calibrated.length > 0) {
    const sorted = [...calibrated].sort(
      (a, b) => Number(b.analogCase.finalProbability) - Number(a.analogCase.finalProbability)
    );
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    // Weighted-average base probability
    const weightedSum = calibrated.reduce(
      (s, m) => s + Number(m.analogCase.finalProbability) * m.similarityScore,
      0
    );
    const weightSum = calibrated.reduce((s, m) => s + m.similarityScore, 0);
    const baseProbability = weightSum > 0 ? weightedSum / weightSum : null;

    optimistic = {
      probability: Number((Number(best.analogCase.finalProbability) * 100).toFixed(1)),
      analogCaseId: best.analogCase.caseId,
      similarityScore: best.similarityScore,
      rationale: best.analogCase.adoptionTrajectory
        ?? best.analogCase.outcomePattern
        ?? "Strongest analog achieved high adoption via favourable market conditions.",
      keyDifferences: best.keyDifferences,
    };
    pessimistic = {
      probability: Number((Number(worst.analogCase.finalProbability) * 100).toFixed(1)),
      analogCaseId: worst.analogCase.caseId,
      similarityScore: worst.similarityScore,
      rationale: worst.analogCase.adoptionTrajectory
        ?? worst.analogCase.outcomePattern
        ?? "Weaker analog showed constrained adoption due to access or competitive headwinds.",
      keyDifferences: worst.keyDifferences,
    };
    if (baseProbability !== null) {
      base = {
        probability: Number((baseProbability * 100).toFixed(1)),
        rationale: `Similarity-weighted average across ${calibrated.length} calibrated analog${calibrated.length !== 1 ? "s" : ""}.`,
        sampleSize: calibrated.length,
      };
    }
  }

  res.json({
    derivedEvidenceType,
    signalTypes,
    matchCount: matches.length,
    calibratedCount: calibrated.length,
    topMatches: matches.slice(0, 3).map((m) => ({
      caseId: m.analogCase.caseId,
      therapyArea: m.analogCase.therapyArea,
      specialty: m.analogCase.specialty,
      productType: m.analogCase.productType,
      evidenceType: m.analogCase.evidenceType,
      assetName: m.analogCase.assetName || null,
      diseaseState: m.analogCase.diseaseState || null,
      finalObservedOutcome: m.analogCase.finalObservedOutcome || null,
      keyBarrier: m.analogCase.keyBarrier || null,
      keyEnabler: m.analogCase.keyEnabler || null,
      similarityScore: m.similarityScore,
      confidenceBand: m.confidenceBand,
      matchedDimensions: m.matchedDimensions,
      keyDifferences: m.keyDifferences,
      adoptionLesson: m.adoptionLesson,
      finalProbability: m.analogCase.finalProbability,
    })),
    scenarios: { optimistic, base, pessimistic },
  });
});

// Pattern summaries — concrete rule-based classification of recurring patterns
router.get("/patterns", async (_req, res) => {
  const library = await db.select().from(caseLibraryTable);

  const PATTERNS = [
    {
      id: "strong_evidence_slow_payer",
      label: "Strong clinical evidence — slow payer uptake",
      description: "Robust Phase III data drove strong specialist enthusiasm, but restrictive payer policies created 12–18 month access lag before broad community uptake.",
      keywords: ["payer", "prior auth", "formulary", "access", "denied", "restriction"],
      signalTypes: ["Phase III clinical", "Access / commercial"],
    },
    {
      id: "kol_enthusiasm_community_lag",
      label: "KOL enthusiasm — community specialist lag",
      description: "Academic KOLs and congress presentations generated early buzz, but community specialists waited for real-world evidence and guideline endorsement before broad adoption.",
      keywords: ["community", "lag", "guideline", "kol", "conference", "congress"],
      signalTypes: ["KOL endorsement", "Guideline inclusion"],
    },
    {
      id: "efficacy_offset_safety",
      label: "Positive efficacy offset by safety narrative",
      description: "Strong efficacy signal was partially neutralised by an evolving safety narrative, creating a risk–benefit calculation that slowed initial prescribing.",
      keywords: ["safety", "adverse", "black box", "warning", "risk", "toxicity"],
      signalTypes: ["Phase III clinical", "Regulatory / clinical"],
    },
    {
      id: "convenience_specialist",
      label: "Convenience advantage driving specialist uptake",
      description: "Once-daily, subcutaneous, or oral formulation created a convenience differentiation that accelerated prescribing in specialist-heavy markets with high treatment burden.",
      keywords: ["convenience", "oral", "once-daily", "administration", "formulation", "burden"],
      signalTypes: ["Field intelligence", "Operational friction"],
    },
    {
      id: "competitor_delay",
      label: "Competitive counter-messaging delaying adoption",
      description: "Incumbent product and competitor field force created doubt about comparative value, requiring additional real-world evidence to overcome prescriber hesitancy.",
      keywords: ["competitor", "incumbent", "counter", "messaging", "market share", "challenge"],
      signalTypes: ["Competitor counteraction", "Field intelligence"],
    },
  ];

  const patternResults = PATTERNS.map((pattern) => {
    const matchingCases = library.filter((c) => {
      const text = [c.outcomePattern, c.finalObservedOutcome, c.keyInflectionSignals, c.adoptionTrajectory, c.notes]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return pattern.keywords.some((kw) => text.includes(kw));
    });

    return {
      id: pattern.id,
      label: pattern.label,
      description: pattern.description,
      signalTypes: pattern.signalTypes,
      caseCount: matchingCases.length,
      exampleCases: matchingCases.slice(0, 2).map((c) => ({
        caseId: c.caseId,
        therapyArea: c.therapyArea,
        finalOutcome: c.finalObservedOutcome ?? c.outcomePattern ?? null,
        finalProbability: c.finalProbability,
      })),
    };
  }).sort((a, b) => b.caseCount - a.caseCount);

  res.json(patternResults);
});

export default router;
