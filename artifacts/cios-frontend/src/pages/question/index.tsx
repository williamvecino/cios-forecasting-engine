import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useCreateCase } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  parseQuestion,
  mapDecisionQuestionToCaseInput,
  buildInterpretedQuestion,
} from "@/lib/question-definition";
import type { DecisionQuestion } from "@/lib/question-definition";
import { clearCaseState } from "@/lib/workflow";
import type { OutcomeDimension, CompositeScenario } from "@/lib/workflow";

function extractThresholdFromOutcomeStates(states: string[]): string | undefined {
  for (const s of states) {
    const m = s.match(/[≥≤><]=?\s*(\d+(?:\.\d+)?)\s*%/);
    if (m) return s.trim();
  }
  return undefined;
}
import {
  AlertTriangle,
  Loader2,
  ArrowRight,
  PenLine,
  Plus,
  Sparkles,
  CheckCircle2,
  XCircle,
  SplitSquareVertical,
  Target,
  Clock,
  Archive,
  Trash2,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  ListTree,
  Edit3,
  RotateCcw,
  Check,
  X,
  FileText,
  Layers,
} from "lucide-react";
import ImportProjectDialog from "@/components/question/ImportProjectDialog";

const API = import.meta.env.VITE_API_URL || "";

interface StructuredQuestion {
  questionText: string;
  archetype: string;
  horizon: string;
  targetOutcome: string;
  boundedness: "bounded" | "needs_splitting" | "too_broad";
  questionType?: "strategic" | "competitive" | "financial" | "operational" | "diagnostic";
}

interface QuestionStructuringResult {
  activeQuestion: StructuredQuestion;
  supportingQuestions: StructuredQuestion[];
  rejection: {
    rejected: boolean;
    reason: string | null;
    suggestion: string | null;
  };
  improvementExplanation: string | null;
  inputHash: string;
  driftDetected?: boolean;
  driftWarning?: string | null;
}

type SupportingQuestionStatus = "analyze_tandem" | "saved" | "promoted" | "discarded";

interface FeasibilityCheck {
  verdict: "feasible" | "feasible_with_refinement" | "not_feasible";
  explanation: string;
  refinedQuestion?: string;
  suggestion?: string;
  checks: {
    clearOutcome: { pass: boolean; note: string };
    explicitHorizon: { pass: boolean; note: string };
    observableEvent: { pass: boolean; note: string };
    decisionRelevance: { pass: boolean; note: string };
    modelFeasibility: { pass: boolean; note: string };
  };
}

interface OutcomeStructure {
  recommended: "binary" | "multi_state";
  explanation: string;
  states: string[];
}

interface RefineResult {
  feasibility: FeasibilityCheck;
  outcomeStructure: OutcomeStructure;
}

const DEFAULT_OUTCOME_DIMENSIONS: OutcomeDimension[] = [
  { name: "Competitive share change", levels: ["No share loss", "Minimal share loss", "Moderate share loss", "Significant share loss"] },
  { name: "Portfolio growth", levels: ["Strong growth", "Moderate growth", "Minimal growth"] },
  { name: "Operational stability", levels: ["Stable", "Some disruption", "Significant disruption"] },
];

function generateScenariosFromDimensions(dims: OutcomeDimension[]): CompositeScenario[] {
  if (dims.length === 0) return [];

  const MAX_SCENARIOS = 6;
  const scenarios: CompositeScenario[] = [];

  if (dims.length >= 2) {
    const primary = dims[0];
    const secondary = dims[1];

    for (const pLevel of primary.levels) {
      for (const sLevel of secondary.levels) {
        if (scenarios.length >= MAX_SCENARIOS) break;
        const dimensionMap: Record<string, string> = { [primary.name]: pLevel, [secondary.name]: sLevel };
        for (let k = 2; k < dims.length; k++) {
          dimensionMap[dims[k].name] = dims[k].levels[Math.floor(dims[k].levels.length / 2)] || dims[k].levels[0];
        }
        scenarios.push({
          id: `scenario-${scenarios.length + 1}`,
          label: `${pLevel} with ${sLevel.toLowerCase()}`,
          dimensions: dimensionMap,
        });
      }
      if (scenarios.length >= MAX_SCENARIOS) break;
    }
  } else {
    for (const level of dims[0].levels) {
      scenarios.push({
        id: `scenario-${scenarios.length + 1}`,
        label: level,
        dimensions: { [dims[0].name]: level },
      });
    }
  }

  return scenarios.slice(0, MAX_SCENARIOS);
}

const DEMO_CASES = [
  { caseId: "CASE-002", label: "HIGH ADOPTION", question: "Will Trikafta achieve >60% of new CF modulator starts in F508del patients within 24 months of approval?" },
  { caseId: "CASE-003", label: "UNCERTAIN OUTCOME", question: "Will Arikayce achieve >30% of new MAC lung disease starts within 24 months of first-line FDA approval?" },
  { caseId: "CASE-001", label: "STRUCTURAL BARRIERS", question: "Will veligrotug achieve ≥40% share of new TED biologic starts within 24 months at Tepezza-standard centers?" },
];

interface Interpretation {
  decisionType: string;
  event: string;
  outcomes: string[];
  timeHorizon: string;
  primaryConstraint: string;
  subject: string;
  outcome: string;
  questionType: string;
  entities: string[];
  comparisonGroups: string[];
  restatedQuestion: string;
}

type PageState = "input" | "structuring" | "reviewing" | "refining" | "creating";

