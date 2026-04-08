import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable, casesTable, SIGNAL_TYPES, VALID_TRANSITIONS, caseSignalStateTable } from "@workspace/db";
import { eq, and, inArray, gte, lte, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { type Scope, type Timing } from "@workspace/db";
import { lookupPrecedentLr } from "../lib/precedent-lookup.js";
import { logAudit } from "../lib/audit-service.js";
import { isSafetyRiskCase, getProfileForQuestion } from "../lib/case-type-router.js";
import { runCaseScoringEngine } from "../services/recalculateCaseScore.js";
import { verifySignalEvidence } from "../lib/evidence-verification.js";
import { classifyEvidence } from "../lib/evidence-classifier.js";

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

  if (!body.dependencyRole || typeof body.dependencyRole !== "string" || body.dependencyRole.trim().length === 0) {
    errors.push({ field: "dependencyRole", message: "Required per integrity spec Rule 3. Must be one of: Root, Direct derivative, Independent parallel evidence." });
  }

  if (!body.rootEvidenceId || typeof body.rootEvidenceId !== "string" || body.rootEvidenceId.trim().length === 0) {
    errors.push({ field: "rootEvidenceId", message: "Required per integrity spec Rule 3. Must reference the originating evidence source." });
  }

  if (!body.novelInformationFlag || typeof body.novelInformationFlag !== "string" || body.novelInformationFlag.trim().length === 0) {
    errors.push({ field: "novelInformationFlag", message: "Required per integrity spec Rule 3. Must be 'Yes' or 'No'." });
  }

  if (!body.observedAt) {
    errors.push({ field: "observedAt", message: "Required per integrity spec Rule 3. Must be a valid timestamp for when the signal was observed." });
  }

  return errors;
}

