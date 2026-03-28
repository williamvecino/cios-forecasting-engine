import type { ExecutiveJudgmentResult, PrimaryConstraint, AnalogCaseDetail } from "./judgment-engine";

export type AnswerCategory = "explanation" | "counterfactual" | "resolution" | "interpretation" | "unanswerable";

export interface CaseAnswer {
  category: AnswerCategory;
  categoryLabel: string;
  answer: string;
  evidence: string[];
  affectedVariable: string | null;
  directionalEffect: string | null;
  sourceLabel: string;
  followUp: string | null;
  followUpQuery: string | null;
}

export interface GateScenarioInput {
  gateLabel: string;
  gateStatus: string;
  upgradedProbability: number | null;
  downgradedProbability: number | null;
  baseProbability: number;
  delta: number | null;
}

export interface CaseContext {
  questionText: string;
  gates: GateScenarioInput[];
  drivers: { name: string; direction: "Upward" | "Downward"; strength: string; contributionPoints: number }[];
}

const TERM_DEFINITIONS: Record<string, string> = {
  "operational readiness": "The ability of treatment sites to deliver the therapy smoothly, covering workflow, staffing, equipment, and administrative processes.",
  "access readiness": "The extent to which payer coverage, prior authorization, and patient cost exposure enable or restrict therapy availability.",
  "payer access": "The degree to which health plans provide coverage and minimize administrative barriers to prescribing.",
  "reimbursement readiness": "The clarity and reliability of coding, billing, and coverage pathways for the therapy.",
  "behavioral readiness": "Physician familiarity, perceived benefit-risk balance, and willingness to change prescribing habits.",
  "clinical confidence": "The strength of clinical evidence supporting the therapy's efficacy and safety profile.",
  "clinical evidence": "The body of trial data, real-world evidence, and guideline support backing the therapy.",
  "workflow integration": "How smoothly the therapy fits into existing clinic scheduling, EMR documentation, and patient flow.",
  "market readiness": "The competitive landscape, field force deployment, distribution channels, and patient awareness.",
  "adoption readiness": "Provider familiarity, patient identification pathways, prescribing confidence, and switching costs.",
  "infrastructure readiness": "Facility requirements, supply chain reliability, IT compatibility, and storage needs.",
  "execution risk": "The likelihood that launch timelines, cross-functional coordination, and regulatory compliance will stay on track.",
  "implementation complexity": "The degree of training, process redesign, and multi-stakeholder coordination required.",
  "stakeholder alignment": "The extent of physician, payer, internal leadership, and patient advocacy buy-in.",
  "system capacity": "Available staff capacity, appointment availability, lab throughput, and referral bandwidth.",
  "resource availability": "Staff, time, budget, and equipment available to support therapy adoption.",
  "training readiness": "Clinical and administrative staff knowledge, training programs, and competency assessments.",
  "regulatory readiness": "Label clarity, post-marketing requirements, REMS programs, and compliance monitoring.",
  "guideline endorsement": "Positioning in clinical guidelines, committee receptivity, and evidence threshold for inclusion.",
  "confidence": "A composite measure reflecting how well-supported the forecast is by evidence, gate resolution, and analogue alignment.",
  "execution gap": "The difference between what the evidence outlook suggests and what real-world barriers allow — the larger the gap, the more constraints are holding back the outcome.",
  "probability": "The system's estimated likelihood of the forecasted outcome occurring, based on evidence, constraints, and historical precedent.",
  "forecast": "The system's best estimate of the most likely outcome, derived from signals, gate constraints, and calibration.",
  "gate": "An execution prerequisite that must be resolved before adoption can proceed. Gates can be strong (cleared), moderate (partially resolved), or weak (unresolved).",
  "driver": "A specific factor actively influencing the forecast — either pushing the outcome upward (positive driver) or holding it back (negative driver).",
  "reversal trigger": "A specific event or change that would materially alter the current outlook if it occurred.",
  "monitor list": "Key items the system recommends tracking because they have the highest potential to change the forecast.",
  "decision posture": "The recommended strategic stance based on the current probability, confidence, and constraint landscape.",
  "analogue": "A historical precedent case with similar clinical and market characteristics, used to ground the forecast in real-world outcomes.",
  "analog": "A historical precedent case with similar clinical and market characteristics, used to ground the forecast in real-world outcomes.",
  "constraint": "A barrier or limitation that caps the achievable probability regardless of positive evidence.",
  "case type": "A label describing the overall pattern of this forecast case, derived from gate and driver conditions.",
  "uncertainty": "The type and degree of ambiguity remaining in the forecast, classified by its primary source.",
  "posture": "The recommended strategic stance — the system's suggestion for how to act given the current probability, confidence, and constraints.",
  "convergence": "How closely different data sources (signals, gates, analogues) agree on the outlook. Higher convergence supports higher confidence.",
  "signal": "An observed or derived piece of evidence that shifts the forecast probability upward or downward.",
  "signal hierarchy": "The ranked ordering of evidence signals from dominant (strongest) through supporting, neutral, to weak/non-confirmatory (contradictory). Every endpoint is evaluated individually before overall judgment.",
  "evidence hierarchy": "The ranked ordering of evidence signals from dominant (strongest) through supporting, neutral, to weak/non-confirmatory (contradictory). Every endpoint is evaluated individually before overall judgment.",
  "dominant signal": "A signal classified as the primary driver of the forecast — high strength with strong relative contribution. Messaging and adoption strategy should emphasize dominant signals.",
  "supporting signal": "A signal that reinforces the outlook but is not independently decisive. It supports the dominant evidence pattern.",
  "contradictory signal": "A signal that is weak, non-confirmatory, or acts against the primary evidence direction. Claims based on contradictory signals should be avoided.",
  "signal imbalance": "A detected mismatch between strong and weak evidence domains — indicates potential strategic risk where objections may arise in areas with non-confirmatory evidence.",
  "lever": "The highest-impact action available to change the forecast — the single change expected to produce the largest improvement.",
  "integrity check": "An internal validation rule that ensures the judgment output is logically consistent (e.g., strong evidence cannot produce a contradictory outlook).",
  "audit trail": "The complete record of inputs, scoring breakdowns, rule traces, and integrity check results that produced the current judgment.",
};