const FORECAST_TEMPLATE_MAP: Record<string, { placeholder: string; archetype: string }> = {
  "adoption-forecast": { placeholder: "Will [therapy] achieve [X]% adoption among [target specialists] within [timeframe]?", archetype: "Launch Adoption Risk" },
  "competitive-displacement": { placeholder: "Will [new entrant] displace [incumbent therapy] in [segment] within [timeframe]?", archetype: "Competitive Displacement Risk" },
  "payer-access-risk": { placeholder: "Will [payer/PBM] implement [restriction type] for [therapy] within [timeframe]?", archetype: "Market Access Constraint" },
  "geographic-expansion": { placeholder: "Will [therapy] achieve formulary access in [geographic region] within [timeframe]?", archetype: "Launch Adoption Risk" },
};

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const createCaseMutation = useCreateCase();

  const initTemplateSlug = (() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("template") || "";
  })();

  const [rawInput, setRawInput] = useState(() => {
    if (initTemplateSlug && FORECAST_TEMPLATE_MAP[initTemplateSlug]) {
      return FORECAST_TEMPLATE_MAP[initTemplateSlug].placeholder;
    }
    return activeQuestion?.text ?? "";
  });
  const [pageState, setPageState] = useState<PageState>("input");

  useEffect(() => {
    if (!activeQuestion && !initTemplateSlug) {
      setRawInput("");
      setPageState("input");
      setStructuringResult(null);
      setRefineResult(null);
      setIsEditMode(false);
      setEditCaseId("");
    }
  }, [activeQuestion]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editCaseId, setEditCaseId] = useState("");
  const [structuringResult, setStructuringResult] = useState<QuestionStructuringResult | null>(null);
  const [supportingStatuses, setSupportingStatuses] = useState<Record<number, SupportingQuestionStatus>>({});
  const [refineResult, setRefineResult] = useState<RefineResult | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [editedProposal, setEditedProposal] = useState("");
  const [lastValidatedProposal, setLastValidatedProposal] = useState("");
  const [outcomeStates, setOutcomeStates] = useState<string[]>([]);
  const [outcomeDimensions, setOutcomeDimensions] = useState<OutcomeDimension[]>([]);
  const [compositeScenarios, setCompositeScenarios] = useState<CompositeScenario[]>([]);
  const [showImportProject, setShowImportProject] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("import") === "file";
  });
  const [priorTemplates, setPriorTemplates] = useState<any[]>([]);
  const [selectedArchetype, setSelectedArchetype] = useState<string>("");
  const [archetypeRationale, setArchetypeRationale] = useState<string>("");

  useEffect(() => {
    fetch(`${API}/api/prior-templates`)
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setPriorTemplates(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const archetypeParam = params.get("archetype");
    if (archetypeParam && !selectedArchetype) {
      try {
        const stored = localStorage.getItem("cios.selectedArchetype");
        if (stored) {
          const arch = JSON.parse(stored);
          if (arch.placeholder && !rawInput) {
            setRawInput("");
          }
          if (arch.priorArchetypes?.length > 0 && priorTemplates.length > 0) {
            const match = priorTemplates.find((t: any) => arch.priorArchetypes.includes(t.archetypeName));
            if (match && !selectedArchetype) {
              setSelectedArchetype(match.archetypeName);
              setArchetypeRationale(match.priorRationale || "");
            }
          }
          localStorage.removeItem("cios.selectedArchetype");
        }
      } catch {}
    }
    if (initTemplateSlug && FORECAST_TEMPLATE_MAP[initTemplateSlug] && priorTemplates.length > 0) {
      const mapped = FORECAST_TEMPLATE_MAP[initTemplateSlug];
      const match = priorTemplates.find((pt: any) => pt.archetypeName === mapped.archetype);
      if (match) {
        setSelectedArchetype(match.archetypeName);
        setArchetypeRationale(match.priorRationale);
      }
    }
  }, [priorTemplates, selectedArchetype, rawInput]);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [syncedCaseId, setSyncedCaseId] = useState<string | null>(activeQuestion?.caseId ?? null);
  const [userCleared, setUserCleared] = useState(false);

  useEffect(() => {
    const draft = localStorage.getItem("cios.questionDraft");
    if (draft && !rawInput) {
      setRawInput(draft);
    }
    localStorage.removeItem("cios.questionDraft");
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("import") === "file") {
      try {
        const dataUrl = localStorage.getItem("cios.pendingImportData");
        const fileName = localStorage.getItem("cios.pendingImportFile") || "uploaded-file";
        if (dataUrl) {
          fetch(dataUrl)
            .then((res) => res.blob())
            .then((blob) => {
              const file = new File([blob], fileName, { type: blob.type });
              setPendingImportFile(file);
              setShowImportProject(true);
            });
          localStorage.removeItem("cios.pendingImportData");
          localStorage.removeItem("cios.pendingImportFile");
        }
      } catch {}
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!activeQuestion?.text || isEditMode || userCleared) return;
    const currentCaseId = activeQuestion.caseId ?? activeQuestion.id;
    if (currentCaseId !== syncedCaseId) {
      setRawInput(activeQuestion.text);
      setSyncedCaseId(currentCaseId);
    }
  }, [activeQuestion?.text, activeQuestion?.caseId, activeQuestion?.id, isEditMode, syncedCaseId, userCleared]);

  function resetAll() {
    setRawInput(activeQuestion?.text ?? "");
    setPageState("input");
    setSubmitError(null);
    setIsEditMode(false);
    setEditCaseId("");
  }

  function startNewForecast() {
    setRawInput("");
    setPageState("input");
    setSubmitError(null);
    setIsEditMode(false);
    setEditCaseId("");
    setSyncedCaseId(null);
    setUserCleared(true);
  }

  function enterEditMode() {
    if (!activeQuestion) return;
    setIsEditMode(true);
    setRawInput(activeQuestion.text ?? "");
    setEditCaseId(activeQuestion.caseId ?? "");
    setPageState("input");
    setSubmitError(null);
  }

  function buildLocalFallback(text: string): Interpretation {
    const parsed = parseQuestion(text);
    const interpreted = parsed ? buildInterpretedQuestion(parsed as DecisionQuestion) : text;
    return {
      decisionType: "Decision",
      event: parsed?.subject ? `${parsed.subject} — ${parsed.outcome || "outcome"}` : text.slice(0, 100),
      outcomes: [],
      timeHorizon: parsed?.timeHorizon || "12 months",
      primaryConstraint: "To be determined",
      subject: parsed?.subject || "",
      outcome: parsed?.outcome || "",
      questionType: parsed?.questionType || "binary",
      entities: parsed?.populationOrEntities || [],
      comparisonGroups: [],
      restatedQuestion: interpreted || text,
    };
  }

  const handleStructure = useCallback(async () => {
    const text = rawInput.trim();
    if (!text) return;
    setSubmitError(null);
    setStructuringResult(null);
    setRefineResult(null);
    setIsEditingProposal(false);
    setOutcomeStates([]);
    setPageState("structuring");

    let structuredResult: QuestionStructuringResult | null = null;
    try {
      const structRes = await fetch(`${API}/api/agents/question-structuring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: text }),
      });
      if (structRes.ok) {
        const structData = await structRes.json();
        if (structData.structuredQuestions) {
          structuredResult = structData.structuredQuestions;
          setStructuringResult(structuredResult);
        }
      }
    } catch {}

    if (structuredResult?.rejection?.rejected) {
      setSubmitError(
        structuredResult.rejection.reason || "This input is not a decision question."
      );
      setPageState("input");
      return;
    }

    if (!structuredResult) {
      setSubmitError("Could not analyze the question. You can try again or continue with your original wording.");
      setPageState("input");
      return;
    }

    const proposedText = structuredResult.activeQuestion?.questionText || text;
    setEditedProposal(proposedText);
    setPageState("reviewing");

    await runFeasibilityCheck(text, proposedText);
  }, [rawInput]);

  const runFeasibilityCheck = useCallback(async (userDraft: string, proposedQ: string) => {
    setPageState("refining");
    try {
      const res = await fetch(`${API}/api/ai-refine-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: userDraft, proposedQuestion: proposedQ }),
      });
      if (res.ok) {
        const data: RefineResult = await res.json();
        setRefineResult(data);
        setLastValidatedProposal(proposedQ);
        setOutcomeStates(data.outcomeStructure?.states || ["Yes", "No"]);
      } else {
        setRefineResult(null);
        setOutcomeStates([]);
        setSubmitError("Feasibility validation failed. Please retry or revise your question.");
      }
    } catch {
      setRefineResult(null);
      setOutcomeStates([]);
      setSubmitError("Feasibility validation is unavailable. Please retry or revise your question.");
    }
    setPageState("reviewing");
  }, []);

  const handleReRunFeasibility = useCallback(async () => {
    const text = editedProposal.trim();
    if (!text) return;
    setIsEditingProposal(false);
    await runFeasibilityCheck(rawInput.trim(), text);
  }, [editedProposal, rawInput, runFeasibilityCheck]);

  const saveQuestionsToRepository = useCallback(async (caseId: string, activeQ: StructuredQuestion, supportingQs: StructuredQuestion[], statuses: Record<number, SupportingQuestionStatus>) => {
    const questions: any[] = [];

    questions.push({
      questionText: activeQ.questionText,
      questionRole: "primary",
      questionType: activeQ.questionType || "strategic",
      timeHorizon: activeQ.horizon,
      outcomeStructure: activeQ.targetOutcome,
      priorityRank: 0,
      status: "active",
      source: "system",
    });

    supportingQs.forEach((sq, i) => {
      const status = statuses[i];

      let repoStatus = "saved";
      let role = "secondary";
      if (status === "analyze_tandem") {
        repoStatus = "active";
      } else if (status === "promoted") {
        repoStatus = "promoted";
      } else if (status === "discarded") {
        repoStatus = "discarded";
      }

      questions.push({
        questionText: sq.questionText,
        questionRole: role,
        questionType: sq.questionType || "strategic",
        timeHorizon: sq.horizon,
        outcomeStructure: sq.targetOutcome,
        priorityRank: i + 1,
        status: repoStatus,
        source: "system",
      });
    });

    try {
      await fetch(`${API}/api/cases/${caseId}/question-repository`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
    } catch (e) {
      console.error("Failed to save questions to repository:", e);
    }
  }, []);

  const handleAcceptAndContinue = useCallback(async () => {
    if (!refineResult || refineResult.feasibility?.verdict === "not_feasible") return;

    const finalQuestion = editedProposal.trim() || structuringResult?.activeQuestion?.questionText || rawInput.trim();
    setPageState("creating");

    let interpretation: Interpretation;
    try {
      const res = await fetch(`${API}/api/ai-interpret-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: finalQuestion }),
      });
      if (!res.ok) throw new Error("Interpretation failed");
      const data = await res.json();
      if (!data.interpretation || !data.interpretation.restatedQuestion) throw new Error("Malformed");
      interpretation = data.interpretation;
    } catch {
      interpretation = buildLocalFallback(finalQuestion);
    }

    if (structuringResult) {
      interpretation.questionType = structuringResult.activeQuestion.archetype || interpretation.questionType;
      interpretation.timeHorizon = structuringResult.activeQuestion.horizon || interpretation.timeHorizon;
    }

    if (outcomeStates.length > 0) {
      interpretation.comparisonGroups = outcomeStates;
      interpretation.outcomes = outcomeStates;
    }

    if (isEditMode && editCaseId) {
      const editThreshold = extractThresholdFromOutcomeStates(outcomeStates);
      const payload = {
        text: interpretation.restatedQuestion || finalQuestion,
        caseId: editCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        comparisonGroups: interpretation.comparisonGroups || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
        threshold: editThreshold,
        outcomeDimensions: outcomeDimensions.length > 0 ? outcomeDimensions : undefined,
        compositeScenarios: compositeScenarios.length > 0 ? compositeScenarios : undefined,
      };
      updateQuestion(payload);
      if (structuringResult) {
        try { localStorage.setItem(`cios.questionStructuring:${editCaseId}`, JSON.stringify(structuringResult)); } catch {}
        saveQuestionsToRepository(editCaseId, structuringResult.activeQuestion, structuringResult.supportingQuestions, supportingStatuses);
      }
      navigate("/comparison-groups");
      return;
    }

    try {
      const dq: DecisionQuestion = {
        id: `DQ-${Date.now()}`,
        rawInput: rawInput.trim(),
        questionType: (interpretation.questionType || "binary") as any,
        subject: interpretation.subject || "",
        outcome: interpretation.outcome || "",
        populationOrEntities: interpretation.entities || [],
        timeHorizon: interpretation.timeHorizon || "12 months",
        missingFields: [],
        isComplete: true,
        interpretedQuestion: interpretation.restatedQuestion || finalQuestion,
        createdAt: new Date().toISOString(),
      };
      const outcomeThreshold = extractThresholdFromOutcomeStates(outcomeStates);
      const caseInput = mapDecisionQuestionToCaseInput({
        ...dq,
        priorArchetype: selectedArchetype || undefined,
        priorRationale: archetypeRationale || undefined,
        outcomeThreshold,
      });
      const created = await createCaseMutation.mutateAsync({ data: caseInput as any });
      const newCaseId = (created as any).caseId || (created as any).id;
      if (!newCaseId) {
        setSubmitError("Case was created but returned no identifier.");
        setPageState("reviewing");
        return;
      }

      clearCaseState(newCaseId);
      if (structuringResult) {
        try { localStorage.setItem(`cios.questionStructuring:${newCaseId}`, JSON.stringify(structuringResult)); } catch {}
        saveQuestionsToRepository(newCaseId, structuringResult.activeQuestion, structuringResult.supportingQuestions, supportingStatuses);
      }

      const payload = {
        text: interpretation.restatedQuestion || finalQuestion,
        rawInput: rawInput.trim(),
        caseId: newCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        comparisonGroups: interpretation.comparisonGroups || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
        threshold: outcomeThreshold,
        outcomeDimensions: outcomeDimensions.length > 0 ? outcomeDimensions : undefined,
        compositeScenarios: compositeScenarios.length > 0 ? compositeScenarios : undefined,
        lifecycleStage: (created as any).drugStage || undefined,
        lifecycleStageRationale: (created as any).drugStageRationale || undefined,
      };
      createQuestion(payload);
      navigate("/comparison-groups");
    } catch (err) {
      console.error("Failed to create case:", err);
      setSubmitError("Unable to create a case. Check your connection and try again.");
      setPageState("reviewing");
    }
  }, [rawInput, editedProposal, structuringResult, refineResult, outcomeStates, isEditMode, editCaseId, createCaseMutation, createQuestion, updateQuestion, navigate, supportingStatuses, saveQuestionsToRepository]);

  const handleImportComplete = async (result: any) => {
    const q = result.question;
    if (!q) return;

    setPageState("creating");
    setSubmitError(null);

    try {
      const dq: DecisionQuestion = {
        id: `DQ-${Date.now()}`,
        rawInput: q.text || q.restatedQuestion,
        questionType: (q.questionType || "binary") as any,
        subject: q.subject || "",
        outcome: q.outcome || "",
        populationOrEntities: q.entities || [],
        timeHorizon: q.timeHorizon || "12 months",
        missingFields: [],
        isComplete: true,
        interpretedQuestion: q.restatedQuestion || q.text,
        createdAt: new Date().toISOString(),
      };
      const caseInput = mapDecisionQuestionToCaseInput(dq);
      const created = await createCaseMutation.mutateAsync({
        data: caseInput as any,
      });
      const newCaseId = (created as any).caseId || (created as any).id;
      if (!newCaseId) {
        setSubmitError("Case was created but returned no identifier.");
        setPageState("input");
        setShowImportProject(false);
        return;
      }

      const STRENGTH_MAP: Record<string, string> = { High: "High", Medium: "Medium", Low: "Low" };
      const CONFIDENCE_MAP: Record<string, string> = { Strong: "Confirmed", Moderate: "Probable", Weak: "Speculative" };
      const VALID_SIGNAL_SOURCES = new Set(["internal", "external", "missing"]);
      const importedSignals = (result.signals || []).map((s: any, i: number) => ({
        id: `import-${i + 1}`,
        text: s.text,
        caveat: s.rationale || "",
        direction: s.direction === "positive" ? "positive" : s.direction === "negative" ? "negative" : "neutral",
        strength: STRENGTH_MAP[s.importance] || "Medium",
        reliability: CONFIDENCE_MAP[s.confidence] || "Probable",
        impact: s.importance === "High" ? 3 : s.importance === "Low" ? 1 : 2,
        category: ["evidence", "access", "competition", "guideline", "timing", "adoption"].includes(s.category) ? s.category : "evidence",
        source: "system",
        accepted: false,
        signal_class: "observed",
        signal_family: "brand_clinical_regulatory",
        signal_source: VALID_SIGNAL_SOURCES.has(s.signal_source) ? s.signal_source : undefined,
        source_url: null,
        source_type: s.source_description || "imported",
        observed_date: null,
        citation_excerpt: null,
        brand_verified: false,
        priority_source: "ai_derived",
        is_locked: false,
      }));

      const missingAsSignals = (result.missingSignals || []).map((s: any, i: number) => ({
        id: `missing-${i + 1}`,
        text: s.text,
        caveat: s.reason || "",
        direction: "neutral",
        strength: STRENGTH_MAP[s.importance] || "Medium",
        reliability: "Speculative",
        impact: s.importance === "High" ? 3 : s.importance === "Low" ? 1 : 2,
        category: ["evidence", "access", "competition", "guideline", "timing", "adoption"].includes(s.category) ? s.category : "evidence",
        source: "system",
        accepted: false,
        signal_class: "uncertainty",
        signal_family: "brand_clinical_regulatory",
        signal_source: "missing" as const,
        source_url: null,
        source_type: "gap analysis",
        observed_date: null,
        citation_excerpt: null,
        brand_verified: false,
        priority_source: "ai_uncertainty",
        is_locked: false,
      }));

      const allSignals = [...importedSignals, ...missingAsSignals];

      clearCaseState(newCaseId);

      if (allSignals.length > 0) {
        try {
          localStorage.setItem(`cios.signals:${newCaseId}`, JSON.stringify(allSignals));
          localStorage.setItem(`cios.aiRequested:${newCaseId}`, `imported-${Date.now()}`);
        } catch {}
      }

      const payload = {
        text: q.restatedQuestion || q.text,
        rawInput: q.text,
        caseId: newCaseId,
        timeHorizon: q.timeHorizon || "12 months",
        questionType: q.questionType || "binary",
        entities: q.entities || [],
        comparisonGroups: q.comparisonGroups || [],
        subject: q.subject || undefined,
        outcome: q.outcome || undefined,
        lifecycleStage: (created as any).drugStage || undefined,
        lifecycleStageRationale: (created as any).drugStageRationale || undefined,
      };
      createQuestion(payload);
      setShowImportProject(false);
      navigate("/comparison-groups");
    } catch (err) {
      console.error("Failed to create imported case:", err);
      setSubmitError("Unable to create the case. Check your connection and try again.");
      setPageState("input");
    }
  };

  const handleMultiImport = async (questions: any[], pack: any) => {
    setPageState("creating");
    setSubmitError(null);

    const createdCaseIds: string[] = [];
    const failedQuestions: string[] = [];

    const isGatedPack = !!pack.routedContent;

    const getMissingItems = (q: any): string[] => {
      if (isGatedPack && q.system && pack.missingInformation?.[q.system]) {
        return pack.missingInformation[q.system].slice(0, 3);
      }
      if (Array.isArray(pack.missingInformation)) {
        return pack.missingInformation.slice(0, 3);
      }
      return [];
    };

    const getRoutedSpans = (q: any): string[] => {
      if (isGatedPack && q.system && pack.routedContent?.[q.system]?.spans) {
        return pack.routedContent[q.system].spans.slice(0, 3).map((s: any) => s.text || s);
      }
      return [];
    };

    try {
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        try {
          const dq: DecisionQuestion = {
            id: `DQ-${Date.now()}-${qi}`,
            rawInput: q.text,
            questionType: "binary" as any,
            subject: q.suggestedSubject || "",
            outcome: "",
            populationOrEntities: [],
            timeHorizon: q.suggestedTimeHorizon || "12 months",
            missingFields: [],
            isComplete: true,
            interpretedQuestion: q.text,
            createdAt: new Date().toISOString(),
          };

          const caseInput = mapDecisionQuestionToCaseInput(dq);
          const created = await createCaseMutation.mutateAsync({
            data: caseInput as any,
          });
          const newCaseId = (created as any).caseId || (created as any).id;
          if (!newCaseId) {
            failedQuestions.push(q.text);
            continue;
          }

          createdCaseIds.push(newCaseId);
          clearCaseState(newCaseId);

          const systemLabel = q.system ? q.system.toUpperCase() : "CIOS";
          const routedSpans = getRoutedSpans(q);
          const missingItems = getMissingItems(q);

          const contextSignals = [
            {
              id: `context-1`,
              text: `Document context: ${pack.businessContext || pack.primaryDecision}`,
              caveat: `Source: ${pack.documentType} — ${pack.sourceFiles?.join(", ") || "uploaded document"} — Routed to ${systemLabel}`,
              direction: "neutral",
              strength: "Medium",
              reliability: "Probable",
              impact: 2,
              category: "evidence",
              source: "system",
              accepted: false,
              signal_class: "observed",
              signal_family: "brand_clinical_regulatory",
              signal_source: "external",
              source_url: null,
              source_type: `decision gating — ${systemLabel}`,
              observed_date: null,
              citation_excerpt: null,
              brand_verified: false,
              priority_source: "ai_derived",
              is_locked: false,
            },
            ...(pack.competitiveContext ? [{
              id: `context-2`,
              text: `Competitive landscape: ${pack.competitiveContext}`,
              caveat: "",
              direction: "neutral",
              strength: "Medium",
              reliability: "Probable",
              impact: 2,
              category: "competition",
              source: "system",
              accepted: false,
              signal_class: "observed",
              signal_family: "brand_clinical_regulatory",
              signal_source: "external",
              source_url: null,
              source_type: `decision gating — ${systemLabel}`,
              observed_date: null,
              citation_excerpt: null,
              brand_verified: false,
              priority_source: "ai_derived",
              is_locked: false,
            }] : []),
            ...routedSpans.map((spanText: string, i: number) => ({
              id: `span-${i + 1}`,
              text: spanText,
              caveat: `Evidence span routed to ${systemLabel} by Decision Gating Agent`,
              direction: "neutral",
              strength: "Medium",
              reliability: "Probable",
              impact: 2,
              category: "evidence",
              source: "system",
              accepted: false,
              signal_class: "observed",
              signal_family: "brand_clinical_regulatory",
              signal_source: "external",
              source_url: null,
              source_type: `routed span — ${systemLabel}`,
              observed_date: null,
              citation_excerpt: null,
              brand_verified: false,
              priority_source: "ai_derived",
              is_locked: false,
            })),
            ...missingItems.map((m: string, i: number) => ({
              id: `gap-${i + 1}`,
              text: m,
              caveat: `Identified as missing for ${systemLabel} by Decision Gating Agent`,
              direction: "neutral",
              strength: "Medium",
              reliability: "Speculative",
              impact: 2,
              category: "evidence",
              source: "system",
              accepted: false,
              signal_class: "uncertainty",
              signal_family: "brand_clinical_regulatory",
              signal_source: "missing",
              source_url: null,
              source_type: `gap analysis — ${systemLabel}`,
              observed_date: null,
              citation_excerpt: null,
              brand_verified: false,
              priority_source: "ai_uncertainty",
              is_locked: false,
            })),
          ];

          try {
            localStorage.setItem(`cios.signals:${newCaseId}`, JSON.stringify(contextSignals));
            localStorage.setItem(`cios.aiRequested:${newCaseId}`, `gated-${Date.now()}`);
            if (q.system) {
              localStorage.setItem(`cios.systemRoute:${newCaseId}`, q.system);
            }
          } catch {}
        } catch (err) {
          console.error(`Failed to create case for question ${qi}:`, err);
          failedQuestions.push(q.text);
        }
      }

      if (createdCaseIds.length > 0) {
        const firstCaseId = createdCaseIds[0];
        const firstQuestion = questions[0];
        const payload = {
          text: firstQuestion.text,
          rawInput: firstQuestion.text,
          caseId: firstCaseId,
          timeHorizon: firstQuestion.suggestedTimeHorizon || "12 months",
          questionType: "binary",
          entities: [],
          comparisonGroups: [],
          subject: firstQuestion.suggestedSubject || undefined,
          outcome: undefined,
        };
        createQuestion(payload);
        setShowImportProject(false);

        if (failedQuestions.length > 0) {
          setSubmitError(`Created ${createdCaseIds.length} case${createdCaseIds.length > 1 ? "s" : ""}, but ${failedQuestions.length} failed. You can find all cases in the Forecasts page.`);
        }
        navigate("/comparison-groups");
      } else {
        setSubmitError("No cases could be created. Please try again.");
        setPageState("input");
      }
    } catch (err) {
      console.error("Failed to create multi-import cases:", err);
      if (createdCaseIds.length > 0) {
        setSubmitError(`Partially completed: ${createdCaseIds.length} case${createdCaseIds.length > 1 ? "s" : ""} created before error. Check the Forecasts page.`);
        navigate("/comparison-groups");
      } else {
        setSubmitError("Unable to create cases. Check your connection and try again.");
        setPageState("input");
      }
    }
  };

  const feasVerdict = refineResult?.feasibility?.verdict;
  const proposalMatchesValidated = editedProposal.trim() === lastValidatedProposal.trim();
  const canProceed = !!refineResult && proposalMatchesValidated && !isEditingProposal && (feasVerdict === "feasible" || feasVerdict === "feasible_with_refinement");

  return (
    <WorkflowLayout
      currentStep="question"
      activeQuestion={activeQuestion}
      draftText={pageState === "input" && !activeQuestion && rawInput.trim() ? rawInput.trim() : undefined}
      onClearQuestion={() => {
        clearQuestion();
        startNewForecast();
      }}
    >
      <div className="space-y-5 max-w-3xl mx-auto">
        {submitError && (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {submitError}
          </div>
        )}

        {(pageState === "structuring" || pageState === "refining" || pageState === "creating") && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {pageState === "structuring" ? "Analyzing your question..." : pageState === "refining" ? "Checking feasibility..." : "Creating case..."}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {pageState === "structuring"
                    ? "Structuring the question for forecasting"
                    : pageState === "refining"
                    ? "Validating outcome clarity, time horizon, and modelability"
                    : "Interpreting and persisting the decision case"}
                </div>
              </div>
            </div>
          </div>
        )}

        {pageState === "reviewing" && structuringResult && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">CIOS Suggested Question</span>
              </div>

              {isEditingProposal ? (
                <div className="space-y-3">
                  <textarea
                    value={editedProposal}
                    onChange={(e) => setEditedProposal(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-blue-500/30 bg-background/50 px-4 py-3 text-sm text-foreground resize-none"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleReRunFeasibility} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 inline-flex items-center gap-1.5">
                      <RotateCcw className="w-3 h-3" />
                      Re-check Feasibility
                    </button>
                    <button type="button" onClick={() => { setIsEditingProposal(false); setEditedProposal(structuringResult.activeQuestion.questionText); }} className="rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-sm font-medium text-foreground leading-relaxed">
                    {editedProposal || structuringResult.activeQuestion.questionText}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/30 border border-border px-2 py-1 text-[11px] text-muted-foreground">
                      <Target className="w-3 h-3" />
                      {structuringResult.activeQuestion.archetype}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-muted/30 border border-border px-2 py-1 text-[11px] text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {structuringResult.activeQuestion.horizon}
                    </span>
                    {structuringResult.activeQuestion.boundedness === "bounded" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] text-emerald-400">
                        <CheckCircle2 className="w-3 h-3" />
                        Bounded
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={() => setIsEditingProposal(true)} className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300">
                    <Edit3 className="w-3 h-3" />
                    Edit this question
                  </button>
                </div>
              )}

              {structuringResult.activeQuestion.targetOutcome && (
                <div className="text-xs text-muted-foreground border-t border-blue-500/10 pt-3">
                  <span className="text-foreground/60 font-medium">Target outcome: </span>
                  {structuringResult.activeQuestion.targetOutcome}
                </div>
              )}
            </div>

            {structuringResult.improvementExplanation && (
              <div className="rounded-2xl border border-amber-500/15 bg-amber-500/5 p-5 space-y-2">
                <div className="flex items-center gap-2">
                  <Lightbulb className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-amber-400">Why This Is the Right Forecasting Structure</span>
                </div>
                <p className="text-sm text-foreground/80 leading-relaxed">
                  {structuringResult.improvementExplanation}
                </p>
              </div>
            )}

            {pageState === "reviewing" && (() => {
              const REVIEW_ARCHETYPES = [
                { name: "Launch Adoption Risk", prior: 0.50 },
                { name: "Competitive Displacement Risk", prior: 0.40 },
                { name: "Market Access Constraint", prior: 0.45 },
              ];
              return (
              <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/5 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Decision Pattern (Optional)</span>
                </div>
                <p className="text-xs text-foreground/60">Select the decision pattern that best matches the strategic question. This sets a defensible starting probability based on historical outcomes.</p>
                <div className="grid grid-cols-3 gap-2">
                  {REVIEW_ARCHETYPES.map((card) => {
                    const isSelected = selectedArchetype === card.name;
                    return (
                      <button
                        key={card.name}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedArchetype("");
                            setArchetypeRationale("");
                          } else {
                            setSelectedArchetype(card.name);
                            setArchetypeRationale("");
                          }
                        }}
                        className={`text-left rounded-xl border p-3 transition ${isSelected ? "border-cyan-500/50 bg-cyan-500/10" : "border-border hover:border-slate-600 bg-card/50"}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-semibold text-foreground">{card.name}</span>
                          <span className="text-[10px] font-mono text-cyan-400">{Math.round(card.prior * 100)}%</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {!refineResult && pageState === "reviewing" && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-red-400" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Feasibility Validation Required</span>
                </div>
                <p className="text-sm text-foreground/80">
                  The feasibility check could not be completed. A passing feasibility validation is required before you can proceed.
                </p>
                <button
                  type="button"
                  onClick={() => runFeasibilityCheck(rawInput.trim(), editedProposal.trim())}
                  className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-500 inline-flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3 h-3" />
                  Retry Feasibility Check
                </button>
              </div>
            )}

            {refineResult && (
              <>
                <div className={`rounded-2xl border p-5 space-y-3 ${
                  feasVerdict === "feasible" ? "border-emerald-500/20 bg-emerald-500/5" :
                  feasVerdict === "feasible_with_refinement" ? "border-amber-500/20 bg-amber-500/5" :
                  "border-red-500/20 bg-red-500/5"
                }`}>
                  <div className="flex items-center gap-2">
                    {feasVerdict === "feasible" ? <ShieldCheck className="w-4 h-4 text-emerald-400" /> :
                     feasVerdict === "feasible_with_refinement" ? <ShieldAlert className="w-4 h-4 text-amber-400" /> :
                     <XCircle className="w-4 h-4 text-red-400" />}
                    <span className={`text-[10px] font-bold uppercase tracking-widest ${
                      feasVerdict === "feasible" ? "text-emerald-400" :
                      feasVerdict === "feasible_with_refinement" ? "text-amber-400" :
                      "text-red-400"
                    }`}>
                      Feasibility Check — {feasVerdict === "feasible" ? "Feasible" : feasVerdict === "feasible_with_refinement" ? "Feasible with Refinement" : "Not Feasible"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{refineResult.feasibility.explanation}</p>

                  {refineResult.feasibility.suggestion && feasVerdict === "not_feasible" && (
                    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 mt-2">
                      <div className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Suggestion</div>
                      <div className="text-sm text-foreground/80">{refineResult.feasibility.suggestion}</div>
                    </div>
                  )}

                  {refineResult.feasibility.refinedQuestion && feasVerdict === "feasible_with_refinement" && (
                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mt-2 space-y-2">
                      <div className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Refined Version</div>
                      <div className="text-sm text-foreground">{refineResult.feasibility.refinedQuestion}</div>
                      {editedProposal !== refineResult.feasibility.refinedQuestion && (
                        <button
                          type="button"
                          onClick={() => { setEditedProposal(refineResult.feasibility.refinedQuestion!); setLastValidatedProposal(refineResult.feasibility.refinedQuestion!); }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10"
                        >
                          <Check className="w-3 h-3" />
                          Use refined version
                        </button>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 gap-2 mt-2">
                    {Object.entries(refineResult.feasibility.checks).map(([key, check]) => (
                      <div key={key} className="flex items-start gap-2">
                        {check.pass ? <Check className="w-3.5 h-3.5 text-emerald-400 mt-0.5 shrink-0" /> : <X className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />}
                        <div>
                          <span className="text-xs font-medium text-foreground/70">
                            {key === "clearOutcome" ? "Clear Outcome" :
                             key === "explicitHorizon" ? "Explicit Horizon" :
                             key === "observableEvent" ? "Observable Event" :
                             key === "decisionRelevance" ? "Decision Relevance" :
                             "Model Feasibility"}
                          </span>
                          {check.note && <span className="text-xs text-muted-foreground ml-1.5">— {check.note}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <ListTree className="w-4 h-4 text-purple-400" />
                    <span className="text-[10px] font-bold uppercase tracking-widest text-purple-400">
                      Outcome Structure — {refineResult.outcomeStructure.recommended === "multi_state" ? "Multi-State" : "Binary"}
                    </span>
                  </div>
                  <p className="text-sm text-foreground/80">{refineResult.outcomeStructure.explanation}</p>

                  <div className="space-y-2">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {refineResult.outcomeStructure.recommended === "multi_state" ? "Outcome States" : "Outcome Options"}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {outcomeStates.map((state, i) => (
                        <label key={i} className="inline-flex items-center gap-1 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-1.5 focus-within:border-purple-400 focus-within:ring-1 focus-within:ring-purple-400/30 transition-colors cursor-text">
                          <input
                            type="text"
                            value={state}
                            onChange={(e) => {
                              const updated = [...outcomeStates];
                              updated[i] = e.target.value;
                              setOutcomeStates(updated);
                            }}
                            className="bg-transparent text-xs text-foreground border-none outline-none w-auto min-w-[40px] cursor-text"
                            style={{ width: `${Math.max(40, state.length * 8 + 4)}px` }}
                          />
                          {outcomeStates.length > 2 && (
                            <button type="button" onClick={() => setOutcomeStates(outcomeStates.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </label>
                      ))}
                      <button
                        type="button"
                        onClick={() => setOutcomeStates([...outcomeStates, ""])}
                        className="inline-flex items-center gap-1 rounded-lg border border-dashed border-purple-500/20 px-3 py-1.5 text-xs text-purple-400 hover:bg-purple-500/5"
                      >
                        <Plus className="w-3 h-3" />
                        Add state
                      </button>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-teal-500/20 bg-teal-500/5 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <SplitSquareVertical className="w-4 h-4 text-teal-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-teal-400">
                        Composite Outcome Structure
                      </span>
                    </div>
                    {outcomeDimensions.length === 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setOutcomeDimensions(DEFAULT_OUTCOME_DIMENSIONS);
                          setCompositeScenarios(generateScenariosFromDimensions(DEFAULT_OUTCOME_DIMENSIONS));
                        }}
                        className="text-[10px] text-teal-400 hover:text-teal-300 border border-teal-500/30 rounded-lg px-3 py-1 hover:bg-teal-500/10 transition cursor-pointer"
                      >
                        Enable Composite Outcomes
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Define multiple outcome dimensions to evaluate scenarios combining competitive share, portfolio growth, and operational stability.
                  </p>

                  {outcomeDimensions.length > 0 && (
                    <div className="space-y-3">
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Outcome Dimensions</div>
                      {outcomeDimensions.map((dim, di) => (
                        <div key={di} className="rounded-lg border border-teal-500/15 bg-teal-500/5 p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={dim.name}
                              onChange={(e) => {
                                const updated = [...outcomeDimensions];
                                updated[di] = { ...updated[di], name: e.target.value };
                                setOutcomeDimensions(updated);
                              }}
                              className="bg-transparent text-xs font-semibold text-teal-300 border-none outline-none flex-1"
                              placeholder="Dimension name"
                            />
                            {outcomeDimensions.length > 1 && (
                              <button type="button" onClick={() => {
                                const updated = outcomeDimensions.filter((_, j) => j !== di);
                                setOutcomeDimensions(updated);
                                setCompositeScenarios(generateScenariosFromDimensions(updated));
                              }} className="text-muted-foreground hover:text-red-400">
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {dim.levels.map((level, li) => (
                              <label key={li} className="inline-flex items-center gap-1 rounded-lg border border-teal-500/20 bg-teal-500/10 px-2 py-1 cursor-text">
                                <input
                                  type="text"
                                  value={level}
                                  onChange={(e) => {
                                    const updated = [...outcomeDimensions];
                                    const newLevels = [...updated[di].levels];
                                    newLevels[li] = e.target.value;
                                    updated[di] = { ...updated[di], levels: newLevels };
                                    setOutcomeDimensions(updated);
                                  }}
                                  className="bg-transparent text-[11px] text-foreground border-none outline-none w-auto min-w-[30px]"
                                  style={{ width: `${Math.max(30, level.length * 7 + 4)}px` }}
                                />
                                {dim.levels.length > 2 && (
                                  <button type="button" onClick={() => {
                                    const updated = [...outcomeDimensions];
                                    updated[di] = { ...updated[di], levels: updated[di].levels.filter((_, j) => j !== li) };
                                    setOutcomeDimensions(updated);
                                  }} className="text-muted-foreground hover:text-red-400">
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                )}
                              </label>
                            ))}
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...outcomeDimensions];
                                updated[di] = { ...updated[di], levels: [...updated[di].levels, ""] };
                                setOutcomeDimensions(updated);
                              }}
                              className="text-[10px] text-teal-400/70 hover:text-teal-300 px-2 py-0.5 border border-dashed border-teal-500/15 rounded-lg"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setOutcomeDimensions([...outcomeDimensions, { name: "", levels: ["High", "Low"] }])}
                        className="text-[10px] text-teal-400 hover:text-teal-300 border border-dashed border-teal-500/20 rounded-lg px-3 py-1.5 w-full hover:bg-teal-500/5 transition cursor-pointer"
                      >
                        <Plus className="w-3 h-3 inline mr-1" /> Add Dimension
                      </button>

                      <div className="pt-2 border-t border-teal-500/10">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Generated Scenarios</span>
                          <button
                            type="button"
                            onClick={() => setCompositeScenarios(generateScenariosFromDimensions(outcomeDimensions))}
                            className="text-[10px] text-teal-400 hover:text-teal-300 border border-teal-500/30 rounded-lg px-2 py-0.5 hover:bg-teal-500/10 transition cursor-pointer"
                          >
                            Regenerate
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          {compositeScenarios.map((scenario, si) => (
                            <div key={scenario.id} className="flex items-center gap-2 rounded-lg border border-teal-500/15 bg-teal-500/5 px-3 py-2">
                              <span className="text-[10px] font-bold text-teal-400 tabular-nums w-5">{si + 1}</span>
                              <input
                                type="text"
                                value={scenario.label}
                                onChange={(e) => {
                                  const updated = [...compositeScenarios];
                                  updated[si] = { ...updated[si], label: e.target.value };
                                  setCompositeScenarios(updated);
                                }}
                                className="bg-transparent text-xs text-foreground border-none outline-none flex-1"
                              />
                              {compositeScenarios.length > 2 && (
                                <button type="button" onClick={() => setCompositeScenarios(compositeScenarios.filter((_, j) => j !== si))} className="text-muted-foreground hover:text-red-400">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {structuringResult.driftDetected && structuringResult.driftWarning && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-300">Question Drift Detected</div>
                  <div className="text-[11px] text-amber-200/70 mt-1">{structuringResult.driftWarning}</div>
                  <div className="text-[10px] text-slate-400 mt-1.5">The strategic-risk version has been selected as the primary question. The financial version is available below as a supporting question.</div>
                </div>
              </div>
            )}

            {structuringResult.supportingQuestions.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Supporting Questions
                </div>
                {structuringResult.supportingQuestions.map((sq, i) => {
                  const status = supportingStatuses[i];
                  if (status === "discarded") return null;
                  return (
                    <div key={i} className={`rounded-lg border p-3 ${status === "analyze_tandem" ? "border-blue-500/30 bg-blue-500/5" : status === "promoted" ? "border-emerald-500/30 bg-emerald-500/5" : "border-border bg-muted/10"}`}>
                      <div className="text-xs text-foreground/80">{sq.questionText}</div>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground">{sq.archetype}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{sq.horizon}</span>
                        {sq.questionType && (
                          <>
                            <span className="text-[10px] text-muted-foreground">·</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${sq.questionType === "strategic" ? "bg-blue-500/10 text-blue-400" : sq.questionType === "financial" ? "bg-amber-500/10 text-amber-400" : sq.questionType === "competitive" ? "bg-purple-500/10 text-purple-400" : "bg-slate-500/10 text-slate-400"}`}>
                              {sq.questionType}
                            </span>
                          </>
                        )}
                        {status && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${status === "analyze_tandem" ? "bg-blue-500/20 text-blue-300" : status === "saved" ? "bg-slate-500/20 text-slate-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                            {status === "analyze_tandem" ? "Analyzing" : status === "saved" ? "Saved" : "Promoted"}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <button
                          type="button"
                          onClick={() => setSupportingStatuses(prev => ({ ...prev, [i]: "analyze_tandem" }))}
                          className={`text-[10px] px-2 py-1 rounded border ${status === "analyze_tandem" ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
                        >
                          Analyze in tandem
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupportingStatuses(prev => ({ ...prev, [i]: "saved" }))}
                          className={`text-[10px] px-2 py-1 rounded border ${status === "saved" ? "border-slate-500/40 bg-slate-500/10 text-slate-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
                        >
                          Save for later
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (structuringResult) {
                              const promoted = sq;
                              const newActive = { ...promoted };
                              const newSupporting = structuringResult.supportingQuestions.map((s, j) =>
                                j === i ? { ...structuringResult.activeQuestion } : s
                              );
                              setStructuringResult({
                                ...structuringResult,
                                activeQuestion: newActive,
                                supportingQuestions: newSupporting,
                              });
                              setSupportingStatuses({});
                            }
                          }}
                          className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5"
                        >
                          Promote to primary
                        </button>
                        <button
                          type="button"
                          onClick={() => setSupportingStatuses(prev => ({ ...prev, [i]: "discarded" }))}
                          className="text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/5"
                        >
                          Discard
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleAcceptAndContinue}
                disabled={!canProceed || pageState === "creating"}
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pageState === "creating" ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Creating case...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" /> Accept & Continue</>
                )}
              </button>
              <button
                type="button"
                onClick={() => { setPageState("input"); setStructuringResult(null); setRefineResult(null); setIsEditingProposal(false); setEditedProposal(""); setLastValidatedProposal(""); setOutcomeStates([]); setSubmitError(null); }}
                className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/10 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start over
              </button>
            </div>
          </div>
        )}

        {activeQuestion && pageState === "input" && !isEditMode ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60">
                  Active Question
                </div>
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-400/80">
                  <ShieldCheck className="w-3 h-3" />
                  <span>Fields Locked</span>
                </div>
              </div>
              <div className="text-lg font-medium text-foreground leading-relaxed">
                {activeQuestion.text}
              </div>
              {(activeQuestion.threshold || activeQuestion.timeHorizon || activeQuestion.outcome) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {activeQuestion.outcome && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-slate-700/50 text-slate-300 border border-slate-600/30">
                      <Target className="w-2.5 h-2.5" /> {activeQuestion.outcome}
                    </span>
                  )}
                  {activeQuestion.threshold && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-slate-700/50 text-slate-300 border border-slate-600/30">
                      {activeQuestion.threshold}
                    </span>
                  )}
                  {activeQuestion.timeHorizon && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-slate-700/50 text-slate-300 border border-slate-600/30">
                      <Clock className="w-2.5 h-2.5" /> {activeQuestion.timeHorizon}
                    </span>
                  )}
                </div>
              )}
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => navigate("/comparison-groups")}
                  className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2"
                >
                  Continue to Comparison Groups
                  <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={enterEditMode}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 inline-flex items-center gap-1.5 transition"
                >
                  <PenLine className="w-3.5 h-3.5" />
                  Edit question
                </button>
              </div>
            </div>
          </div>
        ) : pageState === "input" ? (
          <>
            {isEditMode && (
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-amber-200/80">
                    Editing existing case — changes will update the current case.
                  </div>
                  <button
                    type="button"
                    onClick={resetAll}
                    className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-3 h-3" />
                    Cancel edit
                  </button>
                </div>
              </div>
            )}

            {pageState === "input" && (() => {
              const ARCHETYPE_CARDS: { name: string; prior: number; tagline: string; examples: string; comingSoon: boolean; templateId: string; rationale: string; trap: string }[] = [
                { name: "Launch Adoption Risk", prior: 0.50, tagline: "Will a new product achieve its adoption target post-launch?", examples: "First-year share goals, formulary uptake speed, launch trajectory vs. plan", comingSoon: false, templateId: "pt-01", rationale: "Baseline assumption for predicting whether a newly launched product will hit its adoption milestone. Half of similar launches meet their initial targets.", trap: "Anchoring too heavily on company guidance timelines without cross-checking regulatory history." },
                { name: "Competitive Displacement Risk", prior: 0.40, tagline: "Will a new entrant displace an incumbent therapy?", examples: "Biosimilar erosion, best-in-class switching, formulary substitution", comingSoon: false, templateId: "pt-04", rationale: "Baseline assumption for predicting whether a competitive entrant will meaningfully displace an established therapy. Below even because incumbents retain structural advantages.", trap: "Assuming early specialist uptake predicts community physician behavior." },
                { name: "Market Access Constraint", prior: 0.45, tagline: "Will payer barriers limit a product's commercial reach?", examples: "Prior auth, step therapy, formulary exclusion, coverage decisions", comingSoon: false, templateId: "pt-05", rationale: "Baseline assumption for predicting whether payer, reimbursement, formulary, or coverage barriers will limit use. Below even because access friction is a common bottleneck.", trap: "Overweighting launch-day formulary placement without tracking prior authorization burden." },
                { name: "Regulatory Outcome Risk", prior: 0.35, tagline: "Will a regulatory milestone succeed or fail?", examples: "FDA approval, label changes, safety reviews, REMS decisions", comingSoon: false, templateId: "pt-02", rationale: "Baseline assumption for predicting whether a regulatory milestone will succeed, be delayed, or fail. Historically, roughly one-third of first-cycle submissions receive approval without delay.", trap: "Assuming regulatory precedent from a different therapeutic area applies equally." },
                { name: "Early Adoption Acceleration", prior: 0.55, tagline: "Will specialists adopt faster than expected?", examples: "KOL uptake, early prescriber behavior, clinical trial impact on practice", comingSoon: false, templateId: "pt-03", rationale: "Baseline assumption for predicting whether early adopters — specialists, KOLs, or expert centers — will adopt faster than expected. Slightly above even because early-adopter segments tend to move ahead of broader consensus.", trap: "Conflating KOL enthusiasm at congresses with actual prescribing behavior." },
                { name: "Clinical Differentiation Sustainability", prior: 0.45, tagline: "Will clinical differentiation hold up over time?", examples: "Real-world evidence erosion, competitive data maturation, guideline shifts", comingSoon: false, templateId: "", rationale: "Baseline assumption for predicting whether a product's clinical differentiation will sustain against emerging data, new entrants, and evolving treatment guidelines.", trap: "Overweighting pivotal trial advantages without accounting for real-world evidence convergence." },
              ];
              return (
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Step 1
                  </div>
                  <h1 className="mt-2 text-2xl font-semibold text-foreground">Define the Question</h1>
                  <p className="text-sm text-muted-foreground mt-1">Select the archetype that matches your forecasting question. This sets the starting prior and guides signal collection.</p>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                  {ARCHETYPE_CARDS.map((card) => {
                    const isSelected = selectedArchetype === card.name;
                    const isDisabled = card.comingSoon;
                    return (
                      <button
                        key={card.name}
                        type="button"
                        disabled={isDisabled}
                        onClick={() => {
                          if (isDisabled) return;
                          if (isSelected) {
                            setSelectedArchetype("");
                            setArchetypeRationale("");
                          } else {
                            setSelectedArchetype(card.name);
                            setArchetypeRationale(card.rationale);
                          }
                        }}
                        className={`text-left rounded-2xl border-2 p-5 transition-all relative ${
                          isDisabled
                            ? "border-border/50 bg-card/30 opacity-60 cursor-not-allowed"
                            : isSelected
                              ? "border-cyan-500/60 bg-cyan-500/10 shadow-lg shadow-cyan-500/5"
                              : "border-border hover:border-cyan-500/30 bg-card hover:bg-card/80"
                        }`}
                      >
                        {isDisabled && (
                          <span className="absolute top-3 right-3 text-[9px] font-bold uppercase tracking-widest text-amber-400/70 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">Coming Soon</span>
                        )}
                        <div className="flex items-center justify-between mb-2 pr-1">
                          <span className={`text-sm font-bold ${isDisabled ? "text-foreground/50" : "text-foreground"}`}>{card.name}</span>
                        </div>
                        <p className={`text-xs mb-1.5 ${isDisabled ? "text-foreground/40" : "text-foreground/70"}`}>{card.tagline}</p>
                        <p className={`text-[10px] ${isDisabled ? "text-muted-foreground/50" : "text-muted-foreground"}`}>{card.examples}</p>
                      </button>
                    );
                  })}
                </div>
                {selectedArchetype && (() => {
                  const card = ARCHETYPE_CARDS.find((c) => c.name === selectedArchetype);
                  if (!card) return null;
                  return (
                    <div className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Prior Rationale</span>
                      </div>
                      <p className="text-xs text-foreground/70">{card.rationale}</p>
                      {card.trap && (
                        <div className="mt-2 pt-2 border-t border-cyan-500/10">
                          <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Common Trap: </span>
                          <span className="text-[10px] text-foreground/50">{card.trap}</span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
              );
            })()}

            <div className="rounded-2xl border border-border bg-card p-6">
              <label className="mb-3 block text-lg font-semibold text-foreground">
                What decision are you trying to make?
              </label>
              <p className="text-sm text-muted-foreground mb-4">
                Type your question in plain language. CIOS will structure it, validate feasibility, and recommend an outcome format before you proceed.
              </p>
              <textarea
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                placeholder={(() => {
                  const placeholders: Record<string, string> = {
                    "Launch Adoption Risk": "Will [drug] achieve >[X]% of new [indication] starts within [timeframe] of launch?",
                    "Competitive Displacement Risk": "What is the probability that [new entrant] displaces [incumbent] in [indication] within [timeframe]?",
                    "Market Access Constraint": "Will [payer/PBM] implement [restriction] for [therapy] within [timeframe]?",
                  };
                  if (selectedArchetype && placeholders[selectedArchetype]) return placeholders[selectedArchetype];
                  return "Example: Will the FDA implement a safety-related label change for Xarelto within the next 12 months due to GI bleeding risk signals?";
                })()}
                rows={4}
                autoFocus
                disabled={pageState !== "input"}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && rawInput.trim()) {
                    e.preventDefault();
                    handleStructure();
                  }
                }}
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleStructure}
                  disabled={!rawInput.trim() || pageState !== "input"}
                  className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  Analyze Question
                </button>
              </div>
            </div>

            {showImportProject && (
              <ImportProjectDialog
                onImportComplete={handleImportComplete}
                onMultiImport={handleMultiImport}
                initialFile={pendingImportFile}
                onClose={() => {
                  setShowImportProject(false);
                  setPendingImportFile(null);
                  setSubmitError(null);
                }}
              />
            )}

            <DeferredQuestionsPanel onUseQuestion={(text) => {
              setShowImportProject(false);
              setRawInput(text);
            }} />

            {pageState === "input" && !isEditMode && (
              <>
                <div className="mt-8 border-t border-white/5 pt-6">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">Other input methods</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => navigate("/case-input")}
                      className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05] hover:border-white/20 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <FileText className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition" />
                        <div>
                          <div className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 transition">Structured Input</div>
                          <div className="text-[10px] text-muted-foreground/40">Define a case manually</div>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => navigate("/ingest")}
                      className="rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:bg-white/[0.05] hover:border-white/20 group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Layers className="w-4 h-4 text-muted-foreground/50 group-hover:text-muted-foreground transition" />
                        <div>
                          <div className="text-xs font-medium text-foreground/60 group-hover:text-foreground/80 transition">Ingest Document</div>
                          <div className="text-[10px] text-muted-foreground/40">Upload a PDF, abstract, or any file</div>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>
    </WorkflowLayout>
  );
}

interface DeferredQuestion {
  text: string;
  rationale: string;
  category: string;
  priority: string;
  suggestedTimeHorizon: string;
  suggestedSubject: string;
  rank?: number;
  rankRationale?: string;
  decisionType?: string;
  strategicImpact?: string;
  urgency?: string;
  evidenceDependency?: string;
  confidence?: string;
  savedAt: string;
  sourceDocument?: string;
  businessContext?: string;
  status?: "Saved" | "Analyzed" | "Removed";
}

function DeferredQuestionsPanel({ onUseQuestion }: { onUseQuestion: (text: string) => void }) {
  const [deferred, setDeferred] = useState<DeferredQuestion[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("cios.deferredQuestions") || "[]");
      if (Array.isArray(stored) && stored.length > 0) {
        setDeferred(stored);
      }
    } catch {}
  }, []);

  const updateQuestionStatus = (index: number, newStatus: "Analyzed" | "Removed") => {
    const updated = deferred.map((q, i) =>
      i === index ? { ...q, status: newStatus as const } : q
    );
    setDeferred(updated);
    localStorage.setItem("cios.deferredQuestions", JSON.stringify(updated));
  };

  const activeQuestions = deferred.filter(q => q.status !== "Removed");
  if (activeQuestions.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/10 transition rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-slate-500/10 p-2">
            <Archive className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">Saved Questions</div>
            <div className="text-[11px] text-muted-foreground">
              {activeQuestions.length} question{activeQuestions.length !== 1 ? "s" : ""} saved for later analysis
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground">
          {expanded ? "Hide" : "Show"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-2">
          {deferred.filter(q => q.status !== "Removed").map((q) => {
            const originalIndex = deferred.indexOf(q);
            return (
            <div key={originalIndex} className={`rounded-xl border bg-muted/5 p-4 space-y-2 ${q.status === "Analyzed" ? "border-emerald-500/20 opacity-70" : "border-border"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground leading-relaxed">{q.text}</div>
                  <div className="text-xs text-muted-foreground mt-1">{q.rationale}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); updateQuestionStatus(originalIndex, "Removed"); }}
                  className="rounded-lg border border-border p-1.5 hover:bg-red-500/10 hover:border-red-500/30 transition shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                </button>
              </div>
              {(q.decisionType || q.strategicImpact || q.urgency) && (
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  {q.decisionType && (
                    <span><span className="text-muted-foreground/60">Type:</span> <span className="text-foreground/70">{q.decisionType}</span></span>
                  )}
                  {q.strategicImpact && (
                    <span><span className="text-muted-foreground/60">Impact:</span> <span className={q.strategicImpact === "High" ? "text-amber-400" : "text-foreground/70"}>{q.strategicImpact}</span></span>
                  )}
                  {q.urgency && (
                    <span><span className="text-muted-foreground/60">Urgency:</span> <span className={q.urgency === "Immediate" ? "text-red-400" : "text-foreground/70"}>{q.urgency}</span></span>
                  )}
                  {q.evidenceDependency && (
                    <span><span className="text-muted-foreground/60">Evidence:</span> <span className="text-foreground/70">{q.evidenceDependency}</span></span>
                  )}
                  {q.confidence && (
                    <span><span className="text-muted-foreground/60">Confidence:</span> <span className={q.confidence === "High" ? "text-emerald-400" : "text-foreground/70"}>{q.confidence}</span></span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                {q.rank && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-400 border border-slate-500/25">
                    Rank #{q.rank}
                  </span>
                )}
                {q.status && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                    q.status === "Analyzed" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    q.status === "Removed" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-slate-500/10 text-slate-400 border-slate-500/20"
                  }`}>
                    {q.status}
                  </span>
                )}
                {q.suggestedSubject && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {q.suggestedSubject}
                  </span>
                )}
                <span className="text-[10px] text-muted-foreground">{q.suggestedTimeHorizon}</span>
                {q.sourceDocument && (
                  <span className="text-[10px] text-muted-foreground/60">from {q.sourceDocument}</span>
                )}
              </div>
              {q.status !== "Analyzed" ? (
                <button
                  type="button"
                  onClick={() => { onUseQuestion(q.text); updateQuestionStatus(originalIndex, "Analyzed"); }}
                  className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition inline-flex items-center gap-1.5"
                >
                  <ArrowRight className="w-3 h-3" />
                  Analyze This Question
                </button>
              ) : (
                <div className="text-[10px] text-emerald-400 italic">Sent to analysis</div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