function isValidUrl(str: string): boolean {
  try {
    const u = new URL(str);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

function computeEvidenceStatus(body: Record<string, any>): { status: "Verified" | "Rejected"; rejectionReasons: string[] } {
  const reasons: string[] = [];

  const sourceUrl = (body.sourceUrl ?? "").trim();
  if (!sourceUrl || !isValidUrl(sourceUrl)) {
    reasons.push("Missing or invalid source link");
  }

  const observedAt = body.observedAt ? new Date(body.observedAt) : null;
  if (!observedAt || isNaN(observedAt.getTime())) {
    reasons.push("Missing publication/event date");
  } else if (observedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
    reasons.push("Event date is in the future");
  }

  return reasons.length === 0
    ? { status: "Verified", rejectionReasons: [] }
    : { status: "Rejected", rejectionReasons: reasons };
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
  const direction = (body.direction ?? "Positive") as string;
  const precedent = lookupPrecedentLr(signalType, direction);
  if (!precedent.matched) {
    throw new Error(`Signal type "${signalType}" not found in precedent library. Cannot assign LR.`);
  }
  return precedent.assignedLr;
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

  const evidence = computeEvidenceStatus(body);
  if (evidence.status === "Rejected") {
    return res.status(400).json({
      error: "Evidence gate failed",
      evidenceStatus: "Rejected",
      rejectionReasons: evidence.rejectionReasons,
      rule: "Signals require a verifiable source link, publication date, and a non-future event date to enter the register.",
    });
  }

  const classification = classifyEvidence({
    signalDescription: body.signalDescription,
    sourceUrl: body.sourceUrl,
    sourceLabel: body.sourceLabel || null,
    observedAt: body.observedAt,
    noveltyFlag: typeof body.noveltyFlag === "boolean" ? body.noveltyFlag : true,
    echoVsTranslation: body.echoVsTranslation || null,
    dependencyRole: body.dependencyRole || null,
    lineageType: body.lineageType || null,
    signalType: body.signalType,
    evidenceStatus: evidence.status,
    direction: body.direction,
  });

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
    evidenceStatus: evidence.status,
    notes: body.notes || null,
    interpretationId: body.interpretationId || null,
    rootEvidenceId: body.rootEvidenceId || null,
    dependencyRole: body.dependencyRole || null,
    novelInformationFlag: body.novelInformationFlag || null,
    signalFamily: body.signalFamily || null,
    lineageType: body.lineageType || null,
    sourceCluster: body.sourceCluster || null,
    noveltyFlag: typeof body.noveltyFlag === "boolean" ? body.noveltyFlag : true,
    evidenceClass: classification.evidenceClass,
    countTowardPosterior: classification.countTowardPosterior,
  }).returning();

  if (initialStatus === "active" || initialStatus === "validated") {
    try {
      const combinedText = `${body.evidenceSnippet || ""} ${body.sourceLabel || ""} ${body.notes || ""}`;
      const verifications = await verifySignalEvidence(combinedText, body.sourceLabel);
      const primary = verifications[0];
      if (primary) {
        await db.update(signalsTable).set({
          identifierType: primary.identifierType,
          identifierValue: primary.identifierValue,
          identifierSource: primary.identifierSource,
          verificationStatus: primary.verificationStatus,
          registryMatch: primary.registryMatch,
          verificationTimestamp: new Date(),
          verificationRedFlags: primary.redFlags.length > 0 ? JSON.stringify(primary.redFlags) : null,
        }).where(eq(signalsTable.id, id));
      }
    } catch (e) {
      console.error("Evidence verification on creation failed (non-blocking):", e);
    }
  }

  await logAudit({
    objectType: "signal",
    objectId: signalId,
    action: "created",
    performedByType: createdByType,
    performedById: body.createdById || null,
    afterState: created as any,
  });

  const response: Record<string, any> = { ...created };
  response._classification = {
    evidenceClass: classification.evidenceClass,
    countTowardPosterior: classification.countTowardPosterior,
    reasons: classification.classificationReasons,
  };
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

  const updateFields: Record<string, any> = { status: targetStatus, updatedAt: new Date() };

  if ((targetStatus === "validated" || targetStatus === "active") && signal.verificationStatus !== "verified") {
    const combinedText = `${signal.evidenceSnippet || ""} ${signal.sourceLabel || ""} ${signal.notes || ""}`;
    const verifications = await verifySignalEvidence(combinedText, signal.sourceLabel ?? undefined);
    const primary = verifications[0];
    if (primary) {
      updateFields.identifierType = primary.identifierType;
      updateFields.identifierValue = primary.identifierValue;
      updateFields.identifierSource = primary.identifierSource;
      updateFields.verificationStatus = primary.verificationStatus;
      updateFields.registryMatch = primary.registryMatch;
      updateFields.verificationTimestamp = new Date();
      updateFields.verificationRedFlags = primary.redFlags.length > 0 ? JSON.stringify(primary.redFlags) : null;
    }
  }

  const [updated] = await db.update(signalsTable)
    .set(updateFields)
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
  const updatedEvidence = computeEvidenceStatus(body);

  const reclassification = classifyEvidence({
    signalDescription: body.signalDescription,
    sourceUrl: body.sourceUrl,
    sourceLabel: body.sourceLabel || existing.sourceLabel || null,
    observedAt: body.observedAt,
    noveltyFlag: typeof body.noveltyFlag === "boolean" ? body.noveltyFlag : (existing.noveltyFlag ?? true),
    echoVsTranslation: body.echoVsTranslation || existing.echoVsTranslation || null,
    dependencyRole: body.dependencyRole || existing.dependencyRole || null,
    lineageType: body.lineageType || existing.lineageType || null,
    signalType: body.signalType,
    evidenceStatus: updatedEvidence.status,
    direction: body.direction,
  });

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
      dependencyRole: body.dependencyRole ?? undefined,
      rootEvidenceId: body.rootEvidenceId ?? undefined,
      novelInformationFlag: body.novelInformationFlag ?? undefined,
      evidenceStatus: updatedEvidence.status,
      notes: body.notes ?? undefined,
      evidenceClass: reclassification.evidenceClass,
      countTowardPosterior: reclassification.countTowardPosterior,
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

  if (updated.caseId) {
    runCaseScoringEngine(updated.caseId).catch((err: any) =>
      console.error("[signals/put] auto-recalculate failed:", err?.message)
    );
  }

  res.json(updated);
});