function classifyQuestion(q: string): AnswerCategory {
  const lower = q.toLowerCase().trim();

  if (lower.match(/what happens if|what if|what would happen|if .+ changes?|if .+ improves?|if .+ worsens?|if .+ resolves?|if .+ is removed|if .+ were|if we changed|if the time|suppose|hypothetically|scenario/)) {
    return "counterfactual";
  }

  if (lower.match(/how do i|how can i|how to|what should|what is the highest.leverage|what.+addressed first|what.+priority|what.+action|what.+solve|what.+fix|recommend|suggest/)) {
    return "resolution";
  }

  if (lower.match(/why is|why does|why did|why the|why are|reason|because|what caused|what led to|how did .+ arrive|how was .+ calculated|what drove|what explains|where.+(strong|weak)|which.+(dominant|supporting|contradictory)|signal.+(hierarchy|balance|imbalance)|evidence.+hierarchy|endpoint.+strength/)) {
    return "explanation";
  }

  if (lower.match(/what does|what is|define|meaning|explain|what are|is this|due to|timing|access|behavior|evidence|relevant|tell me about|analog(?:ue)?[\s\-_]*\d+|what.+on it/)) {
    return "interpretation";
  }

  return "unanswerable";
}

const CATEGORY_LABELS: Record<AnswerCategory, string> = {
  explanation: "Explanation",
  counterfactual: "Scenario Analysis",
  resolution: "Recommended Action",
  interpretation: "Interpretation",
  unanswerable: "Insufficient Data",
};

function findTermMatch(question: string): { term: string; definition: string } | null {
  const lower = question.toLowerCase();
  const sortedKeys = Object.keys(TERM_DEFINITIONS).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      return { term: key, definition: TERM_DEFINITIONS[key] };
    }
  }
  return null;
}

function findMatchingGate(question: string, audit: ExecutiveJudgmentResult["_audit"]): typeof audit.inputs.gateStates[number] | null {
  const lower = question.toLowerCase();
  for (const gs of audit.inputs.gateStates) {
    if (lower.includes(gs.label.toLowerCase())) return gs;
  }
  return null;
}

function findMatchingConstraint(question: string, judgment: ExecutiveJudgmentResult): PrimaryConstraint | null {
  const lower = question.toLowerCase();
  for (const pc of judgment.primaryConstraints) {
    if (lower.includes(pc.label.toLowerCase())) return pc;
  }
  return null;
}

function findMatchingAnalog(question: string, judgment: ExecutiveJudgmentResult): AnalogCaseDetail | null {
  const lower = question.toLowerCase();
  for (const ac of judgment.analogCases) {
    if (lower.includes(ac.caseId.toLowerCase())) return ac;
    if (lower.includes(ac.brand.toLowerCase())) return ac;
  }
  const analogIdMatch = lower.match(/analog(?:ue)?[\s\-_]*(\d+)/);
  if (analogIdMatch) {
    const idx = parseInt(analogIdMatch[1], 10) - 1;
    if (idx >= 0 && idx < judgment.analogCases.length) return judgment.analogCases[idx];
  }
  return null;
}

function findMatchingDriver(question: string, judgment: ExecutiveJudgmentResult): string | null {
  const lower = question.toLowerCase();
  for (const d of judgment.keyDrivers) {
    if (lower.includes(d.toLowerCase())) return d;
  }
  return null;
}

function findMatchingGateScenario(question: string, caseCtx: CaseContext): GateScenarioInput | null {
  const lower = question.toLowerCase();
  for (const gs of caseCtx.gates) {
    if (lower.includes(gs.gateLabel.toLowerCase())) return gs;
  }
  return null;
}

