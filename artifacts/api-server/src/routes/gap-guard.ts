import { Router } from "express";
import { scanForGapViolations, scanObjectForGapViolations, type GapViolation } from "../lib/narrative-gap-guard.js";

const router = Router();

router.post("/gap-guard/scan", (req, res) => {
  const { text, object } = req.body as { text?: string; object?: unknown };

  if (!text && !object) {
    res.status(400).json({ error: "Provide 'text' (string) or 'object' (any structured data) to scan" });
    return;
  }

  let violations: GapViolation[] = [];

  if (text) {
    const result = scanForGapViolations(text);
    violations = result.violations;
  }

  if (object) {
    violations = [...violations, ...scanObjectForGapViolations(object)];
  }

  res.json({
    clean: violations.length === 0,
    violationCount: violations.length,
    violations,
    requiredStructure: violations.length > 0
      ? {
          observedValue: "Current measured metric (e.g., 28% unaided awareness)",
          expectedValue: "Target or benchmark (e.g., 55% threshold for formulary pull-through)",
          difference: "Numeric delta (e.g., 27-point gap)",
          drivers: "Specific factors causing the gap (e.g., limited field force reach in community oncology)",
        }
      : null,
  });
});

export default router;
