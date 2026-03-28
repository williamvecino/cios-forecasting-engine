export type WorkflowStep = "question" | "signals" | "forecast" | "decide" | "respond";

export interface ActiveQuestion {
  id: string;
  text: string;
  rawInput?: string;
  createdAt: string;
  caseId?: string;
  timeHorizon?: string;
  questionType?: string;
  entities?: string[];
  subject?: string;
  outcome?: string;
}

const ACTIVE_QUESTION_STORAGE_KEY = "cios.activeQuestion";

export function getWorkflowSteps(): {
  key: WorkflowStep;
  label: string;
  title: string;
  description: string;
  path: string;
}[] {
  return [
    {
      key: "question",
      label: "1 — Define Question",
      title: "Define Question",
      description: "Define what you want to predict.",
      path: "/question",
    },
    {
      key: "signals",
      label: "2 — Add Information",
      title: "Add Information",
      description: "Add the new evidence or signal changes.",
      path: "/signals",
    },
    {
      key: "forecast",
      label: "3 — Judge",
      title: "Judge",
      description: "Review the executive judgment, probability, and what drives the call.",
      path: "/forecast",
    },
    {
      key: "decide",
      label: "4 — Decide",
      title: "Decide",
      description: "Turn the judgment into action.",
      path: "/decide",
    },
    {
      key: "respond",
      label: "5 — Respond",
      title: "Respond",
      description: "Generate a client-ready response.",
      path: "/respond",
    },
  ];
}

export function createQuestionId(): string {
  const ts = Date.now().toString(36).toUpperCase();
  return `Q_${ts}`;
}

export function getStoredActiveQuestion(): ActiveQuestion | null {
  try {
    const raw = localStorage.getItem(ACTIVE_QUESTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveQuestion;
    if (!parsed?.id || !parsed?.text) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function storeActiveQuestion(question: ActiveQuestion): void {
  localStorage.setItem(ACTIVE_QUESTION_STORAGE_KEY, JSON.stringify(question));
}

export function clearStoredActiveQuestion(): void {
  localStorage.removeItem(ACTIVE_QUESTION_STORAGE_KEY);
}

const CASE_SCOPED_KEYS = [
  "cios.signals",
  "cios.aiRequested",
  "cios.eventDecomposition",
  "cios.translationSummary",
  "cios.baseGates",
  "cios.signalReadiness",
  "cios.judgmentResult",
  "cios.decideResult",
  "cios.respondResult",
];

export function clearCaseState(caseId: string): void {
  for (const prefix of CASE_SCOPED_KEYS) {
    try { localStorage.removeItem(`${prefix}:${caseId}`); } catch {}
  }
  try { localStorage.removeItem("cios.therapeuticArea"); } catch {}
  try { localStorage.removeItem("cios.questionDraft"); } catch {}
}
