import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useListCases, useCreateCase } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  parseQuestion,
  getMissingFields,
  isQuestionComplete,
  buildInterpretedQuestion,
  mapDecisionQuestionToCaseInput,
  QUESTION_TYPE_LABELS,
  FIELD_LABELS,
} from "@/lib/question-definition";
import type { DecisionQuestion } from "@/lib/question-definition";
import {
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Search,
  X,
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

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const { data: cases } = useListCases();
  const createCaseMutation = useCreateCase();

  const isEditing = !!activeQuestion;

  const [rawInput, setRawInput] = useState(activeQuestion?.text ?? "");
  const [caseId, setCaseId] = useState(activeQuestion?.caseId ?? "");
  const [synced, setSynced] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [overrides, setOverrides] = useState<Record<string, string>>({});

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
    return buildInterpretedQuestion(enriched);
  }, [enriched]);

  const currentClarification = useMemo(() => {
    if (missing.length === 0 || !enriched) return null;
    const field = missing[0];
    return {
      field,
      prompt: `Please provide: ${FIELD_LABELS[field] || field}`,
    };
  }, [missing, enriched]);

  function handleOverride(field: string, value: string) {
    setOverrides((prev) => ({ ...prev, [field]: value }));
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
          setSubmitError("Case was created but returned no identifier. Please try again.");
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
                }}
                placeholder="Example: Which regions will adopt first-line ARIKAYCE fastest in 12 months?"
                rows={3}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50 resize-none"
              />
            </div>
          </div>

          {enriched && rawInput.trim() && (
            <InterpretationCard
              enriched={enriched}
              interpretedQuestion={interpretedQuestion}
              missing={missing}
              complete={complete}
              onOverride={handleOverride}
            />
          )}

          {currentClarification && rawInput.trim() && (
            <ClarificationPrompt
              field={currentClarification.field}
              prompt={currentClarification.prompt}
              value={overrides[currentClarification.field] || ""}
              onChange={(val) => handleOverride(currentClarification.field, val)}
            />
          )}

          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <CaseSelector
                cases={(cases as any[]) || []}
                value={caseId}
                onChange={setCaseId}
              />
              {enriched?.questionType !== "timing" && (
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">Time horizon</label>
                  <input
                    value={overrides.timeHorizon || enriched?.timeHorizon || ""}
                    onChange={(e) => handleOverride("timeHorizon", e.target.value)}
                    placeholder="12 months"
                    className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
              )}
            </div>

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
                  : isEditing
                    ? "Update & Continue"
                    : "Create Forecast Case"}
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

const ALL_QUESTION_TYPES: Array<{ value: string; label: string }> = [
  { value: "binary", label: "Yes / No" },
  { value: "comparative", label: "Comparative" },
  { value: "ranking", label: "Ranking" },
  { value: "threshold", label: "Threshold" },
  { value: "timing", label: "Timing" },
];

