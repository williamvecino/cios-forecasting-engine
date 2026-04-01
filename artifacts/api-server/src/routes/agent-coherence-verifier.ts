import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

interface SignalDetail {
  signalId: string;
  description?: string;
  rawLikelihoodRatio?: number;
  effectiveLikelihoodRatio?: number;
  dependencyRole?: string;
  pointContribution?: number;
  correlationGroup?: string;
}

interface DecisionClarity {
  successDefinition: string | null;
  outcomeThreshold: string | null;
  timeHorizon: string | null;
  targetProbability: number | null;
  environmentStrength: number | null;
}

interface RespondOutput {
  strategic_recommendation: string;
  primary_constraint: string;
  highest_impact_lever: string;
  realistic_ceiling: string;
  decision_clarity?: DecisionClarity;
}

interface VerifyRequest {
  respondOutput: RespondOutput;
  caseId: string;
  strategicQuestion?: string;
  successDefinition?: string;
  outcomeThreshold?: string;
  timeHorizon?: string;
  posteriorProbability?: number | null;
  thresholdProbability?: number | null;
  signalDetails?: SignalDetail[];
}

interface CoherenceIssue {
  rule: string;
  ruleNumber: number;
  severity: "fail" | "warn";
  detail: string;
}

interface VerifyResult {
  pass: boolean;
  issueCount: number;
  issues: CoherenceIssue[];
  revisedOutput: RespondOutput | null;
}

router.post("/agent-coherence/verify", async (req, res) => {
  try {
    const body = req.body as VerifyRequest;

    if (!body.respondOutput || !body.caseId) {
      res.status(400).json({ error: "respondOutput and caseId are required" });
      return;
    }

    const output = body.respondOutput;
    const issues: CoherenceIssue[] = [];

    checkRule1_ProbabilityOfWhat(output, issues);
    checkRule2_SuccessDefinition(output, body, issues);
    checkRule3_TimeHorizon(output, body, issues);
    checkRule4_TwoProbabilitiesDistinguished(output, body, issues);
    checkRule5_VerdictMatchesThreshold(output, body, issues);
    checkRule6_PrimaryConstraintNamed(output, issues);
    checkRule7_MainLeverNamed(output, issues);
    checkRule8_DriversAndConstraintReflected(output, body.signalDetails || [], issues);
    checkRule9_NoRawDecimals(output, issues);
    checkRule10_NoInternalIDs(output, body.signalDetails || [], issues);

    const pass = issues.filter(i => i.severity === "fail").length === 0;

    let revisedOutput: RespondOutput | null = null;

    if (!pass) {
      revisedOutput = await attemptCoherenceCorrection(output, issues, body);
    }

    const result: VerifyResult = {
      pass,
      issueCount: issues.length,
      issues,
      revisedOutput,
    };

    res.json(result);
  } catch (err: any) {
    console.error("[agent-coherence] Error:", err?.message || err);
    res.status(500).json({ error: "Coherence verification failed" });
  }
});

function checkRule1_ProbabilityOfWhat(output: RespondOutput, issues: CoherenceIssue[]) {
  const rec = output.strategic_recommendation.toLowerCase();
  const hasProbabilityTarget = /probability\s+of\s+(achiev|reach|meet|attain)/i.test(output.strategic_recommendation)
    || /\d+%\s+probability\s+of\s+(reach|achiev|meet|attain)/i.test(output.strategic_recommendation)
    || (rec.includes("probability") && (rec.includes("target") || rec.includes("threshold") || rec.includes("rx/quarter") || rec.includes("adoption")));

  const saysProbability = rec.includes("probability") || /\d+%/.test(rec);

  if (saysProbability && !hasProbabilityTarget) {
    issues.push({
      rule: "Probability of what is explicitly stated",
      ruleNumber: 1,
      severity: "fail",
      detail: "The recommendation mentions probability but does not specify what outcome is being measured. Must say 'probability of achieving [target]'.",
    });
  }

  if (!saysProbability) {
    issues.push({
      rule: "Probability of what is explicitly stated",
      ruleNumber: 1,
      severity: "fail",
      detail: "The recommendation does not include a probability statement. Must state the probability of achieving the defined target.",
    });
  }
}

function checkRule2_SuccessDefinition(output: RespondOutput, body: VerifyRequest, issues: CoherenceIssue[]) {
  const dc = output.decision_clarity;
  if (!dc?.successDefinition || dc.successDefinition === "Not defined") {
    issues.push({
      rule: "Success definition is present",
      ruleNumber: 2,
      severity: "fail",
      detail: "Decision clarity is missing a success definition. The output must state what success looks like.",
    });
  }
}

