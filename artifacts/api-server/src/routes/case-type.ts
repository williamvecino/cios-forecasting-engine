import { Router } from "express";
import { db, casesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { classifyCaseType, ALL_CASE_TYPES, getCaseTypeDriverDomains } from "../lib/case-type-classifier.js";
import { deriveQuestionType } from "../lib/case-context.js";

const router = Router();

router.get("/cases/:caseId/case-type", async (req, res) => {
  try {
    const { caseId } = req.params;
    const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
    if (!caseRow) return res.status(404).json({ error: "Case not found" });

    const questionType = deriveQuestionType(caseRow.strategicQuestion);
    const result = classifyCaseType({
      strategicQuestion: caseRow.strategicQuestion,
      therapeuticArea: caseRow.therapeuticArea,
      diseaseState: caseRow.diseaseState,
      assetName: caseRow.assetName,
      questionType,
      timeHorizon: caseRow.timeHorizon,
      payerEnvironment: caseRow.payerEnvironment,
      competitorProfile: caseRow.competitorProfile,
    });

    res.json({
      ok: true,
      caseId,
      questionType,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    res.status(500).json({ error: message });
  }
});

router.get("/case-types/catalog", (_req, res) => {
  res.json({
    ok: true,
    caseTypes: ALL_CASE_TYPES,
    totalTypes: ALL_CASE_TYPES.length,
  });
});

router.get("/case-types/:caseType/drivers", (req, res) => {
  const { caseType } = req.params;
  const drivers = getCaseTypeDriverDomains(caseType as any);
  const typeInfo = ALL_CASE_TYPES.find(t => t.type === caseType);

  if (!typeInfo) {
    return res.status(404).json({ error: `Unknown case type: ${caseType}` });
  }

  res.json({
    ok: true,
    caseType,
    description: typeInfo.description,
    driverDomains: drivers,
  });
});

export default router;
