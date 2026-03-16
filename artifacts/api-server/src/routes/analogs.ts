import { Router } from "express";
import { db } from "@workspace/db";
import { caseLibraryTable, casesTable } from "@workspace/db";
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

router.get("/cases/:caseId/analogs", async (req, res) => {
  const caseRow = await db.select().from(casesTable).where(eq(casesTable.caseId, req.params.caseId)).limit(1);
  const library = await db.select().from(caseLibraryTable);

  const row = caseRow[0] as any;
  const query = {
    therapyArea: row?.therapeuticArea || row?.primaryBrand,
    specialty: row?.specialty || row?.primarySpecialtyProfile,
    productType: row?.assetType || "Medication",
    evidenceType: "Phase 3 RCT",
    specialtyProfile: row?.primarySpecialtyProfile,
    payerEnvironment: row?.payerEnvironment ?? undefined,
    primaryBrand: (row?.assetName || row?.primaryBrand) ?? undefined,
  };

  const matches = retrieveAnalogs(query, library, 5);
  res.json(matches);
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
