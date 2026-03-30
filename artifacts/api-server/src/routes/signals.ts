import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable, casesTable, SIGNAL_TYPES, VALID_TRANSITIONS } from "@workspace/db";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { computeLR, type Scope, type Timing } from "@workspace/db";
import { logAudit } from "../lib/audit-service.js";
import { isSafetyRiskCase, getProfileForQuestion } from "../lib/case-type-router.js";

interface CaseDirectionContext {
  strategicQuestion: string | null;
}

const router = Router();

const VALID_SIGNAL_TYPES = new Set<string>(SIGNAL_TYPES);
const VALID_DIRECTIONS = new Set(["Positive", "Negative", "Neutral"]);
const VALID_SCOPES = new Set(["local", "regional", "national", "global"]);
const VALID_TIMINGS = new Set(["early", "current", "late"]);

interface ValidationError {
  field: string;
  message: string;
}

function validateSignalInput(body: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.signalDescription || typeof body.signalDescription !== "string" || body.signalDescription.trim().length === 0) {
    errors.push({ field: "signalDescription", message: "Required. Must be a non-empty string." });
  }

  if (!body.signalType || typeof body.signalType !== "string") {
    errors.push({ field: "signalType", message: "Required. Must be a string." });
  } else if (!VALID_SIGNAL_TYPES.has(body.signalType)) {
    errors.push({
      field: "signalType",
      message: `Invalid signal type "${body.signalType}". Must be one of: ${[...VALID_SIGNAL_TYPES].join(", ")}`,
    });
  }

  if (!body.direction || !VALID_DIRECTIONS.has(body.direction)) {
    errors.push({ field: "direction", message: `Required. Must be "Positive", "Negative", or "Neutral".` });
  }

  const strength = Number(body.strengthScore);
  if (body.strengthScore == null || isNaN(strength) || strength < 1 || strength > 5) {
    errors.push({ field: "strengthScore", message: "Required. Must be a number between 1 and 5." });
  }

  const reliability = Number(body.reliabilityScore);
  if (body.reliabilityScore == null || isNaN(reliability) || reliability < 1 || reliability > 5) {
    errors.push({ field: "reliabilityScore", message: "Required. Must be a number between 1 and 5." });
  }

  if (body.scope && !VALID_SCOPES.has(String(body.scope).toLowerCase())) {
    errors.push({ field: "scope", message: `Must be one of: ${[...VALID_SCOPES].join(", ")}` });
  }

  if (body.timing && !VALID_TIMINGS.has(String(body.timing).toLowerCase())) {
    errors.push({ field: "timing", message: `Must be one of: ${[...VALID_TIMINGS].join(", ")}` });
  }

  if (body.correlationGroup != null && typeof body.correlationGroup !== "string") {
    errors.push({ field: "correlationGroup", message: "Must be a string if provided." });
  }

  return errors;
}

function validateForStatus(signal: Record<string, any>, targetStatus: string): ValidationError[] {
  const errors: ValidationError[] = [];

  if (targetStatus === "validated" || targetStatus === "active") {
    if (!signal.signalType) errors.push({ field: "signalType", message: "Required for validated/active status." });
    if (!signal.direction) errors.push({ field: "direction", message: "Required for validated/active status." });
    if (!signal.strengthScore && signal.strengthScore !== 0) errors.push({ field: "strengthScore", message: "Required for validated/active status." });
    if (!signal.reliabilityScore && signal.reliabilityScore !== 0) errors.push({ field: "reliabilityScore", message: "Required for validated/active status." });
    if (!signal.signalScope) errors.push({ field: "signalScope", message: "Required for validated/active status." });
    if (!signal.sourceLabel) errors.push({ field: "sourceLabel", message: "Required for validated/active status." });
    if (!signal.observedAt) errors.push({ field: "observedAt", message: "Required for validated/active status." });
  }

  if (targetStatus === "active") {
    if (!signal.evidenceSnippet) errors.push({ field: "evidenceSnippet", message: "Required for active status." });
    if (!signal.caseId) errors.push({ field: "caseId", message: "Signal must be linked to a case for active status." });
  }

  return errors;
}

