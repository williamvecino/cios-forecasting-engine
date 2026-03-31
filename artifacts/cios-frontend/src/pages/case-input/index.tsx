import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  Lock,
  Unlock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const DECISION_DOMAINS = ["Regulatory", "Commercial", "Adoption", "Competitive", "Operational"] as const;
const TIME_HORIZONS = ["3 months", "6 months", "12 months", "24 months"] as const;
const GEOGRAPHIES = ["US", "EU", "Global"] as const;

const SIGNAL_TYPE_MAP: Record<string, string> = {
  Clinical: "Phase III clinical",
  Regulatory: "Regulatory / clinical",
  Commercial: "Access / commercial",
  Operational: "Operational friction",
  Behavioral: "Field intelligence",
  Market: "Market adoption / utilization",
};

const SIGNAL_TYPES_DISPLAY = ["Clinical", "Regulatory", "Commercial", "Operational", "Behavioral", "Market"] as const;
const DIRECTIONS = ["Positive", "Negative", "Neutral"] as const;
const PRIORITIES = ["High", "Medium", "Low"] as const;

interface SignalEntry {
  id: string;
  description: string;
  signalType: string;
  direction: string;
  strength: number;
  reliability: number;
  source: string;
  rootEvidenceId: string;
}

interface DeferredQuestion {
  id: string;
  question: string;
  trigger: string;
  priority: string;
}

function emptySignal(): SignalEntry {
  return {
    id: crypto.randomUUID(),
    description: "",
    signalType: "Clinical",
    direction: "Positive",
    strength: 3,
    reliability: 3,
    source: "",
    rootEvidenceId: "",
  };
}

function emptyDeferredQuestion(): DeferredQuestion {
  return {
    id: crypto.randomUUID(),
    question: "",
    trigger: "",
    priority: "Medium",
  };
}

