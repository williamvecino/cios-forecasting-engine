export interface AgentContract {
  name: string;
  purpose: string;
  input: string[];
  output: string[];
  boundary: string[];
  implementationFiles: string[];
  downstreamConsumer: string;
}

export const AGENT_REGISTRY: Record<string, AgentContract> = {

  questionStructuring: {
    name: "Question Structuring Agent",
    purpose: "Convert an initial question into a forecastable decision.",
    input: [
      "User question (free text)",
    ],
    output: [
      "Structured question object: outcome definition, time horizon, decision context, comparison frame",
    ],
    boundary: [
      "Does not analyze signals",
      "Does not compute probability",
      "Does not generate scenarios",
    ],
    implementationFiles: [
      "api-server/src/lib/question-engine.ts",
      "api-server/src/routes/agent-question-structuring.ts",
    ],
    downstreamConsumer: "signalIdentification",
  },

  signalIdentification: {
    name: "Signal Identification Agent",
    purpose: "Find candidate signals relevant to the structured question.",
    input: [
      "Structured question object",
    ],
    output: [
      "Candidate signal list: description, source, signal type, direction, relevance score",
    ],
    boundary: [
      "Does not assign likelihood ratios",
      "Does not update probability",
      "Does not deduplicate signals",
    ],
    implementationFiles: [
      "api-server/src/lib/signal-detection.ts",
    ],
    downstreamConsumer: "signalValidation",
  },

  signalValidation: {
    name: "Signal Validation Agent",
    purpose: "Decide which signals are acceptable for forecasting and assign likelihood ratios.",
    input: [
      "Candidate signal list",
    ],
    output: [
      "Accepted signal set: direction, strength score, reliability score, likelihood ratio",
    ],
    boundary: [
      "Does not compute forecast",
      "Does not perform dependency compression",
    ],
    implementationFiles: [
      "api-server/src/lib/signal-eligibility.ts",
      "api-server/src/lib/validation-pack.ts",
      "api-server/src/lib/evidence-verification.ts",
    ],
    downstreamConsumer: "dependencyControl",
  },

  dependencyControl: {
    name: "Dependency Control Agent",
    purpose: "Prevent double-counting of related signals.",
    input: [
      "Accepted signal set",
    ],
    output: [
      "Independent signal set: rootEvidenceId, dependency role, compression factor, independence status",
    ],
    boundary: [
      "Does not compute forecast",
      "Does not interpret meaning",
    ],
    implementationFiles: [
      "api-server/src/lib/signal-dependency-engine.ts",
    ],
    downstreamConsumer: "forecastEngine",
  },

  forecastEngine: {
    name: "Forecast Engine Agent",
    purpose: "Update probability based on validated, independent signals.",
    input: [
      "Independent signal set",
      "Prior probability",
    ],
    output: [
      "Posterior probability",
    ],
    boundary: [
      "Does not explain results",
      "Does not generate scenarios",
    ],
    implementationFiles: [
      "api-server/src/lib/forecast-engine.ts",
      "api-server/src/lib/core-forecast-engine.ts",
      "api-server/src/lib/adoption-distribution.ts",
      "api-server/src/lib/engine-guardrails.ts",
      "api-server/src/lib/calibration-checks.ts",
      "api-server/src/services/recalculateCaseScore.ts",
    ],
    downstreamConsumer: "interpretation",
  },

  interpretation: {
    name: "Interpretation Agent",
    purpose: "Explain what is driving the forecast.",
    input: [
      "Posterior probability",
      "Signal contributions",
    ],
    output: [
      "Current scenario summary: top positive drivers, top negative drivers, primary constraint, confidence level",
    ],
    boundary: [
      "Does not change probability",
      "Does not create new signals",
    ],
    implementationFiles: [
      "api-server/src/lib/decision-derivation.ts",
      "cios-frontend/src/lib/judgment-engine.ts",
      "cios-frontend/src/components/forecast/ExplainBox.tsx",
    ],
    downstreamConsumer: "scenarioSimulation",
  },

  scenarioSimulation: {
    name: "Scenario Simulation Agent",
    purpose: "Show how the forecast changes under alternative assumptions.",
    input: [
      "Baseline forecast",
      "Modified signal set",
    ],
    output: [
      "Scenario comparison table: scenario name, signal change, new probability, delta from baseline",
    ],
    boundary: [
      "Does not reinterpret baseline",
      "Does not modify signal validation rules",
    ],
    implementationFiles: [
      "api-server/src/routes/simulation-engine.ts",
      "cios-frontend/src/lib/adoption-distribution.ts",
    ],
    downstreamConsumer: "terminal",
  },
};

export const AGENT_CHAIN_ORDER: (keyof typeof AGENT_REGISTRY)[] = [
  "questionStructuring",
  "signalIdentification",
  "signalValidation",
  "dependencyControl",
  "forecastEngine",
  "interpretation",
  "scenarioSimulation",
];

export function validateAgentBoundary(
  agentKey: string,
  attemptedAction: string,
): { allowed: boolean; violation?: string } {
  const agent = AGENT_REGISTRY[agentKey];
  if (!agent) return { allowed: false, violation: `Unknown agent: ${agentKey}` };

  for (const rule of agent.boundary) {
    const ruleNorm = rule.toLowerCase().replace(/^does not /, "");
    if (attemptedAction.toLowerCase().includes(ruleNorm)) {
      return {
        allowed: false,
        violation: `Agent "${agent.name}" boundary violation: ${rule}. Attempted: ${attemptedAction}`,
      };
    }
  }
  return { allowed: true };
}

export function getAgentChainSummary(): Array<{
  step: number;
  name: string;
  purpose: string;
  inputSummary: string;
  outputSummary: string;
  next: string;
}> {
  return AGENT_CHAIN_ORDER.map((key, idx) => {
    const agent = AGENT_REGISTRY[key];
    const nextKey = AGENT_CHAIN_ORDER[idx + 1];
    return {
      step: idx + 1,
      name: agent.name,
      purpose: agent.purpose,
      inputSummary: agent.input.join("; "),
      outputSummary: agent.output.join("; "),
      next: nextKey ? AGENT_REGISTRY[nextKey].name : "End of chain",
    };
  });
}
