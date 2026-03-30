import { Router } from "express";
import { db } from "@workspace/db";
import { questionRepositoryTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

router.get("/cases/:caseId/questions", async (req, res) => {
  const questions = await db
    .select()
    .from(questionRepositoryTable)
    .where(eq(questionRepositoryTable.caseId, req.params.caseId))
    .orderBy(questionRepositoryTable.priorityRank);
  res.json(questions);
});

router.post("/cases/:caseId/questions", async (req, res) => {
  const { questions } = req.body;

  if (!Array.isArray(questions) || questions.length === 0) {
    res.status(400).json({ error: "questions array is required" });
    return;
  }

  const caseId = req.params.caseId;
  const now = new Date();
  const inserted = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const row = {
      id: randomUUID(),
      caseId,
      questionId: q.questionId || `Q-${caseId}-${Date.now()}-${i}`,
      parentQuestionId: q.parentQuestionId || null,
      questionText: q.questionText,
      questionRole: q.questionRole || "secondary",
      questionType: q.questionType || "strategic",
      outcomeStructure: q.outcomeStructure || null,
      timeHorizon: q.timeHorizon || null,
      priorityRank: q.priorityRank ?? i,
      status: q.status || "saved",
      source: q.source || "system",
      linkedSignals: q.linkedSignals || null,
      linkedForecastId: q.linkedForecastId || null,
      dependencies: q.dependencies || null,
      notes: q.notes || null,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(questionRepositoryTable).values(row);
    inserted.push(row);
  }

  res.json({ inserted: inserted.length, questions: inserted });
});

router.patch("/cases/:caseId/questions/:questionId", async (req, res) => {
  const { status, questionRole, priorityRank, notes } = req.body;
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (status) updates.status = status;
  if (questionRole) updates.questionRole = questionRole;
  if (priorityRank !== undefined) updates.priorityRank = priorityRank;
  if (notes !== undefined) updates.notes = notes;

  await db
    .update(questionRepositoryTable)
    .set(updates)
    .where(
      and(
        eq(questionRepositoryTable.caseId, req.params.caseId),
        eq(questionRepositoryTable.questionId, req.params.questionId)
      )
    );

  res.json({ success: true });
});

router.delete("/cases/:caseId/questions/:questionId", async (req, res) => {
  await db
    .delete(questionRepositoryTable)
    .where(
      and(
        eq(questionRepositoryTable.caseId, req.params.caseId),
        eq(questionRepositoryTable.questionId, req.params.questionId)
      )
    );
  res.json({ success: true });
});

export default router;