export default function CaseInputPage() {
  const [, navigate] = useLocation();
  const { createQuestion } = useActiveQuestion();

  const [caseName, setCaseName] = useState("");
  const [scenarioName, setScenarioName] = useState("Baseline");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [geography, setGeography] = useState<string>("US");
  const [timeHorizon, setTimeHorizon] = useState<string>("12 months");
  const [decisionDomain, setDecisionDomain] = useState<string>("Commercial");
  const [actors, setActors] = useState("");

  const [baselineProbability, setBaselineProbability] = useState(50);
  const [baselineReason, setBaselineReason] = useState("");

  const [signals, setSignals] = useState<SignalEntry[]>([emptySignal()]);
  const [lockStatus, setLockStatus] = useState(false);

  const [deferredQuestions, setDeferredQuestions] = useState<DeferredQuestion[]>([]);
  const [expectedOutcomeDate, setExpectedOutcomeDate] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDeferred, setShowDeferred] = useState(false);

  const questionText = `Will ${actor || "[actor]"} ${action || "[action]"} in ${geography} within ${timeHorizon}?`;

  const addSignal = useCallback(() => {
    setSignals(prev => [...prev, emptySignal()]);
  }, []);

  const removeSignal = useCallback((id: string) => {
    setSignals(prev => prev.length > 1 ? prev.filter(s => s.id !== id) : prev);
  }, []);

  const updateSignal = useCallback((id: string, field: keyof SignalEntry, value: any) => {
    setSignals(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  }, []);

  const addDeferredQuestion = useCallback(() => {
    setDeferredQuestions(prev => [...prev, emptyDeferredQuestion()]);
    setShowDeferred(true);
  }, []);

  const removeDeferredQuestion = useCallback((id: string) => {
    setDeferredQuestions(prev => prev.filter(q => q.id !== id));
  }, []);

  const updateDeferredQuestion = useCallback((id: string, field: keyof DeferredQuestion, value: string) => {
    setDeferredQuestions(prev => prev.map(q => q.id === id ? { ...q, [field]: value } : q));
  }, []);

  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);

  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      try {
        const draft = JSON.stringify({
          caseName, scenarioName, actor, action, geography, timeHorizon,
          decisionDomain, actors, baselineProbability, baselineReason,
          signals, lockStatus, deferredQuestions, expectedOutcomeDate,
        });
        localStorage.setItem("cios.caseInputDraft", draft);
      } catch {}
    }, 400);
    return () => { if (autosaveTimer.current) clearTimeout(autosaveTimer.current); };
  }, [caseName, scenarioName, actor, action, geography, timeHorizon, decisionDomain, actors, baselineProbability, baselineReason, signals, lockStatus, deferredQuestions, expectedOutcomeDate]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("cios.caseInputDraft");
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.caseName) setCaseName(d.caseName);
      if (d.scenarioName) setScenarioName(d.scenarioName);
      if (d.actor) setActor(d.actor);
      if (d.action) setAction(d.action);
      if (d.geography) setGeography(d.geography);
      if (d.timeHorizon) setTimeHorizon(d.timeHorizon);
      if (d.decisionDomain) setDecisionDomain(d.decisionDomain);
      if (d.actors) setActors(d.actors);
      if (d.baselineProbability != null) setBaselineProbability(d.baselineProbability);
      if (d.baselineReason) setBaselineReason(d.baselineReason);
      if (d.signals?.length) setSignals(d.signals);
      if (d.lockStatus != null) setLockStatus(d.lockStatus);
      if (d.deferredQuestions?.length) setDeferredQuestions(d.deferredQuestions);
      if (d.expectedOutcomeDate) setExpectedOutcomeDate(d.expectedOutcomeDate);
    } catch {}
  }, []);

  function validateForm(): string | null {
    if (!scenarioName.trim()) return "Scenario Name is required.";
    if (!actor.trim()) return "Actor is required to form the primary question.";
    if (!action.trim()) return "Specific Action is required to form the primary question.";
    return null;
  }

  async function handleSubmit() {
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    setDuplicateWarnings([]);

    try {
      const caseId = `CASE-${Date.now()}`;

      const caseRes = await fetch(`${API}/api/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          assetName: caseName || actor,
          strategicQuestion: questionText,
          outcomeDefinition: action,
          geography,
          timeHorizon,
          priorProbability: baselineProbability / 100,
          targetType: decisionDomain.toLowerCase(),
        }),
      });

      if (!caseRes.ok) {
        throw new Error(`Failed to create case: ${caseRes.statusText}`);
      }

      const validSignals = signals.filter(s => s.description.trim());
      const dupeWarnings: string[] = [];
      if (validSignals.length > 0) {
        for (const sig of validSignals) {
          const sigRes = await fetch(`${API}/api/cases/${caseId}/signals`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              signalDescription: sig.description,
              signalType: SIGNAL_TYPE_MAP[sig.signalType] || sig.signalType,
              direction: sig.direction,
              strengthScore: sig.strength,
              reliabilityScore: sig.reliability,
              sourceLabel: sig.source || undefined,
              rootEvidenceId: sig.rootEvidenceId || undefined,
              scope: "national",
              timing: "current",
              status: lockStatus ? "active" : "candidate",
            }),
          });

          if (sigRes.status === 409) {
            const dupData = await sigRes.json();
            dupeWarnings.push(`Signal "${sig.description.slice(0, 60)}..." rejected: ${dupData.message || "Duplicate detected"}`);
          } else if (!sigRes.ok) {
            const errData = await sigRes.json().catch(() => ({}));
            dupeWarnings.push(`Signal "${sig.description.slice(0, 60)}..." failed: ${errData.error || sigRes.statusText}`);
          }
        }
      }

      if (dupeWarnings.length > 0) {
        setDuplicateWarnings(dupeWarnings);
      }

      try {
        localStorage.setItem(`cios.scenarioName:${caseId}`, scenarioName.trim());
        localStorage.setItem(`cios.signalsLocked:${caseId}`, lockStatus ? "true" : "false");
        localStorage.setItem(`cios.baselineReason:${caseId}`, baselineReason.trim());
        if (expectedOutcomeDate) {
          localStorage.setItem(`cios.expectedOutcomeDate:${caseId}`, expectedOutcomeDate);
        }
      } catch {}

      const validDeferred = deferredQuestions.filter(q => q.question.trim());
      if (validDeferred.length > 0) {
        const questions = [
          {
            questionText,
            questionRole: "primary",
            questionType: "strategic",
            timeHorizon,
          },
          ...validDeferred.map((dq, i) => ({
            questionText: dq.question,
            questionRole: "secondary",
            questionType: "strategic",
            priorityRank: i + 1,
            source: dq.trigger || "user",
          })),
        ];

        await fetch(`${API}/api/cases/${caseId}/question-repository`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ questions }),
        });
      }

      createQuestion({
        text: questionText,
        rawInput: questionText,
        caseId,
        timeHorizon,
        subject: actor,
        outcome: action,
      });

      try { localStorage.removeItem("cios.caseInputDraft"); } catch {}

      navigate("/signals");
    } catch (err: any) {
      setError(err.message || "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Structured Case Input</h1>
          </div>
          <button
            type="button"
            onClick={() => navigate("/question")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Question
          </button>
        </div>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Case Identity</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Case Name</label>
              <input
                value={caseName}
                onChange={e => setCaseName(e.target.value)}
                placeholder="Short descriptive label"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Scenario Name <span className="text-red-400">*</span></label>
              <input
                value={scenarioName}
                onChange={e => setScenarioName(e.target.value)}
                placeholder="Baseline / Delay / Fast Adoption"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Primary Question</h2>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
            <p className="text-sm font-medium text-foreground">{questionText}</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Actor <span className="text-red-400">*</span></label>
              <input
                value={actor}
                onChange={e => setActor(e.target.value)}
                placeholder="Who is making the decision"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Specific Action <span className="text-red-400">*</span></label>
              <input
                value={action}
                onChange={e => setAction(e.target.value)}
                placeholder="What specific action"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Decision Domain</label>
              <select
                value={decisionDomain}
                onChange={e => setDecisionDomain(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {DECISION_DOMAINS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Time Horizon</label>
              <select
                value={timeHorizon}
                onChange={e => setTimeHorizon(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {TIME_HORIZONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Geography</label>
              <select
                value={geography}
                onChange={e => setGeography(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              >
                {GEOGRAPHIES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Key Actors / Decision-Makers</label>
            <input
              value={actors}
              onChange={e => setActors(e.target.value)}
              placeholder="e.g. FDA, Payer advisory committees, Community oncologists"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Baseline Probability</h2>

          <div className="grid grid-cols-[160px_1fr] gap-4 items-start">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Probability</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={baselineProbability}
                  onChange={e => setBaselineProbability(Math.max(1, Math.min(99, Number(e.target.value))))}
                  className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-center tabular-nums font-semibold"
                />
                <span className="text-sm font-semibold text-muted-foreground">%</span>
              </div>
              <div className="w-full bg-muted/20 rounded-full h-2 mt-2">
                <div
                  className="h-2 rounded-full bg-primary transition-all"
                  style={{ width: `${baselineProbability}%` }}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Baseline Reason</label>
              <textarea
                value={baselineReason}
                onChange={e => setBaselineReason(e.target.value)}
                placeholder="Short factual justification for this starting probability"
                rows={2}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
              />
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Signals ({signals.length})
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setLockStatus(!lockStatus)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  lockStatus
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {lockStatus ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                {lockStatus ? "Signals Locked" : "Signals Open"}
              </button>
              <button
                type="button"
                onClick={addSignal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition"
              >
                <Plus className="w-3 h-3" />
                Add Signal
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {signals.map((sig, idx) => (
              <div key={sig.id} className="rounded-xl border border-border/50 bg-background/50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                    Signal {idx + 1}
                  </span>
                  {signals.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSignal(sig.id)}
                      className="text-muted-foreground hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Description</label>
                  <textarea
                    value={sig.description}
                    onChange={e => updateSignal(sig.id, "description", e.target.value)}
                    placeholder="Single factual event or observation"
                    rows={2}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
                  />
                </div>

                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Type</label>
                    <select
                      value={sig.signalType}
                      onChange={e => updateSignal(sig.id, "signalType", e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {SIGNAL_TYPES_DISPLAY.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Direction</label>
                    <select
                      value={sig.direction}
                      onChange={e => updateSignal(sig.id, "direction", e.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    >
                      {DIRECTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Strength (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={sig.strength}
                      onChange={e => updateSignal(sig.id, "strength", Math.max(1, Math.min(5, Number(e.target.value))))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-center"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Reliability (1–5)</label>
                    <input
                      type="number"
                      min={1}
                      max={5}
                      value={sig.reliability}
                      onChange={e => updateSignal(sig.id, "reliability", Math.max(1, Math.min(5, Number(e.target.value))))}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-center"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Source</label>
                    <input
                      value={sig.source}
                      onChange={e => updateSignal(sig.id, "source", e.target.value)}
                      placeholder="Specific data source"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Root Evidence ID</label>
                    <input
                      value={sig.rootEvidenceId}
                      onChange={e => updateSignal(sig.id, "rootEvidenceId", e.target.value)}
                      placeholder="Optional — linked evidence"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowDeferred(!showDeferred)}
              className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition"
            >
              {showDeferred ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              Deferred Questions ({deferredQuestions.length})
            </button>
            <button
              type="button"
              onClick={addDeferredQuestion}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition"
            >
              <Plus className="w-3 h-3" />
              Add Question
            </button>
          </div>

          {showDeferred && deferredQuestions.length > 0 && (
            <div className="space-y-3">
              {deferredQuestions.map((dq, idx) => (
                <div key={dq.id} className="rounded-xl border border-border/50 bg-background/50 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                      Deferred Question {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeDeferredQuestion(dq.id)}
                      className="text-muted-foreground hover:text-red-400 transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">Question</label>
                    <input
                      value={dq.question}
                      onChange={e => updateDeferredQuestion(dq.id, "question", e.target.value)}
                      placeholder="Secondary question to investigate"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_140px] gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Trigger</label>
                      <input
                        value={dq.trigger}
                        onChange={e => updateDeferredQuestion(dq.id, "trigger", e.target.value)}
                        placeholder="What created this question"
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-muted-foreground">Priority</label>
                      <select
                        value={dq.priority}
                        onChange={e => updateDeferredQuestion(dq.id, "priority", e.target.value)}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                      >
                        {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-6 space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Expected Outcome Date</h2>
          <input
            type="month"
            value={expectedOutcomeDate}
            onChange={e => setExpectedOutcomeDate(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
        </section>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-sm text-red-300">{error}</p>
          </div>
        )}

        {duplicateWarnings.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-sm font-medium text-amber-300">Duplicate Signals Detected</span>
            </div>
            {duplicateWarnings.map((w, i) => (
              <p key={i} className="text-xs text-amber-200/70 pl-6">{w}</p>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 pb-8">
          <button
            type="button"
            onClick={() => navigate("/question")}
            className="inline-flex items-center gap-2 rounded-xl border border-border px-5 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !actor.trim() || !action.trim() || !scenarioName.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            {submitting ? "Creating Case..." : "Create Case & Continue"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
