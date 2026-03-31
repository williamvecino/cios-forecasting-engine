import { Router } from "express";
import { db } from "@workspace/db";
import { signalsTable, casesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router = Router();

interface DriverSummary {
  signalId: string;
  description: string;
  family: string;
  direction: string;
  strength: number;
  lineageType: string;
  sourceCluster: string;
}

interface ExplanationOutput {
  topPositiveDrivers: DriverSummary[];
  topNegativeDrivers: DriverSummary[];
  uncertaintyFactors: string[];
  concentrationWarning: string | null;
  nextMover: string | null;
  fragilityAssessment: string;
  familyDistribution: Record<string, number>;
  lineageBreakdown: Record<string, number>;
  noveltyRatio: { novel: number; echo: number };
}

router.get("/cases/:caseId/explanation", async (req, res) => {
  try {
    const { caseId } = req.params;

    const signals = await db
      .select()
      .from(signalsTable)
      .where(and(eq(signalsTable.caseId, caseId), eq(signalsTable.status, "active")));

    if (signals.length === 0) {
      return res.json({
        topPositiveDrivers: [],
        topNegativeDrivers: [],
        uncertaintyFactors: ["No active signals in this case."],
        concentrationWarning: null,
        nextMover: null,
        fragilityAssessment: "Cannot assess — no signals present.",
        familyDistribution: {},
        lineageBreakdown: {},
        noveltyRatio: { novel: 0, echo: 0 },
      } satisfies ExplanationOutput);
    }

    const positive = signals
      .filter((s) => s.direction === "Positive")
      .sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0));
    const negative = signals
      .filter((s) => s.direction === "Negative")
      .sort((a, b) => (b.strengthScore ?? 0) - (a.strengthScore ?? 0));

    const mapDriver = (s: typeof signals[0]): DriverSummary => ({
      signalId: s.signalId,
      description: s.signalDescription || "",
      family: s.signalFamily || "Unknown",
      direction: s.direction || "Neutral",
      strength: s.strengthScore ?? 0,
      lineageType: s.lineageType || "Unclear",
      sourceCluster: s.sourceCluster || "Unknown",
    });

    const topPositiveDrivers = positive.slice(0, 3).map(mapDriver);
    const topNegativeDrivers = negative.slice(0, 3).map(mapDriver);

    const familyDistribution: Record<string, number> = {};
    for (const s of signals) {
      const fam = s.signalFamily || "Unknown";
      familyDistribution[fam] = (familyDistribution[fam] || 0) + 1;
    }

    const lineageBreakdown: Record<string, number> = {};
    for (const s of signals) {
      const lt = s.lineageType || "Unclear";
      lineageBreakdown[lt] = (lineageBreakdown[lt] || 0) + 1;
    }

    const novelCount = signals.filter((s) => s.noveltyFlag !== false).length;
    const echoCount = signals.filter((s) => s.noveltyFlag === false).length;

    const sortedFamilies = Object.entries(familyDistribution).sort((a, b) => b[1] - a[1]);
    let concentrationWarning: string | null = null;
    if (sortedFamilies.length > 0 && signals.length >= 3) {
      const topFamilyPct = sortedFamilies[0][1] / signals.length;
      if (topFamilyPct >= 0.5) {
        concentrationWarning = `${Math.round(topFamilyPct * 100)}% of active signals are concentrated in "${sortedFamilies[0][0]}". This may create blind spots in other evidence families.`;
      }
    }

    const uncertaintyFactors: string[] = [];
    const ambiguousCount = signals.filter((s) => s.direction === "Neutral" || s.direction === "Ambiguous").length;
    if (ambiguousCount > 0) {
      uncertaintyFactors.push(`${ambiguousCount} signal${ambiguousCount > 1 ? "s" : ""} with ambiguous or neutral direction.`);
    }
    if (echoCount > 0) {
      uncertaintyFactors.push(`${echoCount} echo signal${echoCount > 1 ? "s" : ""} detected — may inflate perceived evidence weight.`);
    }
    const derivativeCount = (lineageBreakdown["Direct Derivative"] || 0) + (lineageBreakdown["Second-Order Derivative"] || 0);
    if (derivativeCount > signals.length * 0.4) {
      uncertaintyFactors.push(`${Math.round((derivativeCount / signals.length) * 100)}% of signals are derivatives — limited independent evidence.`);
    }

    const missingFamilies = [
      "Clinical Efficacy", "Safety / Tolerability", "Regulatory Status",
      "Access / Payer", "Competitive Moves",
    ].filter((f) => !familyDistribution[f]);
    if (missingFamilies.length > 0) {
      uncertaintyFactors.push(`No signals from: ${missingFamilies.join(", ")}.`);
    }

    const weakestPositive = positive.length > 0 ? positive[positive.length - 1] : null;
    const weakestNegative = negative.length > 0 ? negative[negative.length - 1] : null;
    let nextMover: string | null = null;
    if (weakestPositive && (weakestPositive.strengthScore ?? 0) <= 2) {
      nextMover = `Weakest positive driver: "${(weakestPositive.signalDescription || "").slice(0, 80)}..." — if this strengthens, probability increases.`;
    } else if (weakestNegative && (weakestNegative.strengthScore ?? 0) <= 2) {
      nextMover = `Weakest negative driver: "${(weakestNegative.signalDescription || "").slice(0, 80)}..." — if this strengthens, probability decreases.`;
    }

    const rootCount = lineageBreakdown["Root"] || 0;
    let fragilityAssessment: string;
    if (rootCount >= 3 && novelCount >= signals.length * 0.6) {
      fragilityAssessment = "Low fragility — forecast supported by multiple independent root evidence sources.";
    } else if (rootCount >= 1) {
      fragilityAssessment = "Moderate fragility — some root evidence exists but signal base includes significant derivatives.";
    } else {
      fragilityAssessment = "High fragility — no root evidence sources among active signals. Forecast may shift significantly with new primary data.";
    }

    const output: ExplanationOutput = {
      topPositiveDrivers,
      topNegativeDrivers,
      uncertaintyFactors,
      concentrationWarning,
      nextMover,
      fragilityAssessment,
      familyDistribution,
      lineageBreakdown,
      noveltyRatio: { novel: novelCount, echo: echoCount },
    };

    res.json(output);
  } catch (err) {
    console.error("Explanation generator error:", err);
    res.status(500).json({ error: "Failed to generate explanation" });
  }
});

export default router;
