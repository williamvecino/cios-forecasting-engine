import { Router } from "express";
import { db } from "@workspace/db";
import { candidateSignalsTable, CANDIDATE_DOMAINS, DOMAIN_TO_SIGNAL_TYPE, DOMAIN_LABELS, signalsTable, casesTable, type CandidateDomain } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import type { Scope, Timing } from "@workspace/db";
import { lookupPrecedentLr } from "../lib/precedent-lookup.js";
import { openai } from "@workspace/integrations-openai-ai-server";
import { classifyEvidence } from "../lib/evidence-classifier.js";

const router = Router();

const SIGNAL_TYPES = [
  "Phase III clinical",
  "Guideline inclusion",
  "KOL endorsement",
  "Field intelligence",
  "Operational friction",
  "Competitor counteraction",
  "Access / commercial",
  "Regulatory / clinical",
  "Access friction",
  "Experience infrastructure",
  "Payer / coverage",
  "Market adoption / utilization",
  "Capacity / infrastructure",
  "Competitor countermove",
  "Safety / tolerability",
  "Guideline consensus",
  "Epidemiology / population",
  "Prescriber behavior",
  "Access / reimbursement",
  "Real-world evidence",
] as const;

const EXTRACTION_SYSTEM_PROMPT = `You are a pharmaceutical and medtech market intelligence analyst specializing in HCP adoption forecasting.

Your task is to read a document or summary and extract candidate signals that affect physician or healthcare provider adoption of a drug, device, or therapeutic intervention.

For each signal you detect, output a JSON object with these fields:
- signalDescription: a concise 1-2 sentence description of the specific intelligence signal
- signalType: one of exactly ["Phase III clinical", "Guideline inclusion", "KOL endorsement", "Field intelligence", "Operational friction", "Competitor counteraction", "Access / commercial", "Regulatory / clinical", "Access friction", "Experience infrastructure"]
- direction: "Positive" (supports adoption) or "Negative" (hinders adoption)
- strengthScore: integer 1-5 (1=weak, 3=moderate, 5=strong)
- reliabilityScore: integer 1-5 (1=anecdotal, 3=credible, 5=verified/published)
- scope: one of ["local", "regional", "national", "global"]
- timing: one of ["early", "current", "late"]
- domain: one of exactly [${CANDIDATE_DOMAINS.map((d) => `"${d}"`).join(", ")}]
- reasoning: 1 sentence explaining why you classified it this way

Signal domain guidance:
- clinical_efficacy: Trial results, efficacy outcomes, endpoint data
- safety_tolerability: Adverse events, safety signals, tolerability reports
- delivery_convenience: Formulation, route of administration, dosing frequency
- adherence_impact: Patient adherence, persistence, convenience factors
- physician_perception: Physician beliefs, perception barriers, skepticism
- specialist_concentration: Specialist market structure, referral patterns
- guideline_endorsement: Society guidelines, clinical pathway inclusion
- payer_reimbursement: Coverage decisions, formulary status, prior auth
- hospital_workflow: Hospital formulary, workflow integration, P&T committees
- competitor_pressure: Competitor launches, competitive actions, LOE
- kol_endorsement: KOL endorsements, advocacy, speaker activity
- real_world_evidence: Real-world outcomes, registries, post-market data
- regulatory_status: FDA labels, approvals, warning letters, REMS
- patient_segmentation: Patient population fit, severity targeting, segmentation

Signal type classification guidance for access and infrastructure signals:
- "Access friction": Operational barriers reducing prescribing ease, treatment initiation, or adoption velocity. Includes prior auth complexity, step therapy requirements, REMS administrative burden, specialty pharmacy restrictions, diagnostic workflow complexity, site certification burden, infusion/logistics complexity.
- "Experience infrastructure": Operational support systems reducing friction between diagnosis, access, initiation, adherence, and persistence. Includes patient navigation programs, adherence support programs, onboarding services, digital companion tools, call center/hub support, workflow integration tools, care coordination infrastructure.
- REMS burden, certification, documentation, monitoring complexity → classify as "Access friction"
- REMS simplification, integrated support, digital workflow, call-center enablement → classify as "Experience infrastructure"

Output ONLY a valid JSON array of signal objects. No markdown, no preamble. If you find fewer than 1 signal, output an empty array [].`;