function computeDescriptionSimilarity(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  const setA = tokenize(a);
  const setB = tokenize(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  return union > 0 ? intersection / union : 0;
}

function deriveDirectionSafeLR(body: Record<string, any>): number {
  if (body.direction === "Neutral") return 1.0;
  const signalType = body.signalType ?? "";
  const strength = Number(body.strengthScore ?? 3);
  const credibility = Number(body.reliabilityScore ?? 3);
  const scope = ((body.scope ?? "national") as string).toLowerCase() as Scope;
  const timing = ((body.timing ?? "current") as string).toLowerCase() as Timing;
  const direction = (body.direction ?? "Positive") as "Positive" | "Negative";
  return computeLR(signalType, strength, credibility, scope, timing, direction);
}

function numToLabel(n: number): string {
  if (n >= 4) return "high";
  if (n >= 3) return "medium";
  return "low";
}

router.get("/cases/:caseId/signals", async (req, res) => {
  const signals = await db.select().from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId))
    .orderBy(signalsTable.createdAt);
  res.json(signals);
});

router.get("/signals", async (req, res) => {
  const { status, signalType, signalScope, createdByType, caseId, limit: limitStr } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitStr || "200", 10), 500);

  const conditions: any[] = [];
  if (status) conditions.push(eq(signalsTable.status, status));
  if (signalType) conditions.push(eq(signalsTable.signalType, signalType));
  if (signalScope) conditions.push(eq(signalsTable.signalScope, signalScope));
  if (createdByType) conditions.push(eq(signalsTable.createdByType, createdByType));
  if (caseId) conditions.push(eq(signalsTable.caseId, caseId));

  const signals = conditions.length > 0
    ? await db.select().from(signalsTable).where(and(...conditions)).orderBy(desc(signalsTable.createdAt)).limit(limit)
    : await db.select().from(signalsTable).orderBy(desc(signalsTable.createdAt)).limit(limit);

  res.json(signals);
});