function handleExplanation(question: string, judgment: ExecutiveJudgmentResult, caseCtx: CaseContext): CaseAnswer {
  const lower = question.toLowerCase();
  const audit = judgment._audit;

  if (lower.match(/why is the forecast|why is the probability|why is it \d|why .+ this (value|number|level|percentage)/)) {
    const gapText = audit.inputs.executionGapPts > 0
      ? `There is a ${audit.inputs.executionGapPts}-point execution gap between the evidence outlook (${audit.inputs.brandOutlookPct}%) and the gate-constrained forecast (${audit.inputs.finalForecastPct}%).`
      : "";
    const constraintText = judgment.primaryConstraints.length > 0
      ? `Active constraints: ${judgment.primaryConstraints.map(pc => `${pc.label} (${pc.status})`).join(", ")}.`
      : "No active constraints are limiting the forecast.";

    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: judgment.reasoning,
      evidence: [
        `Prior probability: ${audit.inputs.priorPct}%`,
        `Evidence outlook: ${audit.inputs.brandOutlookPct}%`,
        `Gate-constrained forecast: ${audit.inputs.finalForecastPct}%`,
        `Minimum gate cap: ${audit.inputs.minGateCapPct}%`,
        gapText,
        constraintText,
      ].filter(Boolean),
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: "Audit Trail — Forecast Path",
      followUp: judgment.primaryConstraints.length > 0
        ? `Ask "How do I solve ${judgment.primaryConstraints[0].label}?" for actionable guidance.`
        : null,
      followUpQuery: judgment.primaryConstraints.length > 0
        ? `How do I solve ${judgment.primaryConstraints[0].label}?`
        : null,
    };
  }

  if (lower.match(/why.+primary constraint|why.+holding|why.+constrain|why.+blocked/)) {
    const topConstraint = judgment.primaryConstraints[0];
    if (!topConstraint) {
      return {
        category: "explanation",
        categoryLabel: CATEGORY_LABELS.explanation,
        answer: "No active constraints are currently holding back the forecast. All gates are resolved at strong status.",
        evidence: audit.inputs.gateStates.map(g => `${g.label}: ${g.status} (cap: ${g.capPct}%)`),
        affectedVariable: null,
        directionalEffect: null,
        sourceLabel: "Gate Status Summary",
        followUp: null,
        followUpQuery: null,
      };
    }

    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: `"${topConstraint.label}" is the primary constraint because it is currently ${topConstraint.status} and its underlying drivers have the highest combined impact on the forecast. ${topConstraint.lever}`,
      evidence: topConstraint.drivers.map(d => `${d.name} — ${d.rank} impact (score: ${d.impactScore})`),
      affectedVariable: topConstraint.label,
      directionalEffect: null,
      sourceLabel: "Constraint Decomposition",
      followUp: `Ask "What happens if ${topConstraint.label} improves?" to see the projected effect.`,
      followUpQuery: `What happens if ${topConstraint.label} improves?`,
    };
  }

  if (lower.match(/why.+confidence|why.+(high|moderate|low) confidence|how.+confidence.+determined/)) {
    const ca = audit.confidenceAudit;
    const penalties: string[] = [];
    if (ca.conflictPenalty > 0) penalties.push(`Signal conflict penalty: −${ca.conflictPenalty}`);
    if (ca.gapPenalty > 0) penalties.push(`Execution gap penalty: −${ca.gapPenalty}`);

    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: `Confidence is ${ca.finalLevel} (raw score: ${ca.rawTotal.toFixed(1)}/100). This reflects gate resolution strength (${ca.gateResolutionScore}), analogue alignment (${ca.analogScore}), signal convergence (${ca.convergenceScore}), and gate count breadth (${ca.gateCountScore}).${penalties.length > 0 ? ` Penalties applied: ${penalties.join("; ")}.` : ""}`,
      evidence: [
        `Gate resolution: ${ca.gateResolutionScore}`,
        `Analogue alignment: ${ca.analogScore}`,
        `Signal convergence: ${ca.convergenceScore}`,
        `Gate count score: ${ca.gateCountScore}`,
        ...penalties,
        `Final level: ${ca.finalLevel}`,
      ],
      affectedVariable: "Confidence",
      directionalEffect: null,
      sourceLabel: "Confidence Audit",
      followUp: ca.conflictPenalty > 0
        ? "Resolving conflicting signals would improve confidence."
        : null,
      followUpQuery: null,
    };
  }

  if (lower.match(/why.+posture|why.+recommend|why.+stance/)) {
    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: `The decision posture is "${judgment.decisionPosture}" because this is a ${judgment.caseType} case. Rule triggered: ${audit.postureAudit.ruleTriggered}. Case pattern: ${audit.postureAudit.caseType}.`,
      evidence: [
        `Probability: ${Math.round(judgment.probability * 100)}%`,
        `Confidence: ${judgment.confidence}`,
        `Case type: ${judgment.caseType}`,
        `Rule: ${audit.postureAudit.ruleTriggered}`,
      ],
      affectedVariable: "Decision Posture",
      directionalEffect: null,
      sourceLabel: "Posture Audit",
      followUp: null,
      followUpQuery: null,
    };
  }

  if (lower.match(/why.+signal|where.+strong|where.+weak|which.+dominant|which.+supporting|signal.+hierarchy|evidence.+hierarchy|signal.+balance|signal.+imbalance|endpoint.+strength/)) {
    const sh = judgment.signalHierarchy;
    const imb = audit.signalImbalance;
    const domNames = sh.dominant.map(s => s.name).join(", ") || "None identified";
    const supNames = sh.supporting.map(s => s.name).join(", ") || "None";
    const contraNames = sh.contradictory.map(s => s.name).join(", ") || "None";

    const evidence: string[] = [
      `Dominant signals: ${domNames}`,
      `Supporting signals: ${supNames}`,
      `Weak/non-confirmatory: ${contraNames}`,
    ];
    if (imb.detected && imb.strategicRisk) {
      evidence.push(`Signal imbalance: ${imb.strategicRisk}`);
    }

    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: sh.strategicImplication,
      evidence,
      affectedVariable: "Evidence Hierarchy",
      directionalEffect: null,
      sourceLabel: "Signal Differentiation",
      followUp: sh.contradictory.length > 0
        ? `Ask "What happens if ${sh.contradictory[0].name} improves?" to see the projected effect.`
        : null,
      followUpQuery: sh.contradictory.length > 0
        ? `What happens if ${sh.contradictory[0].name} improves?`
        : null,
    };
  }

  if (lower.match(/why.+uncertainty|why.+uncertain/)) {
    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: judgment.uncertaintyExplanation,
      evidence: [
        `Uncertainty type: ${judgment.uncertaintyType}`,
        `Upward drivers: ${audit.inputs.upwardDriverCount}`,
        `Downward drivers: ${audit.inputs.downwardDriverCount}`,
      ],
      affectedVariable: "Uncertainty",
      directionalEffect: null,
      sourceLabel: "Uncertainty Classification",
      followUp: null,
      followUpQuery: null,
    };
  }

  const matchedConstraint = findMatchingConstraint(question, judgment);
  if (matchedConstraint) {
    return {
      category: "explanation",
      categoryLabel: CATEGORY_LABELS.explanation,
      answer: `"${matchedConstraint.label}" is currently ${matchedConstraint.status}. ${matchedConstraint.lever}`,
      evidence: matchedConstraint.drivers.map(d => `${d.name} — ${d.rank} impact (score: ${d.impactScore})`),
      affectedVariable: matchedConstraint.label,
      directionalEffect: null,
      sourceLabel: "Constraint Decomposition",
      followUp: `Ask "What happens if ${matchedConstraint.label} improves?" to see the effect.`,
    followUpQuery: `What happens if ${matchedConstraint.label} improves?`,
    };
  }

  return {
    category: "explanation",
    categoryLabel: CATEGORY_LABELS.explanation,
    answer: judgment.reasoning,
    evidence: [
      `Forecast: ${Math.round(judgment.probability * 100)}%`,
      `Confidence: ${judgment.confidence}`,
      `Posture: ${judgment.decisionPosture}`,
      ...judgment.keyDrivers.slice(0, 3).map(d => `Driver: ${d}`),
    ],
    affectedVariable: null,
    directionalEffect: null,
    sourceLabel: "Executive Judgment",
    followUp: null,
    followUpQuery: null,
  };
}

