import { Router } from "express";
import { loadSignalStack } from "../lib/signal-grounding";
import { loadDiseaseContext, buildDiseaseContextBlock } from "../lib/disease-context";

const router = Router();

router.get("/cases/:caseId/signal-stack-context", async (req, res) => {
  const { caseId } = req.params;

  if (!caseId) {
    return res.status(400).json({ error: "caseId is required" });
  }

  try {
    const ctx = await loadSignalStack(caseId, "signal-stack-context");
    const diseaseContext = await loadDiseaseContext(caseId);
    const diseaseCtxBlock = buildDiseaseContextBlock(diseaseContext);

    const dimensionSummary: Record<string, string> = {};
    for (const dim of ctx.clinicalDimensions) {
      const key = dim.dimension;
      if (dim.present) {
        const signalSummaries = dim.signals.map(s =>
          `[${s.signalId}] (${s.direction}) ${s.signalType}: ${s.description.slice(0, 200)}`
        );
        dimensionSummary[key] = signalSummaries.join("\n");
      } else {
        dimensionSummary[key] = `GAP — ${dim.gap}`;
      }
    }

    const constraintBlock = ctx.hasSignalStack
      ? `SIGNAL STACK GROUNDING RULE (MANDATORY):
All content must be grounded in the following signal stack. Do NOT introduce clinical claims, trial names, PMIDs, DOIs, or NCT numbers not listed here. If a dimension is marked GAP, state the gap explicitly — do not fill it with training data.

${ctx.dimensionPromptBlock}

VERIFIED SOURCES:
${ctx.sourceCatalog}`
      : "";

    return res.json({
      hasSignalStack: ctx.hasSignalStack,
      signalCount: ctx.verifiedSources.length,
      verifiedSources: ctx.verifiedSources.map(s => ({
        signalId: s.signalId,
        description: s.description,
        signalType: s.signalType,
        direction: s.direction,
        sourceLabel: s.sourceLabel,
        sourceUrl: s.sourceUrl,
        identifierType: s.identifierType,
        identifierValue: s.identifierValue,
      })),
      clinicalDimensions: ctx.clinicalDimensions,
      dimensionGaps: ctx.dimensionGaps,
      dimensionSummary,
      constraintBlock,
      diseaseContext: diseaseContext || null,
      diseaseContextBlock: diseaseCtxBlock || null,
    });
  } catch (err: any) {
    console.error("Signal stack context error:", err);
    return res.status(500).json({ error: err.message || "Failed to load signal stack context" });
  }
});

export default router;