function InterpretationCard({
  enriched,
  interpretedQuestion,
  missing,
  complete,
  onOverride,
}: {
  enriched: Partial<DecisionQuestion>;
  interpretedQuestion: string;
  missing: string[];
  complete: boolean;
  onOverride: (field: string, value: string) => void;
}) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const qt = enriched.questionType || "binary";
  const entities = enriched.populationOrEntities || [];

  const editableFields: {
    key: string;
    label: string;
    value: string;
    status: "ok" | "missing";
  }[] = [
    {
      key: "subject",
      label: "Subject",
      value: enriched.subject || "",
      status: enriched.subject ? "ok" : missing.includes("subject") ? "missing" : "ok",
    },
    {
      key: "outcome",
      label: "Outcome",
      value: enriched.outcome || "",
      status: enriched.outcome ? "ok" : missing.includes("outcome") ? "missing" : "ok",
    },
    {
      key: "populationOrEntities",
      label: "Groups being evaluated",
      value: entities.join(", ") || "",
      status:
        entities.length > 0 && !missing.includes("populationOrEntities")
          ? "ok"
          : missing.includes("populationOrEntities")
            ? "missing"
            : "ok",
    },
    {
      key: "timeHorizon",
      label: "Time horizon",
      value: enriched.timeHorizon || "",
      status: enriched.timeHorizon ? "ok" : missing.includes("timeHorizon") ? "missing" : "ok",
    },
  ];

  if (enriched.comparator || qt === "comparative") {
    editableFields.push({
      key: "comparator",
      label: "Comparator",
      value: enriched.comparator || "",
      status: enriched.comparator ? "ok" : missing.includes("comparator") ? "missing" : "ok",
    });
  }

  if (enriched.successMetric || qt === "threshold") {
    editableFields.push({
      key: "successMetric",
      label: "Success definition",
      value: enriched.successMetric || "",
      status: enriched.successMetric
        ? "ok"
        : missing.includes("successMetric")
          ? "missing"
          : "ok",
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-foreground">System Interpretation</span>
        </div>
        <span
          className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            complete
              ? "bg-emerald-500/10 text-emerald-400"
              : "bg-amber-500/10 text-amber-400"
          }`}
        >
          {complete ? "Ready" : `${missing.length} missing`}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {ALL_QUESTION_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => onOverride("questionType", t.value)}
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {editableFields.map((f) => (
          <div
            key={f.key}
            onClick={() => setEditingField(f.key)}
            className={`rounded-xl border px-3 py-2.5 cursor-pointer transition hover:border-blue-500/30 ${
              f.status === "missing"
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
                  onOverride(f.key, e.target.value);
                  setEditingField(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onOverride(f.key, (e.target as HTMLInputElement).value);
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
}

function ClarificationPrompt({
  field,
  prompt,
  value,
  onChange,
}: {
  field: string;
  prompt: string;
  value: string;
  onChange: (val: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0 w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
        </div>
        <div className="flex-1 space-y-3">
          <div className="text-sm font-medium text-foreground">{prompt}</div>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={`Enter ${FIELD_LABELS[field] || field}...`}
            className="w-full rounded-xl border border-border bg-background/50 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

function CaseSelector({
  cases,
  value,
  onChange,
}: {
  cases: any[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = cases.find((c) => (c.caseId || c.id) === value);
  const filtered = cases.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.strategicQuestion || "").toLowerCase().includes(q) ||
      (c.assetName || "").toLowerCase().includes(q) ||
      (c.caseId || c.id || "").toLowerCase().includes(q)
    );
  });

  function truncate(s: string, n: number) {
    return s.length > n ? s.slice(0, n) + "…" : s;
  }

  return (
    <div ref={ref} className="relative">
      <label className="mb-2 block text-sm text-muted-foreground">Link to existing case</label>
      <p className="mb-2 text-xs text-muted-foreground/70">
        Optional. Link to a case with existing signals and history.
      </p>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3 text-left text-foreground"
      >
        {selected ? (
          <span className="truncate text-sm">
            {truncate(selected.strategicQuestion || selected.assetName || selected.id, 55)}
          </span>
        ) : (
          <span className="text-muted-foreground/50 text-sm">Select a forecast case...</span>
        )}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-border bg-card shadow-xl">
          <div className="sticky top-0 bg-card border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search cases..."
                autoFocus
                className="w-full rounded-lg border border-border bg-muted/20 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
          {value && (
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); setSearch(""); }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-amber-400 hover:bg-muted/30 border-b border-border"
            >
              <X className="h-3.5 w-3.5" /> Clear selection
            </button>
          )}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">No cases found</div>
          )}
          {filtered.map((c: any) => {
            const cid = c.caseId || c.id;
            return (
              <button
                key={cid}
                type="button"
                onClick={() => { onChange(cid); setOpen(false); setSearch(""); }}
                className={[
                  "flex w-full flex-col gap-0.5 px-4 py-2.5 text-left hover:bg-muted/30 transition",
                  cid === value ? "bg-primary/10" : "",
                ].join(" ")}
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {truncate(c.strategicQuestion || "Untitled", 65)}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {c.assetName || "—"} · {cid}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