function checkRule3_TimeHorizon(output: RespondOutput, body: VerifyRequest, issues: CoherenceIssue[]) {
  const dc = output.decision_clarity;
  const recHasTime = /\d+\s*(month|year|quarter|week)/i.test(output.strategic_recommendation);

  if (!dc?.timeHorizon || dc.timeHorizon === "Not defined") {
    issues.push({
      rule: "Time horizon is present",
      ruleNumber: 3,
      severity: "fail",
      detail: "Decision clarity is missing a time horizon.",
    });
  }

  if (!recHasTime) {
    issues.push({
      rule: "Time horizon is present",
      ruleNumber: 3,
      severity: "warn",
      detail: "The strategic recommendation does not mention the time horizon. Consider including 'within X months' for clarity.",
    });
  }
}

function checkRule4_TwoProbabilitiesDistinguished(output: RespondOutput, body: VerifyRequest, issues: CoherenceIssue[]) {
  const dc = output.decision_clarity;

  if (dc && dc.targetProbability != null && dc.environmentStrength != null) {
    if (Math.abs(dc.targetProbability - dc.environmentStrength) < 0.001) {
      issues.push({
        rule: "Posterior and Threshold Probability are clearly distinguished",
        ruleNumber: 4,
        severity: "warn",
        detail: "Target probability and environment strength are identical. These should typically differ — target probability reflects P(achieving threshold) while environment strength reflects overall signal balance.",
      });
    }
  } else {
    if (dc?.targetProbability == null) {
      issues.push({
        rule: "Posterior and Threshold Probability are clearly distinguished",
        ruleNumber: 4,
        severity: "fail",
        detail: "Target probability is missing from decision clarity.",
      });
    }
    if (dc?.environmentStrength == null) {
      issues.push({
        rule: "Posterior and Threshold Probability are clearly distinguished",
        ruleNumber: 4,
        severity: "warn",
        detail: "Environment strength (posterior) is missing from decision clarity.",
      });
    }
  }
}

function checkRule5_VerdictMatchesThreshold(output: RespondOutput, body: VerifyRequest, issues: CoherenceIssue[]) {
  const thresholdProb = body.thresholdProbability ?? output.decision_clarity?.targetProbability;
  if (thresholdProb == null) return;

  const pct = thresholdProb * 100;
  const rec = output.strategic_recommendation.toLowerCase();

  let expectedVerdict: "likely" | "unlikely" | "uncertain";
  if (pct >= 60) expectedVerdict = "likely";
  else if (pct >= 40) expectedVerdict = "uncertain";
  else expectedVerdict = "unlikely";

  const saysLikely = rec.includes("likely") && !rec.includes("unlikely");
  const saysUnlikely = rec.includes("unlikely");
  const saysUncertain = rec.includes("uncertain") || rec.includes("conditional");

  if (expectedVerdict === "unlikely" && saysLikely && !saysUnlikely) {
    issues.push({
      rule: "Verdict language matches Threshold Probability",
      ruleNumber: 5,
      severity: "fail",
      detail: `Threshold probability is ${pct.toFixed(0)}% (unlikely) but recommendation says "likely". This is a critical contradiction.`,
    });
  }

  if (expectedVerdict === "likely" && saysUnlikely) {
    issues.push({
      rule: "Verdict language matches Threshold Probability",
      ruleNumber: 5,
      severity: "fail",
      detail: `Threshold probability is ${pct.toFixed(0)}% (likely) but recommendation says "unlikely". This is a critical contradiction.`,
    });
  }

  if (expectedVerdict === "unlikely" && !saysUnlikely && !saysUncertain) {
    issues.push({
      rule: "Verdict language matches Threshold Probability",
      ruleNumber: 5,
      severity: "warn",
      detail: `Threshold probability is ${pct.toFixed(0)}% (unlikely) but recommendation does not explicitly say "unlikely." Consider making the verdict clearer.`,
    });
  }
}

function checkRule6_PrimaryConstraintNamed(output: RespondOutput, issues: CoherenceIssue[]) {
  if (!output.primary_constraint || output.primary_constraint.trim().length < 20) {
    issues.push({
      rule: "Primary constraint is named",
      ruleNumber: 6,
      severity: "fail",
      detail: "The primary constraint section is missing or too brief to be meaningful.",
    });
  }

  const sentences = output.primary_constraint.split(/\.\s+/).filter(Boolean);
  if (sentences.length > 5) {
    issues.push({
      rule: "Primary constraint is named",
      ruleNumber: 6,
      severity: "warn",
      detail: `Primary constraint section has ${sentences.length} sentences. Should be 2-4 sentences maximum for executive clarity.`,
    });
  }
}