router.patch("/signals/:signalId", async (req, res) => {
  const [existing] = await db.select().from(signalsTable).where(eq(signalsTable.signalId, req.params.signalId));
  if (!existing) return res.status(404).json({ error: "Not found" });

  const body = req.body;
  const eligibilityFields = ["signalDescription", "sourceLabel", "sourceUrl", "observedAt", "dependencyRole", "rootEvidenceId", "novelInformationFlag"];
  const allowedFields = ["signalDescription", "sourceLabel", "sourceUrl", "evidenceSnippet", "observedAt", "notes", "strength", "reliability", "correlationGroup", "dependencyRole", "rootEvidenceId", "novelInformationFlag"] as const;
  const updates: Record<string, any> = { updatedAt: new Date() };

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates[field] = field === "observedAt" && body[field] ? new Date(body[field]) : body[field];
    }
  }

  const eligibilityChanged = eligibilityFields.some(f => body[f] !== undefined);
  if (eligibilityChanged) {
    const mergedDesc = body.signalDescription ?? existing.signalDescription ?? "";
    const mergedSourceUrl = body.sourceUrl ?? existing.sourceUrl;
    const mergedSourceLabel = body.sourceLabel ?? existing.sourceLabel;
    const mergedObservedAt = body.observedAt ? new Date(body.observedAt) : existing.observedAt;
    const reclass = classifyEvidence({
      signalDescription: mergedDesc,
      sourceUrl: mergedSourceUrl,
      sourceLabel: mergedSourceLabel,
      observedAt: mergedObservedAt,
      noveltyFlag: (existing as any).noveltyFlag ?? null,
      echoVsTranslation: (existing as any).echoVsTranslation ?? null,
      dependencyRole: (existing as any).dependencyRole ?? null,
      signalType: existing.signalType,
      evidenceStatus: existing.evidenceStatus,
      direction: existing.direction,
    });
    updates.evidenceClass = reclass.evidenceClass;
    updates.countTowardPosterior = reclass.countTowardPosterior;
    console.log(`[signals/patch] ${req.params.signalId} reclassified: ${existing.evidenceClass} → ${reclass.evidenceClass} (${reclass.classificationReasons.join("; ")})`);
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

  if (updated.caseId) {
    runCaseScoringEngine(updated.caseId).catch((err: any) =>
      console.error("[signals/patch] auto-recalculate failed:", err?.message)
    );
  }

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

  if (existing.caseId) {
    runCaseScoringEngine(existing.caseId).catch((err: any) =>
      console.error("[signals/delete] auto-recalculate failed:", err?.message)
    );
  }

  res.status(204).send();
});

router.post("/signals/:signalId/verify", async (req, res) => {
  const { signalId } = req.params;
  const rows = await db.select().from(signalsTable).where(eq(signalsTable.signalId, signalId)).limit(1);
  if (rows.length === 0) return res.status(404).json({ error: "Signal not found" });

  const signal = rows[0];
  const combinedText = `${signal.evidenceSnippet || ""} ${signal.sourceLabel || ""} ${signal.notes || ""}`;

  const results = await verifySignalEvidence(combinedText, signal.sourceLabel ?? undefined);

  const primary = results[0];
  if (primary) {
    await db.update(signalsTable).set({
      identifierType: primary.identifierType,
      identifierValue: primary.identifierValue,
      identifierSource: primary.identifierSource,
      verificationStatus: primary.verificationStatus,
      registryMatch: primary.registryMatch,
      verificationTimestamp: new Date(),
      verificationRedFlags: primary.redFlags.length > 0 ? JSON.stringify(primary.redFlags) : null,
      updatedAt: new Date(),
    }).where(eq(signalsTable.signalId, signalId));
  }

  res.json({ signalId, results });
});

router.post("/cases/:caseId/signals/verify-all", async (req, res) => {
  const { caseId } = req.params;
  const signals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));

  const results: { signalId: string; verificationStatus: string; redFlags: string[] }[] = [];

  for (const signal of signals) {
    if (signal.verificationStatus === "verified") {
      results.push({ signalId: signal.id, verificationStatus: "verified", redFlags: [] });
      continue;
    }

    const combinedText = `${signal.evidenceSnippet || ""} ${signal.sourceLabel || ""} ${signal.notes || ""}`;
    const verifications = await verifySignalEvidence(combinedText, signal.sourceLabel ?? undefined);
    const primary = verifications[0];

    if (primary) {
      await db.update(signalsTable).set({
        identifierType: primary.identifierType,
        identifierValue: primary.identifierValue,
        identifierSource: primary.identifierSource,
        verificationStatus: primary.verificationStatus,
        registryMatch: primary.registryMatch,
        verificationTimestamp: new Date(),
        verificationRedFlags: primary.redFlags.length > 0 ? JSON.stringify(primary.redFlags) : null,
        updatedAt: new Date(),
      }).where(eq(signalsTable.id, signal.id));

      results.push({
        signalId: signal.id,
        verificationStatus: primary.verificationStatus,
        redFlags: primary.redFlags,
      });
    }
  }

  res.json({ caseId, total: signals.length, results });
});

router.post("/signals/check-evidence", async (req, res) => {
  const { text, sourceLabel } = req.body;
  if (!text) return res.status(400).json({ error: "text is required" });

  const results = await verifySignalEvidence(text, sourceLabel);
  res.json({ results });
});