function handleCounterfactual(question: string, judgment: ExecutiveJudgmentResult, caseCtx: CaseContext): CaseAnswer {
  const lower = question.toLowerCase();

  const gateMatch = findMatchingGateScenario(question, caseCtx);
  if (gateMatch) {
    const isImproving = lower.match(/improve|resolve|upgrade|clear|strong|better/);
    const isWorsening = lower.match(/worsen|degrade|downgrade|regress|fail|weaker/);

    if (isImproving && gateMatch.upgradedProbability != null) {
      const delta = gateMatch.upgradedProbability - gateMatch.baseProbability;
      return {
        category: "counterfactual",
        categoryLabel: CATEGORY_LABELS.counterfactual,
        answer: `If "${gateMatch.gateLabel}" improves from its current state (${gateMatch.gateStatus}), the forecast would move from ${gateMatch.baseProbability}% to approximately ${gateMatch.upgradedProbability}% (${delta >= 0 ? "+" : ""}${delta} points). This is a scenario projection, not a recalculation.`,
        evidence: [
          `Current gate status: ${gateMatch.gateStatus}`,
          `Current forecast: ${gateMatch.baseProbability}%`,
          `Projected forecast: ${gateMatch.upgradedProbability}%`,
          `Change: ${delta >= 0 ? "+" : ""}${delta} points`,
        ],
        affectedVariable: gateMatch.gateLabel,
        directionalEffect: delta >= 0 ? `↑ +${delta} points` : `↓ ${delta} points`,
        sourceLabel: "Gate Scenario Projection",
        followUp: null,
        followUpQuery: null,
      };
    }

    if (isWorsening && gateMatch.downgradedProbability != null) {
      const delta = gateMatch.downgradedProbability - gateMatch.baseProbability;
      return {
        category: "counterfactual",
        categoryLabel: CATEGORY_LABELS.counterfactual,
        answer: `If "${gateMatch.gateLabel}" worsens from its current state (${gateMatch.gateStatus}), the forecast would move from ${gateMatch.baseProbability}% to approximately ${gateMatch.downgradedProbability}% (${delta} points). This is a scenario projection, not a recalculation.`,
        evidence: [
          `Current gate status: ${gateMatch.gateStatus}`,
          `Current forecast: ${gateMatch.baseProbability}%`,
          `Projected forecast: ${gateMatch.downgradedProbability}%`,
          `Change: ${delta} points`,
        ],
        affectedVariable: gateMatch.gateLabel,
        directionalEffect: `↓ ${delta} points`,
        sourceLabel: "Gate Scenario Projection",
        followUp: null,
        followUpQuery: null,
      };
    }

    if (gateMatch.delta != null && gateMatch.upgradedProbability != null) {
      return {
        category: "counterfactual",
        categoryLabel: CATEGORY_LABELS.counterfactual,
        answer: `If "${gateMatch.gateLabel}" (currently ${gateMatch.gateStatus}) improves one level, the forecast would change by approximately ${gateMatch.delta >= 0 ? "+" : ""}${gateMatch.delta} points (from ${gateMatch.baseProbability}% to ~${gateMatch.upgradedProbability}%). This is a scenario projection, not a recalculation.`,
        evidence: [
          `Current status: ${gateMatch.gateStatus}`,
          `Projected change: ${gateMatch.delta >= 0 ? "+" : ""}${gateMatch.delta} points`,
        ],
        affectedVariable: gateMatch.gateLabel,
        directionalEffect: gateMatch.delta >= 0 ? `↑ +${gateMatch.delta} points` : `↓ ${gateMatch.delta} points`,
        sourceLabel: "Gate Scenario Projection",
        followUp: null,
        followUpQuery: null,
      };
    }
  }

  if (lower.match(/signal|driver/)) {
    const matchedDriver = findMatchingDriver(question, judgment);
    if (matchedDriver) {
      const driverData = caseCtx.drivers.find(d => d.name.toLowerCase() === matchedDriver.toLowerCase());
      if (driverData) {
        const oppositeDir = driverData.direction === "Upward" ? "downward" : "upward";
        return {
          category: "counterfactual",
          categoryLabel: CATEGORY_LABELS.counterfactual,
          answer: `"${driverData.name}" is currently a ${driverData.direction.toLowerCase()} driver with ${driverData.strength} strength, contributing ${driverData.contributionPoints} points. If this signal were reversed or removed, the forecast would shift ${oppositeDir} by approximately ${Math.abs(driverData.contributionPoints)} points. This is a directional estimate, not a recalculation.`,
          evidence: [
            `Direction: ${driverData.direction}`,
            `Strength: ${driverData.strength}`,
            `Contribution: ${driverData.contributionPoints} points`,
          ],
          affectedVariable: driverData.name,
          directionalEffect: `${oppositeDir === "upward" ? "↑" : "↓"} ~${Math.abs(driverData.contributionPoints)} points if reversed`,
          sourceLabel: "Driver Analysis",
          followUp: null,
          followUpQuery: null,
        };
      }
    }

    return {
      category: "counterfactual",
      categoryLabel: CATEGORY_LABELS.counterfactual,
      answer: `The case has ${caseCtx.drivers.filter(d => d.direction === "Upward").length} upward drivers and ${caseCtx.drivers.filter(d => d.direction === "Downward").length} downward drivers. To see the effect of a specific signal change, name the driver or gate in your question.`,
      evidence: caseCtx.drivers.slice(0, 5).map(d => `${d.direction === "Upward" ? "↑" : "↓"} ${d.name} (${d.strength}, ${d.contributionPoints}pts)`),
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: "Driver Summary",
      followUp: "Try asking about a specific gate by name, e.g., 'What if payer access improves?'",
      followUpQuery: "What if payer access improves?",
    };
  }

  if (lower.match(/time|horizon|timeline|deadline|extended|shorter|longer/)) {
    const timingGate = caseCtx.gates.find(g => /time|horizon|timeline|feasibility/i.test(g.gateLabel));
    if (timingGate) {
      return {
        category: "counterfactual",
        categoryLabel: CATEGORY_LABELS.counterfactual,
        answer: `The timing-related gate "${timingGate.gateLabel}" is currently ${timingGate.gateStatus}. Current forecast: ${timingGate.baseProbability}%.${timingGate.upgradedProbability != null ? ` If this gate improves, the forecast could move to approximately ${timingGate.upgradedProbability}%.` : ""} The time horizon is embedded in the forecast question and gates — changing it would require re-framing the question and regenerating the event decomposition.`,
        evidence: [
          `Gate: ${timingGate.gateLabel}`,
          `Status: ${timingGate.gateStatus}`,
          `Current forecast: ${timingGate.baseProbability}%`,
        ],
        affectedVariable: "Time Horizon",
        directionalEffect: "Extending the horizon generally improves gate resolution probability; shortening it increases execution risk.",
        sourceLabel: "Gate Analysis",
        followUp: null,
        followUpQuery: null,
      };
    }

    return {
      category: "counterfactual",
      categoryLabel: CATEGORY_LABELS.counterfactual,
      answer: "The time horizon is embedded in the forecast question. Changing it would require re-framing the question and regenerating event gates. The system cannot simulate time horizon changes from current data alone — this would need a new forecast run.",
      evidence: [`Current question: "${caseCtx.questionText}"`],
      affectedVariable: "Time Horizon",
      directionalEffect: "Extending the horizon generally improves gate resolution probability; shortening it increases execution risk.",
      sourceLabel: "System Limitation",
      followUp: "Consider re-running the forecast with a modified time horizon in the question.",
      followUpQuery: null,
    };
  }

  if (caseCtx.gates.length > 0) {
    const bestGate = [...caseCtx.gates]
      .filter(g => g.delta != null && g.delta > 0)
      .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))[0];

    if (bestGate) {
      return {
        category: "counterfactual",
        categoryLabel: CATEGORY_LABELS.counterfactual,
        answer: `The gate with the largest potential impact is "${bestGate.gateLabel}" (${bestGate.gateStatus}). Improving it one level would shift the forecast by approximately +${bestGate.delta} points. To ask about a specific gate or signal, mention it by name.`,
        evidence: caseCtx.gates
          .filter(g => g.delta != null && g.delta !== 0)
          .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
          .slice(0, 4)
          .map(g => `${g.gateLabel}: ${g.gateStatus} → +${g.delta} pts if improved`),
        affectedVariable: bestGate.gateLabel,
        directionalEffect: `↑ +${bestGate.delta} points`,
        sourceLabel: "Gate Scenario Summary",
        followUp: `Ask "What happens if ${bestGate.gateLabel} improves?" for details.`,
        followUpQuery: `What happens if ${bestGate.gateLabel} improves?`,
      };
    }
  }

  return makeUnanswerable(question, judgment, caseCtx, "The system cannot determine which variable you are asking about. Try naming a specific gate, driver, or signal.");
}

