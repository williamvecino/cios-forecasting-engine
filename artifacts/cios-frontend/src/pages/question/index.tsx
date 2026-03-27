import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useListCases } from "@workspace/api-client-react";
import WorkflowLayout from "@/components/workflow-layout";
import { useActiveQuestion } from "@/hooks/use-active-question";
import { CheckCircle2, AlertTriangle, ChevronDown, Search, X } from "lucide-react";

const STRONG_EXAMPLES = [
  "Will adoption increase after indication expansion within 12 months?",
  "Which segment is most likely to adopt first after launch?",
  "Will payer restrictions delay uptake in the first year?",
  "Will guideline endorsement shift prescribing behavior?",
  "Will competitor entry materially reduce share within 6 months?",
];

const WEAK_EXAMPLES = [
  "What will happen with this product?",
  "Is this launch going to be successful?",
  "What do doctors think?",
  "How will the market react?",
  "Will this work?",
];

export default function QuestionPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, createQuestion, updateQuestion, clearQuestion } = useActiveQuestion();
  const { data: cases } = useListCases();

  const isEditing = !!activeQuestion;

  const [questionText, setQuestionText] = useState(activeQuestion?.text ?? "");
  const [caseId, setCaseId] = useState(activeQuestion?.caseId ?? "");
  const [timeHorizon, setTimeHorizon] = useState(
    activeQuestion?.timeHorizon ?? "12 months"
  );
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (activeQuestion && !synced) {
      setQuestionText(activeQuestion.text ?? "");
      setCaseId(activeQuestion.caseId ?? "");
      setTimeHorizon(activeQuestion.timeHorizon ?? "12 months");
      setSynced(true);
    }
  }, [activeQuestion, synced]);

  function handleSubmit() {
    const text = questionText.trim();
    if (!text) return;

    const payload = {
      text,
      caseId: caseId.trim() || undefined,
      timeHorizon: timeHorizon.trim() || undefined,
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
      onClearQuestion={clearQuestion}
    >
      <div className="flex flex-col gap-6 lg:flex-row">
        <section className="flex-1 rounded-2xl border border-border bg-card p-6">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Step 1
          </div>
          <h1 className="mt-2 text-2xl font-semibold text-foreground">
            What are you trying to predict?
          </h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Start with one strategic question. Everything else in the system should
            inherit this context.
          </p>

          <div className="mt-6 space-y-5">
            <Field
              label="Strategic question"
              value={questionText}
              onChange={setQuestionText}
              placeholder="Will adoption increase after indication expansion?"
              multiline
            />

            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <CaseSelector
                cases={(cases as any[]) || []}
                value={caseId}
                onChange={setCaseId}
              />
              <Field
                label="Time horizon"
                value={timeHorizon}
                onChange={setTimeHorizon}
                placeholder="12 months"
              />
            </div>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={!questionText.trim()}
              className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isEditing ? "Update & Continue" : "Continue to Add Information"}
            </button>
          </div>
        </section>

        <aside className="w-full shrink-0 space-y-4 lg:w-[300px]">
          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <div className="text-sm font-semibold text-foreground">
                Strong Strategic Questions
              </div>
            </div>
            <div className="space-y-2">
              {STRONG_EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setQuestionText(q)}
                  className="w-full rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-left text-xs text-foreground/80 hover:bg-emerald-500/10 hover:border-emerald-500/30 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <div className="text-sm font-semibold text-foreground">
                Avoid These Questions
              </div>
            </div>
            <div className="space-y-2">
              {WEAK_EXAMPLES.map((q) => (
                <div
                  key={q}
                  className="rounded-lg border border-amber-500/15 bg-amber-500/5 px-3 py-2.5 text-xs text-muted-foreground"
                >
                  {q}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </WorkflowLayout>
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
      <label className="mb-2 block text-sm text-muted-foreground">Link to Case</label>
      <p className="mb-2 text-xs text-muted-foreground/70">
        Cases hold the signal history, prior probability, and actor model. Linking
        your question to a case tells the engine which evidence base to forecast against.
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm text-muted-foreground">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={4}
          className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-foreground placeholder:text-muted-foreground/50"
        />
      )}
    </div>
  );
}
