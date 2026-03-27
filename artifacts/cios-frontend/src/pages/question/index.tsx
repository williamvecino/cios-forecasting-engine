import { useState, useEffect, useMemo, useReducer } from "react";
import { useLocation } from "wouter";
import { useCreateCase } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  parseQuestion,
  getMissingFields,
  isQuestionComplete,
  buildInterpretedQuestion,
  mapDecisionQuestionToCaseInput,
  FIELD_LABELS,
  createEmptyDraft,
} from "@/lib/question-definition";
import type { DecisionQuestion, DraftQuestion } from "@/lib/question-definition";
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
  Info,
  PenLine,
  Plus,
} from "lucide-react";

const EXAMPLE_QUESTIONS = [
  "Will ARIKAYCE achieve target specialist adoption (≥4 Rx/quarter) among pulmonologists within 12 months?",
  "Will CardioAsset X displace entrenched beta-blocker combinations in target cardiologist accounts over 18 months?",
  "Will tumor-board adoption of OncoDevice Y reach threshold in academic oncology centers within 24 months?",
  "Will non-stimulant ADHD therapy gain community pediatrics adoption within 12 months given stimulant supply constraints?",
  "Will adjunctive MDD therapy expand from psychiatry into primary care prescribing within 18 months?",
  "Will anti-amyloid biologic adoption reach memory clinic threshold despite REMS infusion site requirements within 24 months?",
];

const QUESTION_TYPES = [
  { value: "binary", label: "Yes / No" },
  { value: "comparative", label: "Comparative" },
  { value: "ranking", label: "Ranking" },
  { value: "threshold", label: "Threshold" },
  { value: "timing", label: "Timing" },
];

type DraftAction =
  | { type: "SET_RAW_INPUT"; value: string }
  | { type: "SET_OVERRIDE"; field: string; value: string }
  | { type: "SET_EDITING_FIELD"; field: string | null }
  | { type: "SET_CLARIFICATION"; value: string }
  | { type: "RESET" }
  | { type: "LOAD_FROM_CASE"; rawInput: string };

function draftReducer(state: DraftQuestion, action: DraftAction): DraftQuestion {
  switch (action.type) {
    case "SET_RAW_INPUT":
      return { ...state, rawInput: action.value };
    case "SET_OVERRIDE":
      return {
        ...state,
        overrides: { ...state.overrides, [action.field]: action.value },
        clarificationValue: "",
      };
    case "SET_EDITING_FIELD":
      return { ...state, editingField: action.field };
    case "SET_CLARIFICATION":
      return { ...state, clarificationValue: action.value };
    case "RESET":
      return createEmptyDraft();
    case "LOAD_FROM_CASE":
      return { ...createEmptyDraft(), rawInput: action.rawInput };
    default:
      return state;
  }
}

