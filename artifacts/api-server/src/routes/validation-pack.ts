import { Router } from "express";
import { db } from "@workspace/db";
import { casesTable, signalsTable } from "@workspace/db";
import { eq, inArray, count } from "drizzle-orm";
import { VALIDATION_CASES, buildCaseInsert, buildSignalInserts } from "../lib/validation-pack.js";

const router = Router();

const VP_CASE_IDS = VALIDATION_CASES.map((vc) => vc.case.caseId);

router.get("/validation-pack/status", async (_req, res) => {
  try {
    const existingCases = await db
      .select({ caseId: casesTable.caseId })
      .from(casesTable)
      .where(inArray(casesTable.caseId, VP_CASE_IDS));

    const signalCounts = await db
      .select({ caseId: signalsTable.caseId, cnt: count() })
      .from(signalsTable)
      .where(inArray(signalsTable.caseId, VP_CASE_IDS))
      .groupBy(signalsTable.caseId);

    const caseSet = new Set(existingCases.map((r) => r.caseId));
    const sigMap = new Map(signalCounts.map((r) => [r.caseId, Number(r.cnt)]));

    const cases = VALIDATION_CASES.map((vc) => {
      const hasCase = caseSet.has(vc.case.caseId);
      const dbSignals = sigMap.get(vc.case.caseId) ?? 0;
      return {
        caseId: vc.case.caseId,
        assetName: vc.case.assetName,
        therapeuticArea: vc.case.therapeuticArea,
        archetype: getArchetype(vc.case.caseId),
        seeded: hasCase && dbSignals === vc.signals.length,
        signalCount: vc.signals.length,
        dbSignalCount: dbSignals,
      };
    });

    const seededCount = cases.filter((c) => c.seeded).length;
    res.json({ total: VP_CASE_IDS.length, seeded: seededCount, cases });
  } catch (err: any) {
    console.error("[validation-pack] status error:", err);
    res.status(500).json({ error: "Failed to fetch validation pack status" });
  }
});

router.post("/validation-pack/seed", async (_req, res) => {
  try {
    const results: { caseId: string; status: string; signalsCreated: number }[] = [];

    for (const vc of VALIDATION_CASES) {
      const existing = await db
        .select({ caseId: casesTable.caseId })
        .from(casesTable)
        .where(eq(casesTable.caseId, vc.case.caseId));

      const sigCount = await db
        .select({ cnt: count() })
        .from(signalsTable)
        .where(eq(signalsTable.caseId, vc.case.caseId));

      const hasCase = existing.length > 0;
      const dbSigs = Number(sigCount[0]?.cnt ?? 0);
      const expectedSigs = vc.signals.length;

      if (hasCase && dbSigs === expectedSigs) {
        results.push({ caseId: vc.case.caseId, status: "already_exists", signalsCreated: 0 });
        continue;
      }

      await db.transaction(async (tx) => {
        if (hasCase) {
          await tx.delete(signalsTable).where(eq(signalsTable.caseId, vc.case.caseId));
          await tx.delete(casesTable).where(eq(casesTable.caseId, vc.case.caseId));
        }

        const caseInsert = buildCaseInsert(vc.case);
        await tx.insert(casesTable).values(caseInsert);

        const signalInserts = buildSignalInserts(vc.case.caseId, vc.signals);
        for (const sig of signalInserts) {
          await tx.insert(signalsTable).values(sig);
        }
      });

      results.push({
        caseId: vc.case.caseId,
        status: hasCase ? "repaired" : "created",
        signalsCreated: expectedSigs,
      });
    }

    res.status(201).json({ results });
  } catch (err: any) {
    console.error("[validation-pack] seed error:", err);
    res.status(500).json({ error: "Failed to seed validation pack" });
  }
});

router.delete("/validation-pack/reset", async (_req, res) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Reset is not available in production" });
  }

  try {
    await db.transaction(async (tx) => {
      for (const caseId of VP_CASE_IDS) {
        await tx.delete(signalsTable).where(eq(signalsTable.caseId, caseId));
        await tx.delete(casesTable).where(eq(casesTable.caseId, caseId));
      }
    });
    res.json({ message: "Validation pack cases and signals deleted", casesRemoved: VP_CASE_IDS.length });
  } catch (err: any) {
    console.error("[validation-pack] reset error:", err);
    res.status(500).json({ error: "Failed to reset validation pack" });
  }
});

function getArchetype(caseId: string): string {
  if (caseId.includes("REGULATORY")) return "Regulatory";
  if (caseId.includes("LAUNCH")) return "Launch / Generic Entry";
  if (caseId.includes("ADOPTION")) return "Physician Adoption";
  if (caseId.includes("COMPETITIVE")) return "Competitive Positioning";
  if (caseId.includes("BARRIER")) return "Barrier / Access Friction";
  return "Unknown";
}

export default router;
