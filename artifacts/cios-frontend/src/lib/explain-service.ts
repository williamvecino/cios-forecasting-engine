import type { ExecutiveJudgmentResult } from "./judgment-engine";
import { getDriverMap } from "./constraint-drivers";

interface ExplainResponse {
  definition: string;
  currentRelevance: string;
  drivers: string[];
  lever: string | null;
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
};

function findTermDefinition(question: string): { term: string; definition: string } | null {
  const lower = question.toLowerCase();
  const sortedKeys = Object.keys(TERM_DEFINITIONS).sort((a, b) => b.length - a.length);

  for (const key of sortedKeys) {
    if (lower.includes(key)) {
      return { term: key, definition: TERM_DEFINITIONS[key] };
    }
  }

  return null;
}

function findRelevanceFromJudgment(term: string, judgment: ExecutiveJudgmentResult): string {
  const lower = term.toLowerCase();

  for (const pc of judgment.primaryConstraints) {
    if (pc.label.toLowerCase().includes(lower) || lower.includes(pc.label.toLowerCase())) {
      return `Currently ${pc.status} — this is actively constraining the forecast. ${pc.lever}`;
    }
  }

  for (const ac of judgment.analogCases) {
    if (ac.brand.toLowerCase().includes(lower) || lower.includes(ac.brand.toLowerCase())) {
      return `Referenced as a historical precedent with ${ac.confidence.toLowerCase()} confidence. ${ac.lesson}`;
    }
  }

  for (const trigger of judgment.reversalTriggers) {
    if (trigger.description.toLowerCase().includes(lower)) {
      return `This is identified as a potential reversal trigger — a change here would ${trigger.direction === "upward" ? "improve" : "worsen"} the outlook.`;
    }
  }

  for (const item of judgment.monitorList) {
    if (item.label.toLowerCase().includes(lower)) {
      return `On the active monitor list: ${item.reason}`;
    }
  }

  return "This term is relevant to the current case context.";
}

function findDriversForTerm(term: string): string[] {
  const driverMap = getDriverMap();
  const lower = term.toLowerCase();

  if (driverMap[lower]) {
    return driverMap[lower];
  }

  for (const [key, drivers] of Object.entries(driverMap)) {
    const keyWords = key.split(/\s+/);
    const termWords = lower.split(/\s+/);
    const overlap = keyWords.filter(w => termWords.includes(w));
    if (overlap.length >= 1 && overlap.length >= keyWords.length * 0.5) {
      return drivers;
    }
  }

  return [];
}

function findLeverForTerm(term: string, judgment: ExecutiveJudgmentResult): string | null {
  for (const pc of judgment.primaryConstraints) {
    if (pc.label.toLowerCase().includes(term.toLowerCase()) || term.toLowerCase().includes(pc.label.toLowerCase())) {
      return pc.lever;
    }
  }
  return null;
}

export function explain(question: string, judgment: ExecutiveJudgmentResult): ExplainResponse {
  const lower = question.toLowerCase().trim();

  if (lower.match(/what does|what is|define|meaning of|explain/)) {
    const termMatch = findTermDefinition(question);
    if (termMatch) {
      return {
        definition: termMatch.definition,
        currentRelevance: findRelevanceFromJudgment(termMatch.term, judgment),
        drivers: findDriversForTerm(termMatch.term),
        lever: findLeverForTerm(termMatch.term, judgment),
      };
    }
  }

  if (lower.match(/why did|why does|why is|why the|reason/)) {
    const reasoning = judgment.reasoning;
    const constraintSummary = judgment.primaryConstraints.length > 0
      ? judgment.primaryConstraints.map(pc => `${pc.label} (${pc.status})`).join(", ")
      : "No active constraints identified";

    return {
      definition: reasoning,
      currentRelevance: `Current constraints: ${constraintSummary}. Confidence: ${judgment.confidence}.`,
      drivers: judgment.keyDrivers,
      lever: judgment.primaryConstraints[0]?.lever || null,
    };
  }

  if (lower.match(/what would change|how to improve|what can change|what moves|how to raise/)) {
    if (judgment.primaryConstraints.length > 0) {
      const top = judgment.primaryConstraints[0];
      return {
        definition: `The primary constraint is ${top.label} (${top.status}).`,
        currentRelevance: top.lever,
        drivers: top.drivers.map(d => `${d.name} — ${d.rank} impact`),
        lever: top.lever,
      };
    }

    if (judgment.reversalTriggers.length > 0) {
      return {
        definition: "The following changes would affect the outlook:",
        currentRelevance: judgment.reversalTriggers.map(t => t.description).join(". "),
        drivers: judgment.reversalTriggers.map(t => `${t.direction === "upward" ? "↑" : "↓"} ${t.description}`),
        lever: null,
      };
    }
  }

  const termMatch = findTermDefinition(question);
  if (termMatch) {
    return {
      definition: termMatch.definition,
      currentRelevance: findRelevanceFromJudgment(termMatch.term, judgment),
      drivers: findDriversForTerm(termMatch.term),
      lever: findLeverForTerm(termMatch.term, judgment),
    };
  }

  return {
    definition: "Insufficient information to explain this term. Try asking about a specific constraint, driver, or forecast element.",
    currentRelevance: "",
    drivers: [],
    lever: null,
  };
}