function handleResolution(question: string, judgment: ExecutiveJudgmentResult, caseCtx: CaseContext): CaseAnswer {
  const lower = question.toLowerCase();

  if (lower.match(/highest.leverage|most important|biggest impact|single.+action|one thing/)) {
    if (judgment.primaryConstraints.length > 0) {
      const top = judgment.primaryConstraints[0];
      const topDriver = top.drivers[0];
      return {
        category: "resolution",
        categoryLabel: CATEGORY_LABELS.resolution,
        answer: `The highest-leverage action is addressing "${topDriver?.name || top.label}" within the "${top.label}" constraint. ${top.lever}`,
        evidence: [
          `Primary constraint: ${top.label} (${top.status})`,
          ...top.drivers.map(d => `${d.name} — ${d.rank} impact (score: ${d.impactScore})`),
        ],
        affectedVariable: top.label,
        directionalEffect: null,
        sourceLabel: "Constraint Decomposition — Lever Analysis",
        followUp: null,
        followUpQuery: null,
      };
    }

    return {
      category: "resolution",
      categoryLabel: CATEGORY_LABELS.resolution,
      answer: "No active constraints are holding back the forecast. The recommended posture is: " + judgment.decisionPosture,
      evidence: [`Forecast: ${Math.round(judgment.probability * 100)}%`, `Confidence: ${judgment.confidence}`],
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: "Executive Judgment",
      followUp: null,
      followUpQuery: null,
    };
  }

  if (lower.match(/addressed first|priority|first step|where to start|sequence|order/)) {
    if (judgment.primaryConstraints.length === 0) {
      return {
        category: "resolution",
        categoryLabel: CATEGORY_LABELS.resolution,
        answer: "All gates are resolved. The next best question to answer is: " + judgment.nextBestQuestion,
        evidence: [],
        affectedVariable: null,
        directionalEffect: null,
        sourceLabel: "Executive Judgment",
        followUp: null,
        followUpQuery: null,
      };
    }

    const ordered = [...judgment.primaryConstraints];
    const lines = ordered.map((pc, i) => `${i + 1}. ${pc.label} (${pc.status}) — Top driver: ${pc.drivers[0]?.name || "N/A"}`);

    return {
      category: "resolution",
      categoryLabel: CATEGORY_LABELS.resolution,
      answer: `Address constraints in this order based on impact and feasibility:\n${lines.join("\n")}\n\nStart with "${ordered[0].label}": ${ordered[0].lever}`,
      evidence: ordered.flatMap(pc => pc.drivers.slice(0, 2).map(d => `[${pc.label}] ${d.name} — ${d.rank} impact`)),
      affectedVariable: ordered[0].label,
      directionalEffect: null,
      sourceLabel: "Constraint Priority Ranking",
      followUp: null,
      followUpQuery: null,
    };
  }

  const matchedConstraint = findMatchingConstraint(question, judgment);
  if (matchedConstraint) {
    return {
      category: "resolution",
      categoryLabel: CATEGORY_LABELS.resolution,
      answer: `To resolve "${matchedConstraint.label}" (currently ${matchedConstraint.status}): ${matchedConstraint.lever}`,
      evidence: matchedConstraint.drivers.map(d => `${d.name} — ${d.rank} impact (score: ${d.impactScore})`),
      affectedVariable: matchedConstraint.label,
      directionalEffect: null,
      sourceLabel: "Constraint Decomposition — Lever Analysis",
      followUp: `Ask "What happens if ${matchedConstraint.label} improves?" to see the projected effect.`,
      followUpQuery: null,
    };
  }

  if (judgment.primaryConstraints.length > 0) {
    const top = judgment.primaryConstraints[0];
    return {
      category: "resolution",
      categoryLabel: CATEGORY_LABELS.resolution,
      answer: `The primary constraint is "${top.label}" (${top.status}). ${top.lever}`,
      evidence: top.drivers.map(d => `${d.name} — ${d.rank} impact`),
      affectedVariable: top.label,
      directionalEffect: null,
      sourceLabel: "Constraint Decomposition",
      followUp: judgment.primaryConstraints.length > 1
          ? `There are ${judgment.primaryConstraints.length} active constraints. Ask "What should be addressed first?" for the full priority sequence.`
          : null,
        followUpQuery: judgment.primaryConstraints.length > 1
          ? "What should be addressed first?"
          : null,
      };
  }

  return {
    category: "resolution",
    categoryLabel: CATEGORY_LABELS.resolution,
    answer: `Current posture: ${judgment.decisionPosture}. The most important question to answer next: ${judgment.nextBestQuestion}`,
    evidence: judgment.monitorList.slice(0, 3).map(m => `Monitor: ${m.label} — ${m.reason}`),
    affectedVariable: null,
    directionalEffect: null,
    sourceLabel: "Executive Judgment",
    followUp: null,
    followUpQuery: null,
  };
}