function checkRule7_MainLeverNamed(output: RespondOutput, issues: CoherenceIssue[]) {
  if (!output.highest_impact_lever || output.highest_impact_lever.trim().length < 20) {
    issues.push({
      rule: "Main lever that would change the forecast is named",
      ruleNumber: 7,
      severity: "fail",
      detail: "The highest-impact lever section is missing or too brief.",
    });
  }

  const generic = [
    "further research",
    "additional studies",
    "engage stakeholders",
    "develop a strategy",
    "monitor the situation",
    "continue to evaluate",
  ];
  const leverLower = (output.highest_impact_lever || "").toLowerCase();
  for (const g of generic) {
    if (leverLower.includes(g)) {
      issues.push({
        rule: "Main lever that would change the forecast is named",
        ruleNumber: 7,
        severity: "warn",
        detail: `Lever contains generic language ("${g}"). Should name a specific, operational action.`,
      });
      break;
    }
  }
}

function checkRule8_DriversAndConstraintReflected(output: RespondOutput, signalDetails: SignalDetail[], issues: CoherenceIssue[]) {
  if (!signalDetails.length) return;

  const positiveDrivers = [...signalDetails]
    .filter(s => (s.pointContribution ?? 0) > 0)
    .sort((a, b) => (b.pointContribution ?? 0) - (a.pointContribution ?? 0));

  const negativeDrivers = [...signalDetails]
    .filter(s => (s.pointContribution ?? 0) < 0)
    .sort((a, b) => (a.pointContribution ?? 0) - (b.pointContribution ?? 0));

  const topPositive = positiveDrivers[0] || null;
  const topNegative = negativeDrivers[0] || null;

  const recLower = output.strategic_recommendation.toLowerCase();
  const constraintLower = output.primary_constraint.toLowerCase();
  const leverLower = output.highest_impact_lever.toLowerCase();
  const allNarrative = `${recLower} ${constraintLower} ${leverLower}`;

  const failures: string[] = [];

  if (topPositive) {
    const keywords = extractKeyTerms((topPositive.description || "").toLowerCase());
    const mentioned = keywords.some(kw => allNarrative.includes(kw));
    if (!mentioned) {
      failures.push(`Top positive driver not referenced: ${topPositive.description?.slice(0, 80) || "unknown"}`);
    }
  }

  if (topNegative) {
    const keywords = extractKeyTerms((topNegative.description || "").toLowerCase());
    const mentionedInConstraint = keywords.some(kw => constraintLower.includes(kw));
    const mentionedAnywhere = keywords.some(kw => allNarrative.includes(kw));
    if (!mentionedAnywhere) {
      failures.push(`Top binding constraint not referenced: ${topNegative.description?.slice(0, 80) || "unknown"}`);
    } else if (!mentionedInConstraint) {
      issues.push({
        rule: "Recommendation explicitly reflects top positive drivers and top binding constraint",
        ruleNumber: 8,
        severity: "warn",
        detail: `Top binding constraint is mentioned but not in the primary_constraint section where it belongs.`,
      });
    }
  }

  if (topNegative) {
    const constraintKeywords = extractKeyTerms((topNegative.description || "").toLowerCase());
    const leverReferencesConstraint = constraintKeywords.some(kw => leverLower.includes(kw));
    if (!leverReferencesConstraint) {
      const constraintInConstraintSection = constraintKeywords.some(kw => constraintLower.includes(kw));
      if (constraintInConstraintSection) {
        issues.push({
          rule: "Recommendation explicitly reflects top positive drivers and top binding constraint",
          ruleNumber: 8,
          severity: "warn",
          detail: `Proposed lever is not logically tied to the primary constraint. The lever should address the binding constraint directly.`,
        });
      }
    }
  }

  if (failures.length > 0) {
    issues.push({
      rule: "Recommendation explicitly reflects top positive drivers and top binding constraint",
      ruleNumber: 8,
      severity: "fail",
      detail: failures.join(". "),
    });
  }
}

function checkRule9_NoRawDecimals(output: RespondOutput, issues: CoherenceIssue[]) {
  const allText = `${output.strategic_recommendation} ${output.primary_constraint} ${output.highest_impact_lever} ${output.realistic_ceiling}`;

  const rawDecimalPattern = /0\.\d{3,}/;
  if (rawDecimalPattern.test(allText)) {
    issues.push({
      rule: "No raw decimal probabilities in user-facing output",
      ruleNumber: 9,
      severity: "fail",
      detail: "Output contains raw decimal probability (e.g. 0.178...). All probabilities must be displayed as rounded percentages (e.g. 18%).",
    });
  }
}

function checkRule10_NoInternalIDs(output: RespondOutput, signalDetails: SignalDetail[], issues: CoherenceIssue[]) {
  const allText = `${output.strategic_recommendation} ${output.primary_constraint} ${output.highest_impact_lever} ${output.realistic_ceiling}`;

  const idPattern = /\b[A-Z]{2,4}-\d{2,4}\b/;
  if (idPattern.test(allText)) {
    issues.push({
      rule: "No internal signal IDs in user-facing output",
      ruleNumber: 10,
      severity: "fail",
      detail: "Output contains internal signal identifiers (e.g. CS-001). Refer to signals by descriptive name only.",
    });
  }
}