router.post("/cases/:caseId/signals", async (req, res) => {
  const body = req.body;

  const validationErrors = validateSignalInput(body);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: "Signal validation failed",
      violations: validationErrors,
      rule: "Signals must be structured and validated before entering the engine",
    });
  }

  const id = randomUUID();
  const signalId = body.signalId || `SIG-${Date.now()}`;
  const weightedScore = Number(body.strengthScore) * Number(body.reliabilityScore);
  const lr = deriveDirectionSafeLR(body);

  const createdByType = body.createdByType || "human";
  const initialStatus = createdByType === "agent" ? "candidate" : (body.status || "active");

  const existingSignals = await db.select().from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId));

  const duplicateWarnings: Array<{ existingSignalId: string; similarity: number }> = [];
  for (const existing of existingSignals) {
    if (existing.signalId === body.signalId) {
      return res.status(409).json({
        error: "Duplicate signal",
        message: `Signal ${body.signalId} already exists on this case.`,
        existingSignalId: existing.signalId,
      });
    }
    const similarity = computeDescriptionSimilarity(
      body.signalDescription,
      existing.signalDescription
    );
    if (similarity > 0.85) {
      return res.status(409).json({
        error: "Duplicate signal",
        message: "A very similar signal already exists on this case.",
        existingSignalId: existing.signalId,
        similarity: Number(similarity.toFixed(2)),
      });
    }
    if (similarity > 0.6) {
      duplicateWarnings.push({
        existingSignalId: existing.signalId,
        similarity: Number(similarity.toFixed(2)),
      });
    }
  }

  try {
    const [caseRecord] = await db.select({
      strategicQuestion: casesTable.strategicQuestion,
    }).from(casesTable).where(eq(casesTable.caseId, req.params.caseId));
    if (caseRecord) {
      const caseCtx: CaseDirectionContext = {
        strategicQuestion: caseRecord.strategicQuestion,
      };
      const question = caseCtx.strategicQuestion || "";
      if (isSafetyRiskCase(question)) {
        const profile = getProfileForQuestion(question);
        if (profile.directionValidation?.restrictionOutcome) {
          const signalType = (body.signalType || "").trim();
          const direction = body.direction || "";
          const invertedCats = profile.directionValidation.invertedCategories || {};
          for (const [cat, reason] of Object.entries(invertedCats)) {
            const catNorm = cat.trim().toLowerCase();
            const typeNorm = signalType.toLowerCase();
            if (typeNorm === catNorm && direction === "Positive") {
              return res.status(400).json({
                error: "Direction validation failed",
                violations: [{
                  field: "direction",
                  message: `${reason}. Signal type "${signalType}" with direction "Positive" is inverted for a safety/restriction-outcome case. Use direction "Negative" to indicate this signal reduces restriction probability, or change the signal type.`,
                }],
                rule: "Safety/risk cases enforce directional coherence: positive access/payer signals must have direction 'Negative' when the outcome is restriction.",
                suggestion: { direction: "Negative" },
              });
            }
          }
        }
      }
    }
  } catch (e) {
    console.error("Direction validation check failed (non-blocking):", e);
  }

  const [created] = await db.insert(signalsTable).values({
    id,
    signalId,
    caseId: req.params.caseId,
    candidateId: body.candidateId || signalId,
    brand: body.brand,
    signalDescription: body.signalDescription,
    signalType: body.signalType,
    direction: body.direction,
    strengthScore: Number(body.strengthScore),
    reliabilityScore: Number(body.reliabilityScore),
    likelihoodRatio: lr,
    scope: body.scope || "national",
    timing: body.timing || "current",
    route: body.route,
    targetPopulation: body.targetPopulation,
    miosFlag: body.miosFlag || (body.route?.includes("MIOS") ? "Yes" : "No"),
    ohosFlag: body.ohosFlag || (body.route?.includes("OHOS") ? "Yes" : "No"),
    weightedSignalScore: weightedScore,
    activeLikelihoodRatio: lr,
    correlationGroup: body.correlationGroup || null,
    signalScope: body.signalScope || "market",
    appliesToTargetId: body.appliesToTargetId || null,
    appliesToSpecialty: body.appliesToSpecialty || null,
    appliesToSubspecialty: body.appliesToSubspecialty || null,
    appliesToInstitutionId: body.appliesToInstitutionId || null,
    appliesToGeography: body.appliesToGeography || null,
    eventFamilyId: body.eventFamilyId || null,
    status: initialStatus,
    createdByType,
    createdById: body.createdById || null,
    strength: body.strength || numToLabel(Number(body.strengthScore)),
    reliability: body.reliability || numToLabel(Number(body.reliabilityScore)),
    sourceLabel: body.sourceLabel || null,
    sourceUrl: body.sourceUrl || null,
    evidenceSnippet: body.evidenceSnippet || null,
    observedAt: body.observedAt ? new Date(body.observedAt) : null,
    notes: body.notes || null,
  }).returning();

  await logAudit({
    objectType: "signal",
    objectId: signalId,
    action: "created",
    performedByType: createdByType,
    performedById: body.createdById || null,
    afterState: created as any,
  });

  const response: Record<string, any> = { ...created };
  if (duplicateWarnings.length > 0) {
    response._integrityWarnings = {
      potentialDuplicates: duplicateWarnings,
      recommendation: "Consider assigning a correlationGroup to correlated signals to prevent LR inflation.",
    };
  }

  res.status(201).json(response);
});

router.post("/signals/:signalId/transition", async (req, res) => {
  const { action, performedByType, performedById } = req.body;

  const actionToStatus: Record<string, string> = {
    review: "reviewed",
    validate: "validated",
    activate: "active",
    reject: "rejected",
    archive: "archived",
    revert: "candidate",
  };

  const targetStatus = actionToStatus[action];
  if (!targetStatus) {
    return res.status(400).json({
      error: `Invalid action "${action}". Must be one of: ${Object.keys(actionToStatus).join(", ")}`,
    });
  }

  const [signal] = await db.select().from(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  if (!signal) return res.status(404).json({ error: "Signal not found" });

  const currentStatus = signal.status || "active";
  const allowed = VALID_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(targetStatus)) {
    return res.status(400).json({
      error: `Invalid transition from "${currentStatus}" to "${targetStatus}".`,
      allowedTransitions: allowed || [],
    });
  }

  if (targetStatus === "validated" || targetStatus === "active") {
    const validationErrors = validateForStatus(signal as any, targetStatus);
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: `Cannot transition to "${targetStatus}" — required fields missing.`,
        missingFields: validationErrors,
      });
    }
  }

  const [updated] = await db.update(signalsTable)
    .set({ status: targetStatus, updatedAt: new Date() })
    .where(eq(signalsTable.signalId, req.params.signalId))
    .returning();

  await logAudit({
    objectType: "signal",
    objectId: req.params.signalId,
    action: action,
    performedByType: performedByType || "human",
    performedById: performedById || null,
    beforeState: { status: currentStatus },
    afterState: { status: targetStatus },
  });

  res.json(updated);
});

