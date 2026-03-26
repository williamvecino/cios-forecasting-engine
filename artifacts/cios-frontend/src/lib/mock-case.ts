export type MockCaseStepKey = "question" | "signals" | "forecast" | "decide";

export interface MockCaseStep {
  key: MockCaseStepKey;
  label: string;
  title: string;
  description: string;
  highlights: string[];
}

export interface Scenario {
  name: string;
  probability: string;
  description: string;
}

export interface DriverImpact {
  name: string;
  direction: "up" | "down";
  strength: "High" | "Medium" | "Low";
}

export interface ScenarioDecision {
  scenario: string;
  action: string;
}

export interface MockCaseData {
  caseId: string;
  question: string;
  timeHorizon: string;
  signals: {
    positive: string[];
    negative: string[];
    context: string[];
  };
  forecast: {
    probability: string;
    timing: string;
    keyDrivers: string[];
  };
  decision: {
    adoptionSegment: string;
    barrier: string;
    readiness: string;
    competitiveRisk: string;
    growthFeasibility: string;
  };
  scenarios: Scenario[];
  driverImpact: DriverImpact[];
  scenarioDecisions: ScenarioDecision[];
}

export const MOCK_CASE: MockCaseData = {
  caseId: "MOCK_CASE_001",
  question: "Will adoption increase after indication expansion?",
  timeHorizon: "12 months",
  signals: {
    positive: [
      "Positive phase 3 efficacy signal",
      "Guideline update under discussion",
    ],
    negative: [
      "Moderate payer friction",
      "Entrenched standard of care",
    ],
    context: [
      "Early adoption phase",
      "Balanced payer environment",
      "Medium guideline leverage",
    ],
  },
  forecast: {
    probability: "42%",
    timing: "Shift most plausible over 6–12 months",
    keyDrivers: [
      "Strength of new evidence",
      "Moderate access friction",
      "Competitive inertia",
    ],
  },
  decision: {
    adoptionSegment: "Early adopters within clinically motivated segments",
    barrier: "Access + competitive habit",
    readiness: "Not immediate, but viable if guideline momentum strengthens",
    competitiveRisk: "Incumbent defense likely",
    growthFeasibility: "Promising if access broadens and first movers convert",
  },
  scenarios: [
    {
      name: "Base Case",
      probability: "42%",
      description:
        "Current trajectory assuming stable access and moderate guideline influence",
    },
    {
      name: "Upside Scenario",
      probability: "58%",
      description:
        "Guideline momentum strengthens and payer friction decreases",
    },
    {
      name: "Downside Scenario",
      probability: "27%",
      description:
        "Access restrictions increase and competitor response accelerates",
    },
  ],
  driverImpact: [
    {
      name: "Positive phase 3 efficacy",
      direction: "up",
      strength: "High",
    },
    {
      name: "Guideline momentum",
      direction: "up",
      strength: "Medium",
    },
    {
      name: "Access friction",
      direction: "down",
      strength: "Medium",
    },
    {
      name: "Entrenched competitor",
      direction: "down",
      strength: "High",
    },
  ],
  scenarioDecisions: [
    {
      scenario: "Base Case",
      action: "Focus on early adopters and monitor access expansion",
    },
    {
      scenario: "Upside Scenario",
      action: "Accelerate broader segment activation",
    },
    {
      scenario: "Downside Scenario",
      action: "Prioritize barrier reduction and defensive positioning",
    },
  ],
};

export const MOCK_CASE_STEPS: MockCaseStep[] = [
  {
    key: "question",
    label: "1 — Ask a Question",
    title: "Start with one strategic prediction question",
    description:
      "The system begins with a single question so everything inherits one decision context.",
    highlights: [
      "Question is defined first",
      "Case ID and time horizon are set",
      "All downstream analysis inherits this context",
    ],
  },
  {
    key: "signals",
    label: "2 — Add Information",
    title: "Add the signals that changed the picture",
    description:
      "New evidence, access shifts, competition, and market changes are gathered into a structured signal set.",
    highlights: [
      "Clinical evidence is added",
      "Payer and competitive friction are captured",
      "Context is prepared for forecasting",
    ],
  },
  {
    key: "forecast",
    label: "3 — See Forecast",
    title: "Convert the signal picture into a forecast",
    description:
      "The system estimates what is likely to happen, why, and on what time scale.",
    highlights: [
      "Probability is shown",
      "Scenario planning across Base / Upside / Downside",
      "Key driver impact is surfaced",
      "Timing is made explicit",
    ],
  },
  {
    key: "decide",
    label: "4 — Decide",
    title: "Turn the forecast into action",
    description:
      "The final step translates probability into decisions about segments, barriers, timing, and risk.",
    highlights: [
      "Who moves first",
      "What is blocking adoption",
      "When to act",
      "What competitive risks to watch",
      "Scenario-aware recommended actions",
    ],
  },
];