router.put("/cases/:caseId/signal-state", async (req, res) => {
  const { caseId } = req.params;
  const { signals, contextKey } = req.body;
  if (!caseId || !Array.isArray(signals)) {
    return res.status(400).json({ error: "caseId and signals array required" });
  }
  try {
    await db
      .insert(caseSignalStateTable)
      .values({
        caseId,
        signalData: signals,
        contextKey: contextKey || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: caseSignalStateTable.caseId,
        set: {
          signalData: signals,
          contextKey: contextKey || null,
          updatedAt: new Date(),
        },
      });

    const strengthToScore: Record<string, number> = { "High": 5, "Medium": 3, "Low": 1 };
    const reliabilityToScore: Record<string, number> = { "Confirmed": 5, "Probable": 3, "Speculative": 1 };
    const directionMap: Record<string, string> = { "Positive": "Positive", "Negative": "Negative", "Neutral": "Neutral", "positive": "Positive", "negative": "Negative", "neutral": "Neutral" };

    const dbSignals = await db.select().from(signalsTable).where(eq(signalsTable.caseId, caseId));
    const dbMap = new Map(dbSignals.map(s => [s.signalId, s]));

    for (const uiSig of signals) {
      const dbSig = dbMap.get(uiSig.id);
      if (!dbSig) continue;

      const newStrength = uiSig.strength ? (strengthToScore[uiSig.strength] ?? dbSig.strengthScore) : dbSig.strengthScore;
      const newReliability = uiSig.reliability ? (reliabilityToScore[uiSig.reliability] ?? dbSig.reliabilityScore) : dbSig.reliabilityScore;
      const newDirection = uiSig.direction ? (directionMap[uiSig.direction] ?? dbSig.direction) : dbSig.direction;

      const changed =
        newStrength !== dbSig.strengthScore ||
        newReliability !== dbSig.reliabilityScore ||
        newDirection !== dbSig.direction;

      if (changed) {
        const signalType = dbSig.signalType || "";
        const precedent = lookupPrecedentLr(signalType, newDirection as string);
        if (!precedent.matched) {
          throw new Error(`Signal type "${signalType}" not found in precedent library. Cannot assign LR.`);
        }
        await db.update(signalsTable).set({
          strengthScore: newStrength,
          reliabilityScore: newReliability,
          direction: newDirection,
          strength: uiSig.strength || dbSig.strength,
          reliability: uiSig.reliability || dbSig.reliability,
          likelihoodRatio: precedent.assignedLr,
          weightedSignalScore: (newStrength as number) * (newReliability as number),
          updatedAt: new Date(),
        }).where(eq(signalsTable.signalId, dbSig.signalId));
      }
    }

    runCaseScoringEngine(caseId).catch((err2: any) =>
      console.error("[signal-state] auto-recalculate failed:", err2?.message)
    );
    res.json({ ok: true });
  } catch (err: any) {
    console.error("[signal-state] save error:", err);
    res.status(500).json({ error: "Failed to save signal state" });
  }
});

router.get("/cases/:caseId/signal-state", async (req, res) => {
  const { caseId } = req.params;
  try {
    const rows = await db
      .select()
      .from(caseSignalStateTable)
      .where(eq(caseSignalStateTable.caseId, caseId))
      .limit(1);
    if (rows.length === 0) {
      return res.json({ signals: null });
    }
    res.json({ signals: rows[0].signalData, contextKey: rows[0].contextKey, updatedAt: rows[0].updatedAt });
  } catch (err: any) {
    console.error("[signal-state] load error:", err);
    res.status(500).json({ error: "Failed to load signal state" });
  }
});

router.post("/signals/reclassify-all", async (_req, res) => {
  try {
    const allSignals = await db.select().from(signalsTable);
    let updated = 0;
    const changes: Array<{ signalId: string; caseId: string | null; from: string | null; to: string; reasons: string[] }> = [];
    for (const s of allSignals) {
      const result = classifyEvidence({
        signalDescription: s.signalDescription ?? "",
        sourceUrl: s.sourceUrl,
        sourceLabel: s.sourceLabel ?? null,
        observedAt: s.observedAt,
        noveltyFlag: (s as any).noveltyFlag ?? null,
        echoVsTranslation: (s as any).echoVsTranslation ?? null,
        dependencyRole: (s as any).dependencyRole ?? null,
        lineageType: (s as any).lineageType ?? null,
        signalType: s.signalType,
        evidenceStatus: s.evidenceStatus,
        direction: s.direction,
      });
      if (s.evidenceClass !== result.evidenceClass || s.countTowardPosterior !== result.countTowardPosterior) {
        await db.update(signalsTable).set({
          evidenceClass: result.evidenceClass,
          countTowardPosterior: result.countTowardPosterior,
        }).where(eq(signalsTable.signalId, s.signalId));
        updated++;
        changes.push({ signalId: s.signalId, caseId: s.caseId, from: s.evidenceClass, to: result.evidenceClass, reasons: result.classificationReasons });
        console.log(`[reclassify] ${s.signalId}: ${s.evidenceClass} → ${result.evidenceClass} (${result.classificationReasons.join("; ")})`);
      }
    }
    res.json({ total: allSignals.length, updated, changes, message: "Reclassification complete" });
  } catch (err: any) {
    console.error("[reclassify] error:", err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
