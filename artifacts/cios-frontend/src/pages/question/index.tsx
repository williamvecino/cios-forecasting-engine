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
  Sparkles,
  ArrowRight,
  PenLine,
  Plus,
  Check,
  RotateCcw,
  Edit3,
  Upload,
  MessageSquare,
} from "lucide-react";
import ImportProjectDialog from "@/components/question/ImportProjectDialog";

const API = import.meta.env.VITE_API_URL || "";

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

type PageState = "input" | "interpreting" | "confirm" | "submitting";

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const createCaseMutation = useCreateCase();

  const [rawInput, setRawInput] = useState("");
  const [pageState, setPageState] = useState<PageState>("input");
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editCaseId, setEditCaseId] = useState("");
  const [showImportProject, setShowImportProject] = useState(false);

  useEffect(() => {
    localStorage.removeItem("cios.questionDraft");
  }, []);

  function resetAll() {
    setRawInput("");
    setPageState("input");
    setInterpretation(null);
    setEditingField(null);
    setSubmitError(null);
    setInterpretError(null);
    setIsEditMode(false);
    setEditCaseId("");
  }

  function enterEditMode() {
    if (!activeQuestion) return;
    setIsEditMode(true);
    setRawInput(activeQuestion.text ?? "");
    setEditCaseId(activeQuestion.caseId ?? "");
    setPageState("input");
    setInterpretation(null);
    setSubmitError(null);
    setInterpretError(null);
  }

  const interpretQuestion = useCallback(async () => {
    if (!rawInput.trim()) return;
    setPageState("interpreting");
    setInterpretError(null);

    try {
      const res = await fetch(`${API}/api/ai-interpret-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawInput: rawInput.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Failed to interpret question");
      }

      const data = await res.json();
      setInterpretation(data.interpretation);
      setPageState("confirm");
    } catch (err) {
      console.error("Interpretation failed, using local fallback:", err);
      const fallback = buildLocalFallback(rawInput.trim());
      setInterpretation(fallback);
      setPageState("confirm");
    }
  }, [rawInput]);

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

  function updateInterpretationField(field: string, value: string) {
    if (!interpretation) return;
    setInterpretation({ ...interpretation, [field]: value });
    setEditingField(null);
  }

  async function handleConfirm() {
    if (!interpretation) return;
    setSubmitError(null);
    setPageState("submitting");

    if (isEditMode && editCaseId) {
      const payload = {
        text: interpretation.restatedQuestion || rawInput.trim(),
        caseId: editCaseId,
        timeHorizon: interpretation.timeHorizon || "12 months",
        questionType: interpretation.questionType || "binary",
        entities: interpretation.entities || [],
        subject: interpretation.subject || undefined,
        outcome: interpretation.outcome || undefined,
      };
      updateQuestion(payload);
      navigate("/signals");
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
        interpretedQuestion: interpretation.restatedQuestion || rawInput.trim(),
        createdAt: new Date().toISOString(),
      };
      const caseInput = mapDecisionQuestionToCaseInput(dq);
      const created = await createCaseMutation.mutateAsync({
        data: caseInput as any,
      });
      const newCaseId = (created as any).caseId || (created as any).id;
      if (!newCaseId) {
        setSubmitError("Case was created but returned no identifier.");
        setPageState("confirm");
        return;
      }

      clearCaseState(newCaseId);

      const payload = {
        text: interpretation.restatedQuestion || rawInput.trim(),
        rawInput: rawInput.trim(),
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
      setPageState("confirm");
    }
  }

  const handleImportComplete = async (result: any) => {
    const q = result.question;
    if (!q) return;

    setPageState("submitting");
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

  const interpretationFields = interpretation ? [
    { key: "decisionType", label: "Decision", value: interpretation.decisionType },
    { key: "event", label: "Event", value: interpretation.event },
    { key: "subject", label: "Product / Therapy", value: interpretation.subject },
    { key: "outcome", label: "Outcome", value: interpretation.outcome },
    { key: "timeHorizon", label: "Time Horizon", value: interpretation.timeHorizon },
    { key: "primaryConstraint", label: "Likely Primary Barrier", value: interpretation.primaryConstraint },
  ] : [];

  return (
    <WorkflowLayout
      currentStep="question"
      activeQuestion={activeQuestion}
      onClearQuestion={() => {
        clearQuestion();
        resetAll();
      }}
    >
      <div className="space-y-5 max-w-3xl mx-auto">
        {activeQuestion && pageState === "input" && !isEditMode && (
          <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-blue-200/80">
                Active case: <span className="font-medium text-foreground">{activeQuestion.text}</span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={enterEditMode}
                  className="rounded-lg border border-blue-500/30 px-3 py-1.5 text-xs font-medium text-blue-300 hover:bg-blue-500/10 inline-flex items-center gap-1.5"
                >
                  <PenLine className="w-3 h-3" />
                  Edit this case
                </button>
              </div>
            </div>
          </div>
        )}

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
                New question instead
              </button>
            </div>
          </div>
        )}

        {showImportProject && (
          <>
            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {submitError}
              </div>
            )}
            <ImportProjectDialog
              onImportComplete={handleImportComplete}
              onClose={() => {
                setShowImportProject(false);
                setSubmitError(null);
              }}
            />
          </>
        )}

        {!showImportProject && (pageState === "input" || pageState === "interpreting") && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setShowImportProject(false)}
                className="rounded-xl border-2 border-primary/40 bg-primary/5 px-4 py-3 text-left transition group"
              >
                <div className="flex items-center gap-2.5">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Ask a Question</div>
                    <div className="text-[11px] text-muted-foreground">Type a decision question</div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setShowImportProject(true)}
                className="rounded-xl border border-border hover:border-primary/30 bg-card px-4 py-3 text-left transition group"
              >
                <div className="flex items-center gap-2.5">
                  <Upload className="w-5 h-5 text-muted-foreground group-hover:text-primary transition" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">Import Project</div>
                    <div className="text-[11px] text-muted-foreground">Upload files or paste text</div>
                  </div>
                </div>
              </button>
            </div>

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
                disabled={pageState === "interpreting"}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none disabled:opacity-50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && rawInput.trim()) {
                    e.preventDefault();
                    interpretQuestion();
                  }
                }}
              />

              {interpretError && (
                <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {interpretError}
                </div>
              )}

              {!rawInput.trim() && pageState === "input" && (
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
                  onClick={interpretQuestion}
                  disabled={!rawInput.trim() || pageState === "interpreting"}
                  className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {pageState === "interpreting" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Interpreting...
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
          </div>
        )}

        {(pageState === "confirm" || pageState === "submitting") && interpretation && (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-semibold text-foreground">Here is how we understand your question</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPageState("input");
                  setInterpretation(null);
                }}
                className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted/20 inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3 h-3" />
                Start over
              </button>
            </div>

            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
              <div className="text-sm text-foreground leading-relaxed font-medium">
                {interpretation.restatedQuestion}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {interpretationFields.map((f) => (
                <div
                  key={f.key}
                  onClick={() => setEditingField(f.key)}
                  className="rounded-xl border border-border bg-muted/10 px-3 py-2.5 cursor-pointer transition hover:border-blue-500/30"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {f.label}
                  </div>
                  {editingField === f.key ? (
                    <input
                      autoFocus
                      defaultValue={f.value}
                      onBlur={(e) => updateInterpretationField(f.key, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          updateInterpretationField(f.key, (e.target as HTMLInputElement).value);
                        }
                        if (e.key === "Escape") {
                          setEditingField(null);
                        }
                      }}
                      className="mt-1 w-full bg-transparent text-sm font-medium text-foreground border-b border-blue-400 outline-none"
                    />
                  ) : (
                    <div className="mt-1 text-sm font-medium text-foreground flex items-center gap-1.5">
                      {f.value}
                      <Edit3 className="w-3 h-3 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {interpretation.outcomes.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Possible Outcomes
                </div>
                <div className="flex flex-wrap gap-2">
                  {interpretation.outcomes.map((o, i) => (
                    <span key={i} className="rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm text-foreground">
                      {o}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {interpretation.entities.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Populations / Groups
                </div>
                <div className="flex flex-wrap gap-2">
                  {interpretation.entities.map((e, i) => (
                    <span key={i} className="rounded-lg border border-border bg-muted/10 px-3 py-1.5 text-sm text-foreground">
                      {e}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {submitError && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {submitError}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={pageState === "submitting"}
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pageState === "submitting" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Creating case...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    {isEditMode ? "Update Case" : "Confirm"}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPageState("input");
                  setInterpretation(null);
                }}
                disabled={pageState === "submitting"}
                className="rounded-xl border border-border px-5 py-3 font-semibold text-foreground hover:bg-muted/20 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Edit
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Click any field above to edit it, or press Confirm to proceed.
            </p>
          </div>
        )}
      </div>
    </WorkflowLayout>
  );
}