function handleInterpretation(question: string, judgment: ExecutiveJudgmentResult, caseCtx: CaseContext): CaseAnswer {
  const lower = question.toLowerCase();

  const analogMatch = findMatchingAnalog(question, judgment);
  if (analogMatch) {
    const dims = analogMatch.matchedDimensions.length > 0
      ? `Matched on: ${analogMatch.matchedDimensions.join(", ")}.`
      : "";
    const diffs = analogMatch.keyDifferences.length > 0
      ? `Key differences from this case: ${analogMatch.keyDifferences.join(", ")}.`
      : "";

    return {
      category: "interpretation",
      categoryLabel: CATEGORY_LABELS.interpretation,
      answer: `${analogMatch.caseId}: ${analogMatch.brand} — ${analogMatch.indication}.\n\nOutcome: ${analogMatch.outcome}.\nSimilarity: ${analogMatch.similarity} (${Math.round(analogMatch.similarityScore * 100)}% match, ${analogMatch.confidence} confidence).\n${dims ? `\n${dims}` : ""}${diffs ? `\n${diffs}` : ""}\n\nKey lesson: ${analogMatch.lesson}${analogMatch.keyBarrier ? `\nKey barrier encountered: ${analogMatch.keyBarrier}` : ""}${analogMatch.keyEnabler ? `\nKey enabler: ${analogMatch.keyEnabler}` : ""}`,
      evidence: [
        `Case ID: ${analogMatch.caseId}`,
        `Brand: ${analogMatch.brand}`,
        `Indication: ${analogMatch.indication}`,
        `Observed outcome: ${analogMatch.outcome}`,
        `Similarity score: ${Math.round(analogMatch.similarityScore * 100)}%`,
        `Confidence band: ${analogMatch.confidence}`,
        analogMatch.keyBarrier ? `Key barrier: ${analogMatch.keyBarrier}` : "",
        analogMatch.keyEnabler ? `Key enabler: ${analogMatch.keyEnabler}` : "",
        ...analogMatch.matchedDimensions.map(d => `Matched dimension: ${d}`),
        ...analogMatch.keyDifferences.map(d => `Difference: ${d}`),
      ].filter(Boolean),
      affectedVariable: analogMatch.brand,
      directionalEffect: null,
      sourceLabel: "Historical Precedent — Case Detail",
      followUp: analogMatch.keyBarrier
        ? `Ask "What happens if ${analogMatch.keyBarrier.split(/[,.]/, 1)[0].toLowerCase()} resolves?" to see the projected impact.`
        : null,
      followUpQuery: analogMatch.keyBarrier
        ? `What happens if ${analogMatch.keyBarrier.split(/[,.]/, 1)[0].toLowerCase()} resolves?`
        : null,
    };
  }

  const termMatch = findTermMatch(question);
  if (termMatch) {
    let contextNote = "";

    for (const pc of judgment.primaryConstraints) {
      if (pc.label.toLowerCase().includes(termMatch.term) || termMatch.term.includes(pc.label.toLowerCase())) {
        contextNote = `In this case, "${pc.label}" is currently ${pc.status}. ${pc.lever}`;
        break;
      }
    }
    if (!contextNote) {
      for (const ac of judgment.analogCases) {
        if (ac.brand.toLowerCase().includes(termMatch.term) || termMatch.term.includes(ac.brand.toLowerCase())) {
          contextNote = `Referenced as historical precedent: ${ac.brand} (${ac.indication}). Outcome: ${ac.outcome}. Confidence: ${ac.confidence}. Lesson: ${ac.lesson}`;
          break;
        }
      }
    }
    if (!contextNote) {
      for (const t of judgment.reversalTriggers) {
        if (t.description.toLowerCase().includes(termMatch.term)) {
          contextNote = `Identified as a reversal trigger — a change here would ${t.direction === "upward" ? "improve" : "worsen"} the outlook.`;
          break;
        }
      }
    }
    if (!contextNote) {
      for (const m of judgment.monitorList) {
        if (m.label.toLowerCase().includes(termMatch.term)) {
          contextNote = `On the monitor list: ${m.reason}`;
          break;
        }
      }
    }

    return {
      category: "interpretation",
      categoryLabel: CATEGORY_LABELS.interpretation,
      answer: termMatch.definition + (contextNote ? `\n\n${contextNote}` : ""),
      evidence: contextNote ? [contextNote] : [],
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: contextNote ? "Case Context" : "Term Definition",
      followUp: null,
      followUpQuery: null,
    };
  }

  if (lower.match(/due to|because of|timing|access|behavior|evidence|is this.+problem/)) {
    const categories: { label: string; found: boolean; detail: string }[] = [];

    const hasTimingIssue = judgment._audit.inputs.gateStates.some(g =>
      /time|horizon|timeline|feasibility/i.test(g.label) && (g.status === "weak" || g.status === "unresolved")
    );
    categories.push({ label: "Timing", found: hasTimingIssue, detail: hasTimingIssue ? "A timing-related gate is unresolved or weak." : "No timing-related barriers identified." });

    const hasAccessIssue = judgment._audit.inputs.gateStates.some(g =>
      /access|payer|reimbursement|formulary|authorization/i.test(g.label) && (g.status === "weak" || g.status === "unresolved")
    );
    categories.push({ label: "Access", found: hasAccessIssue, detail: hasAccessIssue ? "A payer/access gate is unresolved or weak." : "No access barriers identified." });

    const hasBehaviorIssue = judgment._audit.inputs.gateStates.some(g =>
      /behavior|adoption|prescrib|familiarity|confidence/i.test(g.label) && (g.status === "weak" || g.status === "unresolved")
    );
    categories.push({ label: "Behavior", found: hasBehaviorIssue, detail: hasBehaviorIssue ? "A behavioral/adoption gate is unresolved or weak." : "No behavioral barriers identified." });

    const hasEvidenceIssue = judgment._audit.inputs.gateStates.some(g =>
      /evidence|clinical|efficacy|trial|data/i.test(g.label) && (g.status === "weak" || g.status === "unresolved")
    );
    categories.push({ label: "Evidence", found: hasEvidenceIssue, detail: hasEvidenceIssue ? "A clinical evidence gate is unresolved or weak." : "Evidence gates are resolved." });

    const activeIssues = categories.filter(c => c.found);
    const primaryCause = activeIssues.length > 0
      ? `The primary barrier category is ${activeIssues[0].label}. ${activeIssues.map(c => c.detail).join(" ")}`
      : "No clear barrier category is dominant — the issue may be distributed across multiple dimensions.";

    return {
      category: "interpretation",
      categoryLabel: CATEGORY_LABELS.interpretation,
      answer: primaryCause,
      evidence: categories.map(c => `${c.found ? "●" : "○"} ${c.label}: ${c.detail}`),
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: "Barrier Category Analysis",
      followUp: activeIssues.length > 0
          ? `Ask "How do I solve ${activeIssues[0].label.toLowerCase()}?" for actionable guidance.`
          : null,
        followUpQuery: activeIssues.length > 0
          ? `How do I solve ${activeIssues[0].label.toLowerCase()}?`
          : null,
      };
  }

  if (lower.match(/what.+on it|summary|overview|summarize|what.+case|what.+this|tell me everything|break.*down/)) {
    const constraintSummary = judgment.primaryConstraints.length > 0
      ? `Primary constraints: ${judgment.primaryConstraints.map(pc => `${pc.label} (${pc.status})`).join(", ")}.`
      : "No active constraints.";
    const analogSummary = judgment.analogCases.length > 0
      ? `Historical precedents: ${judgment.analogCases.map(ac => `${ac.caseId} — ${ac.brand} (${ac.indication}, ${ac.confidence} confidence)`).join("; ")}.`
      : "No historical precedents identified.";
    const sh = judgment.signalHierarchy;
    const signalSummary = sh.dominant.length > 0
      ? `Dominant evidence: ${sh.dominant.map(s => s.name).join(", ")}. ${sh.contradictory.length > 0 ? `Weak/non-confirmatory: ${sh.contradictory.map(s => s.name).join(", ")}.` : ""}`
      : "No dominant signals identified.";

    return {
      category: "interpretation",
      categoryLabel: CATEGORY_LABELS.interpretation,
      answer: `Current forecast: ${judgment.probability}% — ${judgment.mostLikelyOutcome}. Confidence: ${judgment.confidence}. ${constraintSummary} ${signalSummary} ${analogSummary}\n\nPosture: ${judgment.decisionPosture}`,
      evidence: [
        `Probability: ${judgment.probability}%`,
        `Outcome: ${judgment.mostLikelyOutcome}`,
        `Confidence: ${judgment.confidence}`,
        `Uncertainty: ${judgment.uncertaintyType}`,
        constraintSummary,
        signalSummary,
        analogSummary,
      ],
      affectedVariable: null,
      directionalEffect: null,
      sourceLabel: "Case Summary",
      followUp: judgment.primaryConstraints.length > 0
        ? `Ask "What should be addressed first?" for the priority constraint.`
        : `Ask "Where is the evidence strong?" for the signal hierarchy.`,
      followUpQuery: judgment.primaryConstraints.length > 0
        ? "What should be addressed first?"
        : "Where is the evidence strong?",
    };
  }

  return makeUnanswerable(question, judgment, caseCtx, `The system could not find a specific term, gate, or analogue matching your question in the current case data. Try asking about a specific element visible in the judgment panel.`);
}