router.post("/cases/:caseId/discover", async (req, res) => {
  const { caseId } = req.params;
  const { text } = req.body as { text: string };

  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: "Please provide at least 20 characters of text to analyze." });
  }

  const [caseRow] = await db.select().from(casesTable).where(eq(casesTable.caseId, caseId)).limit(1);
  if (caseRow && caseRow.isDemo !== "true" && !caseRow.primaryTrialName) {
    return res.status(400).json({
      error: "Pivotal evidence is required before signal discovery can run. Add the primary trial name, PMID, and result summary to this case first.",
    });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 8192,
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Extract all adoption-relevant signals from the following document:\n\n---\n${text.slice(0, 12000)}\n---\n\nReturn only valid JSON array.`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? "[]";
    let candidates: any[] = [];

    try {
      const parsed = JSON.parse(raw.replace(/```json\n?|```\n?/g, "").trim());
      candidates = Array.isArray(parsed) ? parsed : [];
    } catch {
      return res.status(502).json({ error: "AI returned an unexpected format. Please try again." });
    }

    const inserted = await Promise.all(
      candidates.map(async (c: any) => {
        const signalType = SIGNAL_TYPES.includes(c.signalType) ? c.signalType : (DOMAIN_TO_SIGNAL_TYPE[c.domain as keyof typeof DOMAIN_TO_SIGNAL_TYPE] ?? "Field intelligence");
        const direction = c.direction === "Negative" ? "Negative" : "Positive";
        const strength = Math.min(5, Math.max(1, Number(c.strengthScore) || 3));
        const reliability = Math.min(5, Math.max(1, Number(c.reliabilityScore) || 3));
        const scope = (["local", "regional", "national", "global"].includes(c.scope) ? c.scope : "national") as Scope;
        const rawTiming = (c.timing ?? "current").toLowerCase();
        const timingMap: Record<string, Timing> = { past: "early", early: "early", current: "current", emerging: "late", late: "late" };
        const timing = (timingMap[rawTiming] ?? "current") as Timing;
        const precedentResult = lookupPrecedentLr(signalType, direction);
        if (!precedentResult.matched) {
          throw new Error(`Signal type "${signalType}" not found in precedent library`);
        }
        const lr = precedentResult.assignedLr;
        const domain = CANDIDATE_DOMAINS.includes(c.domain) ? c.domain : "physician_perception";

        const [row] = await db.insert(candidateSignalsTable).values({
          caseId,
          status: "pending",
          signalDescription: String(c.signalDescription || "").slice(0, 500),
          signalType,
          direction,
          strengthScore: strength,
          reliabilityScore: reliability,
          scope,
          timing,
          likelihoodRatio: lr,
          domain,
        }).returning();
        return row;
      })
    );

    res.json({ extracted: inserted.length, candidates: inserted });
  } catch (err: any) {
    console.error("[discover]", err);
    res.status(500).json({ error: "AI extraction failed. Please try again." });
  }
});

router.get("/cases/:caseId/candidates", async (req, res) => {
  const rows = await db
    .select()
    .from(candidateSignalsTable)
    .where(eq(candidateSignalsTable.caseId, req.params.caseId))
    .orderBy(candidateSignalsTable.createdAt);
  res.json(rows);
});

router.patch("/candidates/:id", async (req, res) => {
  const { id } = req.params;
  const body = req.body as Record<string, any>;

  const updateData: Record<string, any> = {};
  if (body.signalDescription !== undefined) updateData.signalDescription = body.signalDescription;
  if (body.signalType !== undefined) updateData.signalType = body.signalType;
  if (body.direction !== undefined) updateData.direction = body.direction;
  if (body.strengthScore !== undefined) updateData.strengthScore = Number(body.strengthScore);
  if (body.reliabilityScore !== undefined) updateData.reliabilityScore = Number(body.reliabilityScore);
  if (body.scope !== undefined) updateData.scope = body.scope;
  if (body.timing !== undefined) updateData.timing = body.timing;
  if (body.domain !== undefined) updateData.domain = body.domain;
  if (body.status !== undefined) updateData.status = body.status;

  if (updateData.signalType || updateData.strengthScore || updateData.reliabilityScore || updateData.scope || updateData.timing || updateData.direction) {
    const current = await db.select().from(candidateSignalsTable).where(eq(candidateSignalsTable.id, id));
    if (current[0]) {
      const c = { ...current[0], ...updateData };
      const precResult = lookupPrecedentLr(c.signalType, c.direction);
      if (!precResult.matched) {
        throw new Error(`Signal type "${c.signalType}" not found in precedent library`);
      }
      updateData.likelihoodRatio = precResult.assignedLr;
    }
  }

  const [updated] = await db.update(candidateSignalsTable).set(updateData).where(eq(candidateSignalsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Not found" });

  if (updated.status === "approved" && updated.promotedSignalId) {
    const rawTiming = (updated.timing ?? "current").toLowerCase();
    const timingMap: Record<string, string> = { past: "early", early: "early", current: "current", emerging: "late", late: "late" };
    const cls = classifyEvidence({
      signalDescription: updated.signalDescription ?? "",
      sourceUrl: (updated as any).sourceUrl ?? null,
      sourceLabel: (updated as any).sourceLabel ?? null,
      observedAt: (updated as any).observedAt ?? null,
      signalType: updated.signalType,
      direction: updated.direction,
    });
    await db.update(signalsTable).set({
      signalDescription: updated.signalDescription,
      signalType: updated.signalType,
      direction: updated.direction,
      strengthScore: updated.strengthScore,
      reliabilityScore: updated.reliabilityScore,
      scope: updated.scope as any,
      timing: (timingMap[rawTiming] ?? "current") as any,
      likelihoodRatio: updated.likelihoodRatio ?? 1,
      evidenceClass: cls.evidenceClass,
      countTowardPosterior: false,
    }).where(eq(signalsTable.signalId, updated.promotedSignalId));
  }

  res.json(updated);
});

router.post("/candidates/:id/approve", async (req, res) => {
  const { id } = req.params;
  const [candidate] = await db.select().from(candidateSignalsTable).where(eq(candidateSignalsTable.id, id));
  if (!candidate) return res.status(404).json({ error: "Not found" });

  const signalId = `SIG-${Date.now()}`;
  const rawTiming = (candidate.timing ?? "current").toLowerCase();
  const timingMap: Record<string, string> = { past: "early", early: "early", current: "current", emerging: "late", late: "late" };
  const normalizedTiming = timingMap[rawTiming] ?? "current";
  const safeLR = isNaN(candidate.likelihoodRatio ?? NaN) ? 1.0 : candidate.likelihoodRatio;

  const cls = classifyEvidence({
    signalDescription: candidate.signalDescription ?? "",
    sourceUrl: (candidate as any).sourceUrl ?? null,
    sourceLabel: (candidate as any).sourceLabel ?? null,
    observedAt: (candidate as any).observedAt ?? null,
    signalType: candidate.signalType,
    direction: candidate.direction,
  });

  const [newSignal] = await db.insert(signalsTable).values({
    id: randomUUID(),
    caseId: candidate.caseId,
    signalId,
    signalDescription: candidate.signalDescription,
    signalType: candidate.signalType,
    direction: candidate.direction,
    strengthScore: candidate.strengthScore,
    reliabilityScore: candidate.reliabilityScore,
    scope: candidate.scope as any,
    timing: normalizedTiming as any,
    likelihoodRatio: safeLR,
    status: "active",
    createdByType: "human",
    evidenceClass: cls.evidenceClass,
    countTowardPosterior: false,
    dependencyRole: "Independent parallel evidence",
    rootEvidenceId: randomUUID(),
    novelInformationFlag: "Yes",
    observedAt: new Date(),
  }).returning();

  await db.update(candidateSignalsTable)
    .set({ status: "approved", promotedSignalId: signalId })
    .where(eq(candidateSignalsTable.id, id));

  res.json({ signal: newSignal });
});

router.patch("/candidates/:id/reject", async (req, res) => {
  const [updated] = await db
    .update(candidateSignalsTable)
    .set({ status: "rejected" })
    .where(eq(candidateSignalsTable.id, req.params.id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.patch("/candidates/:id/restore", async (req, res) => {
  const [candidate] = await db.select().from(candidateSignalsTable).where(eq(candidateSignalsTable.id, req.params.id));
  if (!candidate) return res.status(404).json({ error: "Not found" });

  if (candidate.promotedSignalId) {
    await db.delete(signalsTable).where(eq(signalsTable.signalId, candidate.promotedSignalId));
  }

  const [updated] = await db
    .update(candidateSignalsTable)
    .set({ status: "pending", promotedSignalId: null })
    .where(eq(candidateSignalsTable.id, req.params.id))
    .returning();
  res.json(updated);
});

router.delete("/candidates/:id", async (req, res) => {
  const [candidate] = await db.select().from(candidateSignalsTable).where(eq(candidateSignalsTable.id, req.params.id));
  if (candidate?.promotedSignalId) {
    await db.delete(signalsTable).where(eq(signalsTable.signalId, candidate.promotedSignalId));
  }
  await db.delete(candidateSignalsTable).where(eq(candidateSignalsTable.id, req.params.id));
  res.status(204).end();
});

router.get("/cases/:caseId/completeness", async (req, res) => {
  const confirmedSignals = await db
    .select()
    .from(signalsTable)
    .where(eq(signalsTable.caseId, req.params.caseId));

  const approvedCandidates = await db
    .select()
    .from(candidateSignalsTable)
    .where(and(
      eq(candidateSignalsTable.caseId, req.params.caseId),
      eq(candidateSignalsTable.status, "approved")
    ));

  const SIGNAL_TYPE_TO_DOMAINS: Record<string, CandidateDomain[]> = {
    "Phase III clinical": ["clinical_efficacy", "real_world_evidence"],
    "Guideline inclusion": ["guideline_endorsement"],
    "KOL endorsement": ["kol_endorsement"],
    "Field intelligence": ["physician_perception", "specialist_concentration", "adherence_impact", "delivery_convenience", "patient_segmentation"],
    "Operational friction": ["hospital_workflow"],
    "Competitor counteraction": ["competitor_pressure"],
    "Access / commercial": ["payer_reimbursement"],
    "Regulatory / clinical": ["safety_tolerability", "regulatory_status"],
    "Access friction": ["payer_reimbursement", "hospital_workflow", "regulatory_status"],
    "Experience infrastructure": ["adherence_impact", "delivery_convenience", "hospital_workflow"],
  };

  const coveredDomains = new Set<CandidateDomain>();

  for (const sig of confirmedSignals) {
    const mapped = SIGNAL_TYPE_TO_DOMAINS[sig.signalType ?? ""] ?? [];
    mapped.forEach((d) => coveredDomains.add(d));
  }
  for (const c of approvedCandidates) {
    if (c.domain) coveredDomains.add(c.domain as CandidateDomain);
  }

  const HIGH_PRIORITY_DOMAINS: CandidateDomain[] = [
    "clinical_efficacy",
    "payer_reimbursement",
    "physician_perception",
    "competitor_pressure",
    "guideline_endorsement",
  ];

  const coverage = CANDIDATE_DOMAINS.map((domain) => ({
    domain,
    label: DOMAIN_LABELS[domain],
    present: coveredDomains.has(domain),
    priority: HIGH_PRIORITY_DOMAINS.includes(domain) ? "high" : "normal",
  }));

  const missingHighPriority = coverage.filter((c) => !c.present && c.priority === "high");
  const totalPresent = coverage.filter((c) => c.present).length;

  res.json({
    coverage,
    totalDomains: CANDIDATE_DOMAINS.length,
    coveredDomains: totalPresent,
    missingHighPriority,
    isComplete: missingHighPriority.length === 0,
    warning: missingHighPriority.length > 0
      ? `Forecast may be incomplete. ${missingHighPriority.length} important signal domain${missingHighPriority.length > 1 ? "s are" : " is"} missing: ${missingHighPriority.map((d) => d.label).join(", ")}.`
      : null,
  });
});

export default router;
