import { Router } from "express";
import { db, caseFeedbackTable, casesTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const VALID_STEPS = ["Define", "Add Information", "Judge", "Decide", "Respond", "Simulate", "Resolve", "General"] as const;
const VALID_IMPACTS = ["Critical", "High", "Medium", "Low"] as const;
const VALID_CATEGORIES = [
  "Driver selection",
  "Dependency control",
  "Confidence logic",
  "UI rendering",
  "Workflow logic",
  "Reaction weighting",
  "Translation strength",
  "Case typing",
  "Data pipeline",
  "Other",
] as const;
const VALID_REPRODUCIBLE = ["Yes", "No", "Unknown"] as const;
const VALID_STATUSES = ["Open", "Triaged", "Fixed", "Retest needed"] as const;

router.get("/cases/:caseId/feedback", async (req, res) => {
  const rows = await db
    .select()
    .from(caseFeedbackTable)
    .where(eq(caseFeedbackTable.caseId, req.params.caseId))
    .orderBy(desc(caseFeedbackTable.createdAt));
  res.json(rows);
});

router.post("/cases/:caseId/feedback", async (req, res) => {
  const { caseId } = req.params;
  const body = req.body;

  if (!body.step || !VALID_STEPS.includes(body.step)) {
    return res.status(400).json({ error: `step must be one of: ${VALID_STEPS.join(", ")}` });
  }
  if (!body.observedBehavior?.trim()) {
    return res.status(400).json({ error: "observedBehavior is required" });
  }
  if (!body.expectedBehavior?.trim()) {
    return res.status(400).json({ error: "expectedBehavior is required" });
  }
  if (!body.impact || !VALID_IMPACTS.includes(body.impact)) {
    return res.status(400).json({ error: `impact must be one of: ${VALID_IMPACTS.join(", ")}` });
  }
  if (!body.category || !VALID_CATEGORIES.includes(body.category)) {
    return res.status(400).json({ error: `category must be one of: ${VALID_CATEGORIES.join(", ")}` });
  }

  const entry = {
    id: randomUUID(),
    caseId,
    step: body.step,
    observedBehavior: body.observedBehavior.trim(),
    expectedBehavior: body.expectedBehavior.trim(),
    impact: body.impact,
    category: body.category,
    reproducible: VALID_REPRODUCIBLE.includes(body.reproducible) ? body.reproducible : "Unknown",
    status: "Open" as const,
    screenshotRef: body.screenshotRef?.trim() || null,
    notes: body.notes?.trim() || null,
  };

  const [caseRow] = await db.select({ caseId: casesTable.caseId }).from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (!caseRow) return res.status(404).json({ error: "Case not found" });

  const [inserted] = await db.insert(caseFeedbackTable).values(entry).returning();
  res.status(201).json(inserted);
});

router.patch("/cases/:caseId/feedback/:feedbackId", async (req, res) => {
  const { caseId, feedbackId } = req.params;
  const body = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.status && VALID_STATUSES.includes(body.status)) updates.status = body.status;
  if (body.reproducible && VALID_REPRODUCIBLE.includes(body.reproducible)) updates.reproducible = body.reproducible;
  if (body.notes !== undefined) updates.notes = body.notes?.trim() || null;
  if (body.screenshotRef !== undefined) updates.screenshotRef = body.screenshotRef?.trim() || null;

  const [updated] = await db
    .update(caseFeedbackTable)
    .set(updates)
    .where(and(eq(caseFeedbackTable.id, feedbackId), eq(caseFeedbackTable.caseId, caseId)))
    .returning();

  if (!updated) return res.status(404).json({ error: "Feedback entry not found for this case" });
  res.json(updated);
});

router.delete("/cases/:caseId/feedback/:feedbackId", async (req, res) => {
  const { caseId, feedbackId } = req.params;
  const deleted = await db
    .delete(caseFeedbackTable)
    .where(and(eq(caseFeedbackTable.id, feedbackId), eq(caseFeedbackTable.caseId, caseId)))
    .returning();
  if (deleted.length === 0) return res.status(404).json({ error: "Feedback entry not found for this case" });
  res.json({ deleted: true });
});

router.get("/feedback/summary", async (_req, res) => {
  const all = await db.select().from(caseFeedbackTable).orderBy(desc(caseFeedbackTable.createdAt));

  const byCaseId: Record<string, number> = {};
  const byStep: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  const byImpact: Record<string, number> = {};
  const byStatus: Record<string, number> = {};

  for (const f of all) {
    byCaseId[f.caseId] = (byCaseId[f.caseId] || 0) + 1;
    byStep[f.step] = (byStep[f.step] || 0) + 1;
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
    byImpact[f.impact] = (byImpact[f.impact] || 0) + 1;
    byStatus[f.status || "Open"] = (byStatus[f.status || "Open"] || 0) + 1;
  }

  res.json({
    total: all.length,
    casesWithFeedback: Object.keys(byCaseId).length,
    byStep,
    byCategory,
    byImpact,
    byStatus,
    openCritical: all.filter(f => f.impact === "Critical" && f.status === "Open").length,
  });
});

router.get("/feedback/export", async (_req, res) => {
  const all = await db.select().from(caseFeedbackTable).orderBy(desc(caseFeedbackTable.createdAt));

  const header = "CaseID\tStep\tObservedBehavior\tExpectedBehavior\tImpact\tCategory\tReproducible\tStatus\tNotes\tCreatedAt";
  const rows = all.map(f =>
    [f.caseId, f.step, f.observedBehavior, f.expectedBehavior, f.impact, f.category, f.reproducible, f.status, f.notes || "", f.createdAt?.toISOString() || ""].join("\t"),
  );

  res.setHeader("Content-Type", "text/tab-separated-values");
  res.setHeader("Content-Disposition", "attachment; filename=case-feedback-export.tsv");
  res.send([header, ...rows].join("\n"));
});

router.get("/feedback/metadata", (_req, res) => {
  res.json({
    steps: VALID_STEPS,
    impacts: VALID_IMPACTS,
    categories: VALID_CATEGORIES,
    reproducibleOptions: VALID_REPRODUCIBLE,
    statuses: VALID_STATUSES,
  });
});

export default router;
