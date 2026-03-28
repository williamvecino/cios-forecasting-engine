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
  inputHash: string;
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
  restatedQuestion: string;
}

type PageState = "input" | "structuring" | "creating";

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
      restatedQuestion: interpreted || text,
    };
  }

  const handleContinue = useCallback(async () => {
    const text = rawInput.trim();
    if (!text) return;
    setSubmitError(null);
    setStructuringResult(null);
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

    setPageState("creating");

    const questionText = structuredResult?.activeQuestion?.questionText || text;

    let interpretation: Interpretation;
    try {
      const res = await fetch(`${API}/api/ai-interpret-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: questionText }),
      });

      if (!res.ok) {
        throw new Error("Interpretation failed");
      }

      const data = await res.json();
      if (!data.interpretation || !data.interpretation.restatedQuestion) {
        throw new Error("Malformed interpretation response");
      }
      interpretation = data.interpretation;
    } catch {
      interpretation = buildLocalFallback(questionText);
    }

    if (structuredResult) {
      interpretation.questionType = structuredResult.activeQuestion.archetype || interpretation.questionType;
      interpretation.timeHorizon = structuredResult.activeQuestion.horizon || interpretation.timeHorizon;
    }

    if (isEditMode && editCaseId) {
      const payload = {
        text: interpretation.restatedQuestion || questionText,
        caseId: editCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
      };
      updateQuestion(payload);

      if (structuredResult) {
        try {
          localStorage.setItem(`cios.questionStructuring:${editCaseId}`, JSON.stringify(structuredResult));
        } catch {}
      }

      navigate("/signals");
      return;
    }

    try {
      const dq: DecisionQuestion = {
        id: `DQ-${Date.now()}`,
        rawInput: text,
        questionType: (interpretation.questionType || "binary") as any,
        subject: interpretation.subject || "",
        outcome: interpretation.outcome || "",
        populationOrEntities: interpretation.entities || [],
        timeHorizon: interpretation.timeHorizon || "12 months",
        missingFields: [],
        isComplete: true,
        interpretedQuestion: interpretation.restatedQuestion || questionText,
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
        return;
      }

      clearCaseState(newCaseId);

      if (structuredResult) {
        try {
          localStorage.setItem(`cios.questionStructuring:${newCaseId}`, JSON.stringify(structuredResult));
        } catch {}
      }

      const payload = {
        text: interpretation.restatedQuestion || questionText,
        rawInput: text,
        caseId: newCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
      };
      createQuestion(payload);
      navigate("/signals");
    } catch (err) {
      console.error("Failed to create case:", err);
      setSubmitError("Unable to create a case. Check your connection and try again.");
      setPageState("input");
    }
  }, [rawInput, isEditMode, editCaseId, createCaseMutation, createQuestion, updateQuestion, navigate]);

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
        subject: q.subject || undefined,
        outcome: q.outcome || undefined,
      };
      createQuestion(payload);
      setShowImportProject(false);
      navigate("/signals");
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
          subject: firstQuestion.suggestedSubject || undefined,
          outcome: undefined,
        };
        createQuestion(payload);
        setShowImportProject(false);

        if (failedQuestions.length > 0) {
          setSubmitError(`Created ${createdCaseIds.length} case${createdCaseIds.length > 1 ? "s" : ""}, but ${failedQuestions.length} failed. You can find all cases in the Forecasts page.`);
        }
        navigate("/signals");
      } else {
        setSubmitError("No cases could be created. Please try again.");
        setPageState("input");
      }
    } catch (err) {
      console.error("Failed to create multi-import cases:", err);
      if (createdCaseIds.length > 0) {
        setSubmitError(`Partially completed: ${createdCaseIds.length} case${createdCaseIds.length > 1 ? "s" : ""} created before error. Check the Forecasts page.`);
        navigate("/signals");
      } else {
        setSubmitError("Unable to create cases. Check your connection and try again.");
        setPageState("input");
      }
    }
  };

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

        {(pageState === "structuring" || pageState === "creating") && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  {pageState === "structuring" ? "Structuring question..." : "Creating case..."}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {pageState === "structuring"
                    ? "Analyzing boundedness, archetype, and target outcome"
                    : "Interpreting and persisting the decision case"}
                </div>
              </div>
            </div>
            {structuringResult && (
              <div className="space-y-3 border-t border-border pt-4">
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-400/70">
                  Question Structuring Agent
                </div>
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                  <div className="text-sm font-medium text-foreground">
                    {structuringResult.activeQuestion.questionText}
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
                    {structuringResult.activeQuestion.boundedness === "needs_splitting" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-1 text-[11px] text-amber-400">
                        <SplitSquareVertical className="w-3 h-3" />
                        Split into sub-questions
                      </span>
                    )}
                    {structuringResult.activeQuestion.boundedness === "too_broad" && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 border border-red-500/20 px-2 py-1 text-[11px] text-red-400">
                        <XCircle className="w-3 h-3" />
                        Too broad
                      </span>
                    )}
                  </div>
                  {structuringResult.activeQuestion.targetOutcome && (
                    <div className="text-xs text-muted-foreground">
                      <span className="text-foreground/60 font-medium">Target: </span>
                      {structuringResult.activeQuestion.targetOutcome}
                    </div>
                  )}
                </div>
                {structuringResult.supportingQuestions.length > 0 && (
                  <div className="space-y-2">
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
              </div>
            )}
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
                  onClick={() => navigate("/signals")}
                  className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2"
                >
                  Continue to Add Information
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
        ) : (
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
                  Type your question in plain language. We will interpret and structure it for you.
                </p>
                <textarea
                  value={rawInput}
                  onChange={(e) => setRawInput(e.target.value)}
                  placeholder="Example: Will Viatris launch the generic aripiprazole vial in 2026 or will manufacturing delays push it to 2027?"
                  rows={4}
                  autoFocus
                  disabled={pageState === "creating"}
                  className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none disabled:opacity-50"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && rawInput.trim()) {
                      e.preventDefault();
                      handleContinue();
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
                    onClick={handleContinue}
                    disabled={!rawInput.trim() || pageState === "creating"}
                    className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {pageState === "creating" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating case...
                      </>
                    ) : (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </WorkflowLayout>
  );
}