type PageMode = "new_draft" | "edit_existing";

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const createCaseMutation = useCreateCase();

  const [draft, dispatch] = useReducer(draftReducer, undefined, createEmptyDraft);
  const [mode, setMode] = useState<PageMode>("new_draft");
  const [editCaseId, setEditCaseId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    localStorage.removeItem("cios.questionDraft");
  }, []);

  function resetDraft() {
    dispatch({ type: "RESET" });
    setEditCaseId("");
    setSubmitError(null);
    setMode("new_draft");
  }

  function enterEditMode() {
    if (!activeQuestion) return;
    setMode("edit_existing");
    dispatch({ type: "LOAD_FROM_CASE", rawInput: activeQuestion.text ?? "" });
    setEditCaseId(activeQuestion.caseId ?? "");
    setSubmitError(null);
  }

  const parsed = useMemo(() => {
    if (!draft.rawInput.trim()) return null;
    return parseQuestion(draft.rawInput);
  }, [draft.rawInput]);

  const enriched = useMemo(() => {
    if (!parsed) return null;
    const merged = { ...parsed };
    if (draft.overrides.questionType) merged.questionType = draft.overrides.questionType as any;
    if (draft.overrides.subject) merged.subject = draft.overrides.subject;
    if (draft.overrides.outcome) merged.outcome = draft.overrides.outcome;
    if (draft.overrides.timeHorizon) merged.timeHorizon = draft.overrides.timeHorizon;
    if (draft.overrides.comparator) merged.comparator = draft.overrides.comparator;
    if (draft.overrides.successMetric) merged.successMetric = draft.overrides.successMetric;
    if (draft.overrides.populationOrEntities) {
      merged.populationOrEntities = draft.overrides.populationOrEntities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return merged;
  }, [parsed, draft.overrides]);

  const missing = useMemo(() => {
    if (!enriched) return [];
    return getMissingFields(enriched);
  }, [enriched]);

  const complete = useMemo(() => {
    if (!enriched) return false;
    return isQuestionComplete(enriched);
  }, [enriched]);

  const interpretedQuestion = useMemo(() => {
    if (!enriched) return "";
    return buildInterpretedQuestion(enriched as DecisionQuestion);
  }, [enriched]);

  const firstMissing = missing.length > 0 ? missing[0] : null;

  function handleOverride(field: string, value: string) {
    if (field === "populationOrEntities") {
      const existing = enriched?.populationOrEntities || [];
      const newEntities = value.split(",").map((s) => s.trim()).filter(Boolean);
      const merged = [...existing, ...newEntities];
      const unique = [...new Set(merged.map((e) => e.toLowerCase()))].map(
        (lower) => merged.find((e) => e.toLowerCase() === lower) || lower
      );
      dispatch({ type: "SET_OVERRIDE", field, value: unique.join(", ") });
    } else {
      dispatch({ type: "SET_OVERRIDE", field, value });
    }
  }

  async function handleSubmit() {
    if (!draft.rawInput.trim() || submitting || !complete) return;
    setSubmitError(null);

    if (mode === "edit_existing" && editCaseId) {
      const payload = {
        text: interpretedQuestion || draft.rawInput.trim(),
        caseId: editCaseId,
        timeHorizon: enriched?.timeHorizon || "12 months",
        questionType: enriched?.questionType || "binary",
        entities: enriched?.populationOrEntities || [],
        subject: enriched?.subject || undefined,
        outcome: enriched?.outcome || undefined,
      };
      updateQuestion(payload);
      navigate("/signals");
      return;
    }

    setSubmitting(true);
    try {
      const dq: DecisionQuestion = {
        id: `DQ-${Date.now()}`,
        rawInput: draft.rawInput.trim(),
        questionType: enriched?.questionType || "binary",
        subject: enriched?.subject || "",
        outcome: enriched?.outcome || "",
        populationOrEntities: enriched?.populationOrEntities || [],
        comparator: enriched?.comparator,
        timeHorizon: enriched?.timeHorizon || "12 months",
        successMetric: enriched?.successMetric,
        missingFields: [],
        isComplete: true,
        interpretedQuestion,
        createdAt: new Date().toISOString(),
      };
      const caseInput = mapDecisionQuestionToCaseInput(dq);
      const created = await createCaseMutation.mutateAsync({
        data: caseInput as any,
      });
      const newCaseId = (created as any).caseId || (created as any).id;
      if (!newCaseId) {
        setSubmitError("Case was created but returned no identifier.");
        setSubmitting(false);
        return;
      }

      const payload = {
        text: interpretedQuestion || draft.rawInput.trim(),
        rawInput: draft.rawInput.trim(),
        caseId: newCaseId,
        timeHorizon: enriched?.timeHorizon || "12 months",
        questionType: enriched?.questionType || "binary",
        entities: enriched?.populationOrEntities || [],
        subject: enriched?.subject || undefined,
        outcome: enriched?.outcome || undefined,
      };
      createQuestion(payload);
      navigate("/signals");
    } catch (err) {
      console.error("Failed to create case:", err);
      setSubmitError("Unable to create a forecast case. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const qt = enriched?.questionType || "binary";
  const entities = enriched?.populationOrEntities || [];

  const fields: { key: string; label: string; value: string; isMissing: boolean }[] = enriched
    ? [
        { key: "subject", label: "Evaluating", value: enriched.subject || "", isMissing: missing.includes("subject") },
        { key: "outcome", label: "Outcome", value: enriched.outcome || "", isMissing: missing.includes("outcome") },
        ...((qt === "comparative" || qt === "ranking" || entities.length > 0)
          ? [{ key: "populationOrEntities", label: "Groups", value: entities.join(", "), isMissing: missing.includes("populationOrEntities") }]
          : []),
        { key: "timeHorizon", label: "Time period", value: enriched.timeHorizon || "", isMissing: missing.includes("timeHorizon") },
        ...(enriched.comparator
          ? [{ key: "comparator", label: "Compared to", value: enriched.comparator, isMissing: false }]
          : []),
        ...(enriched.successMetric
          ? [{ key: "successMetric", label: "Success metric", value: enriched.successMetric, isMissing: false }]
          : []),
      ]
    : [];

  return (
    <WorkflowLayout
      currentStep="question"
      activeQuestion={activeQuestion}
      onClearQuestion={() => {
        clearQuestion();
        resetDraft();
      }}
    >
      <div className="space-y-5 max-w-3xl mx-auto">
        <section className="space-y-5">
          {activeQuestion && mode === "new_draft" && (
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

          {mode === "edit_existing" && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm text-amber-200/80">
                  Editing existing case — changes will update the current case.
                </div>
                <button
                  type="button"
                  onClick={resetDraft}
                  className="rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-500/10 inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3 h-3" />
                  New question instead
                </button>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <label className="mb-3 block text-sm font-medium text-foreground">
              What are you trying to predict?
            </label>
            <textarea
              value={draft.rawInput}
              onChange={(e) => {
                dispatch({ type: "SET_RAW_INPUT", value: e.target.value });
              }}
              placeholder="Example: Which regions will adopt first-line ARIKAYCE fastest in 12 months?"
              rows={3}
              autoFocus
              className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none"
            />

            {!draft.rawInput.trim() && (
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
                      onClick={() => {
                        setMode("new_draft");
                        dispatch({ type: "SET_RAW_INPUT", value: q });
                        setEditCaseId("");
                      }}
                      className="rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-left text-xs text-foreground/80 hover:bg-blue-500/10 hover:border-blue-500/30 transition"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {enriched && draft.rawInput.trim() && (() => {
            const totalFields = fields.length;
            const filledFields = fields.filter((f) => !f.isMissing).length;
            const pct = totalFields > 0 ? Math.round((filledFields / totalFields) * 100) : 0;
            return (
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    <span className="text-sm font-semibold text-foreground">System Interpretation</span>
                  </div>
                  <span className={`text-xs font-semibold ${complete ? "text-emerald-400" : "text-muted-foreground"}`}>
                    {complete ? "Ready" : `${pct}%`}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="h-2 w-full rounded-full bg-muted/30 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        complete ? "bg-emerald-500" : "bg-primary"
                      }`}
                      style={{ width: `${complete ? 100 : pct}%` }}
                    />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {complete
                      ? "All fields complete — ready to continue"
                      : `${filledFields} of ${totalFields} fields complete`}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Question type
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUESTION_TYPES.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => handleOverride("questionType", t.value)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        qt === t.value
                          ? "bg-blue-500/20 text-blue-300 border border-blue-500/40"
                          : "bg-muted/20 text-muted-foreground border border-transparent hover:bg-muted/40"
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  What the system understands
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {fields.map((f) => (
                    <div
                      key={f.key}
                      onClick={() => dispatch({ type: "SET_EDITING_FIELD", field: f.key })}
                      className={`rounded-xl border px-3 py-2.5 cursor-pointer transition hover:border-blue-500/30 ${
                        f.isMissing
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-border bg-muted/10"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </div>
                      {draft.editingField === f.key ? (
                        <input
                          autoFocus
                          defaultValue={f.value}
                          onBlur={(e) => {
                            handleOverride(f.key, e.target.value);
                            dispatch({ type: "SET_EDITING_FIELD", field: null });
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleOverride(f.key, (e.target as HTMLInputElement).value);
                              dispatch({ type: "SET_EDITING_FIELD", field: null });
                            }
                          }}
                          className="mt-1 w-full bg-transparent text-sm font-medium text-foreground border-b border-blue-400 outline-none"
                        />
                      ) : (
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {f.value || (
                            <span className="text-amber-400 italic text-xs">
                              {f.key === "subject" ? "e.g. ARIKAYCE" :
                               f.key === "outcome" ? "e.g. adoption" :
                               f.key === "populationOrEntities" ? "e.g. derms, GPs" :
                               f.key === "timeHorizon" ? "e.g. 12 months" :
                               f.key === "comparator" ? "e.g. competitor" :
                               f.key === "successMetric" ? "e.g. 20%" :
                               "Click to add"}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {firstMissing && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    </div>
                    <div className="flex-1 space-y-2">
                      <div className="text-sm font-medium text-foreground">
                        {firstMissing === "populationOrEntities" && entities.length > 0
                          ? `Add at least one more group to compare (have: ${entities.join(", ")})`
                          : firstMissing === "populationOrEntities"
                            ? "Which groups or populations are we comparing?"
                          : (FIELD_LABELS[firstMissing] || firstMissing)}
                      </div>
                      <div className="flex gap-2">
                        <input
                          value={draft.clarificationValue}
                          onChange={(e) => dispatch({ type: "SET_CLARIFICATION", value: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && draft.clarificationValue.trim()) {
                              handleOverride(firstMissing, draft.clarificationValue.trim());
                            }
                          }}
                          placeholder={firstMissing === "subject" ? "e.g. ARIKAYCE, new therapy, competitor launch" :
                            firstMissing === "outcome" ? "e.g. first-line adoption, market share gain" :
                            firstMissing === "populationOrEntities" ? "e.g. Northeast centers, community physicians" :
                            firstMissing === "timeHorizon" ? "e.g. 12 months, 6 months" :
                            firstMissing === "comparator" ? "e.g. standard of care, competitor drug" :
                            firstMissing === "successMetric" ? "e.g. 20% adoption rate" :
                            "Type your answer..."}
                          className="flex-1 rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (draft.clarificationValue.trim()) {
                              handleOverride(firstMissing, draft.clarificationValue.trim());
                            }
                          }}
                          disabled={!draft.clarificationValue.trim()}
                          className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {interpretedQuestion && (
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                  <div className="text-[10px] uppercase tracking-wider text-blue-400 mb-1">
                    Interpreted question
                  </div>
                  <div className="text-sm text-foreground leading-relaxed">
                    {interpretedQuestion}
                  </div>
                </div>
              )}
            </div>
            );
          })()}

          <div className="rounded-2xl border border-border bg-card p-6">
            {submitError && (
              <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {submitError}
              </div>
            )}

            <div className="mt-5 flex items-center gap-3">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!draft.rawInput.trim() || !complete || submitting}
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting
                  ? "Creating case..."
                  : mode === "edit_existing" ? "Update Case" : "Continue"}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
              {!complete && draft.rawInput.trim() && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {missing.length} field{missing.length !== 1 ? "s" : ""} still needed
                </span>
              )}
            </div>
          </div>
        </section>
      </div>
    </WorkflowLayout>
  );
}