router.put("/signals/:signalId", async (req, res) => {
  const body = req.body;

  const validationErrors = validateSignalInput(body);
  if (validationErrors.length > 0) {
    return res.status(400).json({
      error: "Signal validation failed",
      violations: validationErrors,
      rule: "Signals must be structured and validated before entering the engine",
    });
  }

  const [existing] = await db.select().from(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const lr = deriveDirectionSafeLR(body);

  const [updated] = await db.update(signalsTable)
    .set({
      signalDescription: body.signalDescription,
      signalType: body.signalType,
      direction: body.direction,
      strengthScore: Number(body.strengthScore),
      reliabilityScore: Number(body.reliabilityScore),
      likelihoodRatio: lr,
      scope: body.scope,
      timing: body.timing,
      route: body.route,
      targetPopulation: body.targetPopulation,
      miosFlag: body.miosFlag,
      ohosFlag: body.ohosFlag,
      weightedSignalScore: Number(body.strengthScore) * Number(body.reliabilityScore),
      correlationGroup: body.correlationGroup ?? null,
      signalScope: body.signalScope ?? undefined,
      appliesToTargetId: body.appliesToTargetId ?? undefined,
      appliesToSpecialty: body.appliesToSpecialty ?? undefined,
      appliesToSubspecialty: body.appliesToSubspecialty ?? undefined,
      appliesToInstitutionId: body.appliesToInstitutionId ?? undefined,
      appliesToGeography: body.appliesToGeography ?? undefined,
      eventFamilyId: body.eventFamilyId ?? undefined,
      strength: body.strength || numToLabel(Number(body.strengthScore)),
      reliability: body.reliability || numToLabel(Number(body.reliabilityScore)),
      sourceLabel: body.sourceLabel ?? undefined,
      sourceUrl: body.sourceUrl ?? undefined,
      evidenceSnippet: body.evidenceSnippet ?? undefined,
      observedAt: body.observedAt ? new Date(body.observedAt) : undefined,
      notes: body.notes ?? undefined,
      updatedAt: new Date(),
    })
    .where(eq(signalsTable.signalId, req.params.signalId))
    .returning();

  await logAudit({
    objectType: "signal",
    objectId: req.params.signalId,
    action: "edited",
    performedByType: body.performedByType || "human",
    performedById: body.performedById || null,
    beforeState: existing as any,
    afterState: updated as any,
  });

  res.json(updated);
});

router.patch("/signals/:signalId", async (req, res) => {
  const [existing] = await db.select().from(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const body = req.body;
  const allowedFields = ["signalDescription", "sourceLabel", "sourceUrl", "evidenceSnippet", "observedAt", "notes", "strength", "reliability"] as const;
  const updates: Record<string, any> = { updatedAt: new Date() };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = field === "observedAt" && body[field] ? new Date(body[field]) : body[field];
    }
  }

  const [updated] = await db.update(signalsTable)
    .set(updates)
    .where(eq(signalsTable.signalId, req.params.signalId))
    .returning();

  await logAudit({
    objectType: "signal",
    objectId: req.params.signalId,
    action: "edited",
    performedByType: body.performedByType || "human",
    performedById: body.performedById || null,
    beforeState: existing as any,
    afterState: updated as any,
  });

  res.json(updated);
});

router.delete("/signals/:signalId", async (req, res) => {
  const [existing] = await db.select().from(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  if (!existing) return res.status(404).json({ error: "Not found" });

  await db.delete(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));

  await logAudit({
    objectType: "signal",
    objectId: req.params.signalId,
    action: "deleted",
    performedByType: (req.body?.performedByType as string) || "human",
    performedById: (req.body?.performedById as string) || null,
    beforeState: existing as any,
  });

  res.status(204).send();
});

export default router;
