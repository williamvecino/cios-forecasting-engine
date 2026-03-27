import { useState, useEffect, useMemo } from "react";
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
} from "@/lib/question-definition";
import type { DecisionQuestion } from "@/lib/question-definition";
import {
  AlertTriangle,
  Loader2,
  Sparkles,
  ArrowRight,
  Info,
} from "lucide-react";

const EXAMPLE_QUESTIONS = [
  "Will ARIKAYCE gain first-line adoption in 12 months?",
  "Which regions will adopt first-line ARIKAYCE fastest in 12 months?",
  "Will Northeast academic centers adopt faster than Southern community centers in 12 months?",
  "Will first-line adoption exceed 20% in 12 months?",
  "When will commercial payers begin restricting access?",
];

const QUESTION_TYPES = [
  { value: "binary", label: "Yes / No" },
  { value: "comparative", label: "Comparative" },
  { value: "ranking", label: "Ranking" },
  { value: "threshold", label: "Threshold" },
  { value: "timing", label: "Timing" },
];

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const createCaseMutation = useCreateCase();

  const isEditing = !!activeQuestion;

  const draft = typeof window !== "undefined" ? localStorage.getItem("cios.questionDraft") || "" : "";
  const [rawInput, setRawInput] = useState(activeQuestion?.text ?? draft);
  const [caseId, setCaseId] = useState(activeQuestion?.caseId ?? "");
  const [synced, setSynced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [editingField, setEditingField] = useState<string | null>(null);
  const [clarificationValue, setClarificationValue] = useState("");

  useEffect(() => {
    localStorage.removeItem("cios.questionDraft");
  }, []);

  useEffect(() => {
    if (activeQuestion && !synced) {
      setRawInput(activeQuestion.text ?? "");
      setCaseId(activeQuestion.caseId ?? "");
      setSynced(true);
    }
  }, [activeQuestion, synced]);

  const parsed = useMemo(() => {
    if (!rawInput.trim()) return null;
    return parseQuestion(rawInput);
  }, [rawInput]);

  const enriched = useMemo(() => {
    if (!parsed) return null;
    const merged = { ...parsed };
    if (overrides.questionType) merged.questionType = overrides.questionType as any;
    if (overrides.subject) merged.subject = overrides.subject;
    if (overrides.outcome) merged.outcome = overrides.outcome;
    if (overrides.timeHorizon) merged.timeHorizon = overrides.timeHorizon;
    if (overrides.comparator) merged.comparator = overrides.comparator;
    if (overrides.successMetric) merged.successMetric = overrides.successMetric;
    if (overrides.populationOrEntities) {
      merged.populationOrEntities = overrides.populationOrEntities
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return merged;
  }, [parsed, overrides]);

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
      setOverrides((prev) => ({ ...prev, [field]: unique.join(", ") }));
    } else {
      setOverrides((prev) => ({ ...prev, [field]: value }));
    }
    setClarificationValue("");
  }

  async function handleSubmit() {
    if (!rawInput.trim() || submitting || !complete) return;
    setSubmitError(null);

    let resolvedCaseId = caseId.trim();

    if (!resolvedCaseId) {
      setSubmitting(true);
      try {
        const dq: DecisionQuestion = {
          id: `DQ-${Date.now()}`,
          rawInput: rawInput.trim(),
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
        resolvedCaseId = (created as any).caseId || (created as any).id;
        if (!resolvedCaseId) {
          setSubmitError("Case was created but returned no identifier.");
          setSubmitting(false);
          return;
        }
      } catch (err) {
        console.error("Failed to create case:", err);
        setSubmitError("Unable to create a forecast case. Check your connection and try again.");
        setSubmitting(false);
        return;
      }
      setSubmitting(false);
    }

    const payload = {
      text: interpretedQuestion || rawInput.trim(),
      caseId: resolvedCaseId,
      timeHorizon: enriched?.timeHorizon || "12 months",
    };

    if (isEditing) {
      updateQuestion(payload);
    } else {
      createQuestion(payload);
    }

    navigate("/signals");
  }

  const qt = enriched?.questionType || "binary";
  const entities = enriched?.populationOrEntities || [];

  const fields: { key: string; label: string; value: string; isMissing: boolean }[] = enriched
    ? [
        { key: "subject", label: "Evaluating", value: enriched.subject || "", isMissing: missing.includes("subject") },
        { key: "outcome", label: "Outcome", value: enriched.outcome || "", isMissing: missing.includes("outcome") },
        { key: "populationOrEntities", label: "Groups", value: entities.join(", "), isMissing: missing.includes("populationOrEntities") },
        { key: "timeHorizon", label: "Time period", value: enriched.timeHorizon || "", isMissing: missing.includes("timeHorizon") },
        ...(qt === "comparative" || enriched.comparator
          ? [{ key: "comparator", label: "Compared to", value: enriched.comparator || "", isMissing: missing.includes("comparator") }]
          : []),
        ...(qt === "threshold" || enriched.successMetric
          ? [{ key: "successMetric", label: "Success looks like", value: enriched.successMetric || "", isMissing: missing.includes("successMetric") }]
          : []),
      ]
    : [];

  return (
    <WorkflowLayout
      currentStep="question"
      activeQuestion={activeQuestion}
      onClearQuestion={() => {
        clearQuestion();
        setRawInput("");
        setCaseId("");
        setOverrides({});
        setSynced(false);
        setEditingField(null);
        setClarificationValue("");
      }}
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="flex-1 space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 1
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Define the question
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              Turn a rough idea into a forecast-ready decision question.
            </p>

            <div className="mt-6">
              <label className="mb-2 block text-sm text-muted-foreground">
                What are you trying to predict?
              </label>
              <textarea
                value={rawInput}
                onChange={(e) => {
                  setRawInput(e.target.value);
                  setOverrides({});
                  setEditingField(null);
                  setClarificationValue("");
                }}
                placeholder="Example: Which regions will adopt first-line ARIKAYCE fastest in 12 months?"
                rows={3}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none"
              />
            </div>
          </div>

          {enriched && rawInput.trim() && (() => {
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
                      onClick={() => setEditingField(f.key)}
                      className={`rounded-xl border px-3 py-2.5 cursor-pointer transition hover:border-blue-500/30 ${
                        f.isMissing
                          ? "border-amber-500/30 bg-amber-500/5"
                          : "border-border bg-muted/10"
                      }`}
                    >
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {f.label}
                      </div>
                      {editingField === f.key ? (
                        <input
                          autoFocus
                          defaultValue={f.value}
                          onBlur={(e) => {
                            handleOverride(f.key, e.target.value);
                            setEditingField(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              handleOverride(f.key, (e.target as HTMLInputElement).value);
                              setEditingField(null);
                            }
                          }}
                          className="mt-1 w-full bg-transparent text-sm font-medium text-foreground border-b border-blue-400 outline-none"
                        />
                      ) : (
                        <div className="mt-1 text-sm font-medium text-foreground">
                          {f.value || (
                            <span className="text-amber-400 italic text-xs">Click to add</span>
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
                          : (FIELD_LABELS[firstMissing] || firstMissing)}
                      </div>
                      <input
                        value={clarificationValue}
                        onChange={(e) => setClarificationValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && clarificationValue.trim()) {
                            handleOverride(firstMissing, clarificationValue.trim());
                          }
                        }}
                        placeholder={firstMissing === "subject" ? "e.g. ARIKAYCE, new therapy, competitor launch" :
                          firstMissing === "outcome" ? "e.g. first-line adoption, market share gain" :
                          firstMissing === "populationOrEntities" ? "e.g. Northeast centers, community physicians" :
                          firstMissing === "timeHorizon" ? "e.g. 12 months, 6 months" :
                          firstMissing === "comparator" ? "e.g. standard of care, competitor drug" :
                          firstMissing === "successMetric" ? "e.g. 20% adoption rate" :
                          "Type your answer..."}
                        className="w-full rounded-lg border border-border bg-background/50 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
                        autoFocus
                      />
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
                disabled={!rawInput.trim() || !complete || submitting}
                className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                {submitting
                  ? "Creating case..."
                  : "Continue"}
                {!submitting && <ArrowRight className="w-4 h-4" />}
              </button>
              {!complete && rawInput.trim() && (
                <span className="text-xs text-amber-400 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  {missing.length} field{missing.length !== 1 ? "s" : ""} still needed
                </span>
              )}
            </div>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-[280px]">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-blue-400" />
              <div className="text-sm font-semibold text-foreground">Try These</div>
            </div>
            <div className="space-y-2">
              {EXAMPLE_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => {
                    setRawInput(q);
                    setOverrides({});
                    setEditingField(null);
                    setClarificationValue("");
                  }}
                  className="w-full rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2.5 text-left text-xs text-foreground/80 hover:bg-blue-500/10 hover:border-blue-500/30 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </WorkflowLayout>
  );
}