function extractKeyTerms(description: string): string[] {
  const terms: string[] = [];
  const pharmaTerms = description.match(
    /(?:nebuliz|bronchospasm|rems|fev1|discontinu|tolerab|formulary|payer|prescrib|adoption|amikacin|inhala|sputum|culture conversion|mac |ntm |arikayce|refractory|specialist|pulmonolog|competitive|off-label|population|iv amikacin)/gi
  );
  if (pharmaTerms) {
    terms.push(...pharmaTerms.map(t => t.toLowerCase()));
  }

  const nounPhrases = description.match(/\b[a-z]{4,}\s+[a-z]{4,}\b/gi);
  if (nounPhrases) {
    terms.push(...nounPhrases.slice(0, 3).map(t => t.toLowerCase()));
  }

  return [...new Set(terms)];
}

async function attemptCoherenceCorrection(
  original: RespondOutput,
  issues: CoherenceIssue[],
  body: VerifyRequest,
): Promise<RespondOutput | null> {
  const failIssues = issues.filter(i => i.severity === "fail");
  if (failIssues.length === 0) return null;

  const thresholdPct = body.thresholdProbability != null ? Math.round(body.thresholdProbability * 100) : null;
  const posteriorPct = body.posteriorProbability != null ? Math.round(body.posteriorProbability * 100) : null;

  try {
    const issueList = failIssues.map(i => `- Rule ${i.ruleNumber} (${i.rule}): ${i.detail}`).join("\n");

    const systemPrompt = `You are a coherence verifier for executive forecasting briefs. You fix presentation and coherence issues ONLY. You cannot change probabilities, priors, signal weights, or invent new information.

BOUNDARY RULES — ABSOLUTE:
- Cannot change any probability number
- Cannot change priors
- Cannot change signal weights
- Cannot invent new signals or drivers
- Can ONLY fix wording, structure, and coherence

EXECUTIVE FORMATTING RULES:
- All probabilities must be rounded whole-number percentages (e.g. "18%" not "0.178...")
- NEVER include internal signal identifiers (CS-001, CS-002, SIG-xxx etc). Refer to signals by descriptive name only.
- The recommendation must reference the top positive driver and the top binding constraint by name
- The proposed lever must be logically tied to the primary constraint
- Write for an executive reader: concise, plain language, no technical notation

Fix the output to address ONLY the listed issues. Keep everything else unchanged. Return valid JSON with the same 4 keys.`;

    const userPrompt = `The following executive brief has coherence issues that need fixing:

ORIGINAL OUTPUT:
strategic_recommendation: ${original.strategic_recommendation}
primary_constraint: ${original.primary_constraint}
highest_impact_lever: ${original.highest_impact_lever}
realistic_ceiling: ${original.realistic_ceiling}

COHERENCE ISSUES FOUND:
${issueList}

CASE CONTEXT:
- Strategic question: ${body.strategicQuestion || "Not provided"}
- Success definition: ${body.successDefinition || "Not provided"}
- Outcome threshold: ${body.outcomeThreshold || "Not provided"}
- Time horizon: ${body.timeHorizon || "Not provided"}
- Probability of achieving target: ${thresholdPct != null ? `${thresholdPct}%` : "Not provided"}
- Overall environment strength: ${posteriorPct != null ? `${posteriorPct}%` : "Not provided"}

TOP SIGNAL DRIVERS:
${(body.signalDetails || []).slice(0, 5).map(s => `- ${s.description || "?"} (contribution: ${s.pointContribution != null ? `${(s.pointContribution * 100).toFixed(1)}pp` : "?"})`).join("\n")}

Fix ONLY the issues listed. Do not change information that is already correct. Return JSON:
{
  "strategic_recommendation": "...",
  "primary_constraint": "...",
  "highest_impact_lever": "...",
  "realistic_ceiling": "..."
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 1200,
      temperature: 0,
      seed: 42,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return null;

    const parsed = JSON.parse(content);
    return {
      strategic_recommendation: typeof parsed.strategic_recommendation === "string" ? parsed.strategic_recommendation : original.strategic_recommendation,
      primary_constraint: typeof parsed.primary_constraint === "string" ? parsed.primary_constraint : original.primary_constraint,
      highest_impact_lever: typeof parsed.highest_impact_lever === "string" ? parsed.highest_impact_lever : original.highest_impact_lever,
      realistic_ceiling: typeof parsed.realistic_ceiling === "string" ? parsed.realistic_ceiling : original.realistic_ceiling,
      decision_clarity: original.decision_clarity,
    };
  } catch (err: any) {
    console.error("[agent-coherence] Correction failed:", err?.message || err);
    return null;
  }
}

export default router;