function makeUnanswerable(question: string, judgment: ExecutiveJudgmentResult, _caseCtx: CaseContext, reason: string): CaseAnswer {
  return {
    category: "unanswerable",
    categoryLabel: CATEGORY_LABELS.unanswerable,
    answer: reason,
    evidence: [],
    affectedVariable: null,
    directionalEffect: null,
    sourceLabel: "System",
    followUp: "Try asking: \"Why is the forecast this value?\", \"What should be addressed first?\", or \"What happens if [gate name] improves?\"",
    followUpQuery: "Why is the forecast this value?",
  };
}

export function askCIOS(
  question: string,
  judgment: ExecutiveJudgmentResult,
  caseCtx: CaseContext,
): CaseAnswer {
  const category = classifyQuestion(question);

  switch (category) {
    case "explanation":
      return handleExplanation(question, judgment, caseCtx);
    case "counterfactual":
      return handleCounterfactual(question, judgment, caseCtx);
    case "resolution":
      return handleResolution(question, judgment, caseCtx);
    case "interpretation":
      return handleInterpretation(question, judgment, caseCtx);
    default:
      return makeUnanswerable(question, judgment, caseCtx, "The system cannot determine the intent of this question from the available case data. Please rephrase or ask about a specific forecast element.");
  }
}
