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
import {
  AlertTriangle,
  Loader2,
  ArrowRight,
  PenLine,
  Plus,
  Sparkles,
  Upload,
  MessageSquare,
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
} from "lucide-react";
import ImportProjectDialog from "@/components/question/ImportProjectDialog";

const API = import.meta.env.VITE_API_URL || "";

interface StructuredQuestion {
  questionText: string;
  archetype: string;
  horizon: string;
  targetOutcome: string;
  boundedness: "bounded" | "needs_splitting" | "too_broad";
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
}

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

const EXAMPLE_QUESTIONS = [
  "Will Viatris launch the generic aripiprazole vial in 2026 or will manufacturing delays push it to 2027?",
  "Will ARIKAYCE achieve target specialist adoption among pulmonologists within 12 months?",
  "Will anti-amyloid biologic adoption reach memory clinic threshold despite REMS infusion site requirements within 24 months?",
  "Will non-stimulant ADHD therapy gain community pediatrics adoption within 12 months given stimulant supply constraints?",
  "Will NCCN include this therapy in 2027 guidelines?",
  "Will a biosimilar enter the market before 2028?",
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

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const createCaseMutation = useCreateCase();

  const [rawInput, setRawInput] = useState(activeQuestion?.text ?? "");
  const [pageState, setPageState] = useState<PageState>("input");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editCaseId, setEditCaseId] = useState("");
  const [structuringResult, setStructuringResult] = useState<QuestionStructuringResult | null>(null);
  const [refineResult, setRefineResult] = useState<RefineResult | null>(null);
  const [isEditingProposal, setIsEditingProposal] = useState(false);
  const [editedProposal, setEditedProposal] = useState("");
  const [lastValidatedProposal, setLastValidatedProposal] = useState("");
  const [outcomeStates, setOutcomeStates] = useState<string[]>([]);
  const [showImportProject, setShowImportProject] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("import") === "file";
  });
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [syncedCaseId, setSyncedCaseId] = useState<string | null>(activeQuestion?.caseId ?? null);
  const [userCleared, setUserCleared] = useState(false);

  useEffect(() => {
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

  const handleAcceptAndContinue = useCallback(async () => {
    if (!refineResult || refineResult.feasibility?.verdict === "not_feasible") return;

    const finalQuestion = refineResult?.feasibility?.refinedQuestion || editedProposal.trim() || structuringResult?.activeQuestion?.questionText || rawInput.trim();
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
      const payload = {
        text: interpretation.restatedQuestion || finalQuestion,
        caseId: editCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        comparisonGroups: interpretation.comparisonGroups || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
      };
      updateQuestion(payload);
      if (structuringResult) {
        try { localStorage.setItem(`cios.questionStructuring:${editCaseId}`, JSON.stringify(structuringResult)); } catch {}
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
      const caseInput = mapDecisionQuestionToCaseInput(dq);
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
      };
      createQuestion(payload);
      navigate("/comparison-groups");
    } catch (err) {
      console.error("Failed to create case:", err);
      setSubmitError("Unable to create a case. Check your connection and try again.");
      setPageState("reviewing");
    }
  }, [rawInput, editedProposal, structuringResult, refineResult, outcomeStates, isEditMode, editCaseId, createCaseMutation, createQuestion, updateQuestion, navigate]);

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
                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">AI Suggested Question</span>
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
                        <div key={i} className="inline-flex items-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/10 px-3 py-1.5">
                          <input
                            type="text"
                            value={state}
                            onChange={(e) => {
                              const updated = [...outcomeStates];
                              updated[i] = e.target.value;
                              setOutcomeStates(updated);
                            }}
                            className="bg-transparent text-xs text-foreground border-none outline-none w-auto min-w-[60px]"
                            style={{ width: `${Math.max(60, state.length * 7)}px` }}
                          />
                          {outcomeStates.length > 2 && (
                            <button type="button" onClick={() => setOutcomeStates(outcomeStates.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-red-400">
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </div>
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
              </>
            )}

            {structuringResult.supportingQuestions.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Supporting Questions
                </div>
                {structuringResult.supportingQuestions.map((sq, i) => (
                  <div key={i} className="rounded-lg border border-border bg-muted/10 p-3">
                    <div className="text-xs text-foreground/80">{sq.questionText}</div>
                    <div className="flex gap-2 mt-1.5">
                      <span className="text-[10px] text-muted-foreground">{sq.archetype}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <span className="text-[10px] text-muted-foreground">{sq.horizon}</span>
                    </div>
                  </div>
                ))}
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
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 mb-3">
                Active Question
              </div>
              <div className="text-lg font-medium text-foreground leading-relaxed">
                {activeQuestion.text}
              </div>
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

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setShowImportProject(false)}
                className={`rounded-xl border-2 px-5 py-5 text-left transition group ${
                  !showImportProject
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${!showImportProject ? "bg-primary/10" : "bg-muted/20"}`}>
                    <MessageSquare className={`w-5 h-5 ${!showImportProject ? "text-primary" : "text-muted-foreground group-hover:text-primary"} transition`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Ask a Question</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Type a decision question in plain language</div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShowImportProject(true)}
                className={`rounded-xl border-2 px-5 py-5 text-left transition group ${
                  showImportProject
                    ? "border-primary/50 bg-primary/5"
                    : "border-border hover:border-primary/30 bg-card"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`rounded-lg p-2.5 ${showImportProject ? "bg-primary/10" : "bg-muted/20"}`}>
                    <Upload className={`w-5 h-5 ${showImportProject ? "text-primary" : "text-muted-foreground group-hover:text-primary"} transition`} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-foreground">Import Project</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">Upload files, images, or paste text</div>
                  </div>
                </div>
              </button>
            </div>

            {showImportProject ? (
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
            ) : (
              <div className="rounded-2xl border border-border bg-card p-6">
                <label className="mb-3 block text-lg font-semibold text-foreground">
                  What decision are you trying to make?
                </label>
                <p className="text-sm text-muted-foreground mb-4">
                  Type your question in plain language. AI will structure it, validate feasibility, and recommend an outcome format before you proceed.
                </p>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Example: Will the FDA implement a safety-related label change for Xarelto within the next 12 months due to GI bleeding risk signals?"
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

                {!rawInput.trim() && pageState === "input" && !isEditMode && (
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                      <span>Or start with one of these:</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {EXAMPLE_QUESTIONS.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setRawInput(q)}
                          className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-left text-xs text-foreground/80 hover:bg-blue-500/10 hover:border-blue-500/30 transition"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

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
            )}

            <DeferredQuestionsPanel onUseQuestion={(text) => {
              setShowImportProject(false);
              setRawInput(text);
            }} />
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
