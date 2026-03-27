import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  Plus,
  Sparkles,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  FlaskConical,
  Shield,
  Swords,
  BookOpen,
  Clock,
  Users,
  Pencil,
  Trash2,
  Zap,
  Radio,
  BrainCircuit,
  ChevronDown,
  ChevronUp,
  GitCompareArrows,
  Activity,
  Briefcase,
  Brain,
  Stethoscope,
} from "lucide-react";

type Direction = "positive" | "negative" | "neutral";
type Strength = "High" | "Medium" | "Low";
type Reliability = "Confirmed" | "Probable" | "Speculative";
type Impact = "High" | "Medium" | "Low";
type Category = "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";

interface Signal {
  id: string;
  text: string;
  caveat: string;
  direction: Direction;
  strength: Strength;
  reliability: Reliability;
  impact: Impact;
  category: Category;
  source: "system" | "user";
  accepted: boolean;
}

interface IncomingEvent {
  id: string;
  title: string;
  type: string;
  description: string;
  icon: React.ElementType;
}

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; label: string; color: string }> = {
  evidence: { icon: FlaskConical, label: "Evidence", color: "text-emerald-400" },
  access: { icon: Shield, label: "Access", color: "text-blue-400" },
  competition: { icon: Swords, label: "Competition", color: "text-red-400" },
  guideline: { icon: BookOpen, label: "Guideline", color: "text-violet-400" },
  timing: { icon: Clock, label: "Timing", color: "text-amber-400" },
  adoption: { icon: Users, label: "Adoption", color: "text-cyan-400" },
};

const INCOMING_EVENTS: IncomingEvent[] = [
  { id: "ev-1", title: "Guideline Update", type: "guideline", description: "NCCN/ASCO recommendation cycle pending", icon: BookOpen },
  { id: "ev-2", title: "Trial Readout", type: "evidence", description: "Phase 3 data expected this quarter", icon: FlaskConical },
  { id: "ev-3", title: "Payer Decision", type: "access", description: "Regional formulary review in progress", icon: Shield },
  { id: "ev-4", title: "Competitor Launch", type: "competition", description: "Competing asset approaching approval", icon: Swords },
  { id: "ev-5", title: "Campaign Shift", type: "adoption", description: "Medical affairs messaging update planned", icon: Users },
];

function computeImpact(s: { strength: Strength; reliability: Reliability }): Impact {
  if (s.strength === "High" && s.reliability === "Confirmed") return "High";
  if (s.strength === "High" || (s.strength === "Medium" && s.reliability === "Confirmed")) return "Medium";
  return "Low";
}

function generateComparativeSuggestions(entities: string[]): Signal[] {
  const groupA = entities[0] || "Group A";
  const groupB = entities[1] || "Group B";

  const raw: Omit<Signal, "impact">[] = [
    { id: "sys-c1", text: `Clinical familiarity difference: ${groupA} may have more experience with this mechanism of action than ${groupB}`, caveat: "", direction: "positive", strength: "High", reliability: "Probable", category: "evidence", source: "system", accepted: false },
    { id: "sys-c2", text: `Patient mix difference: ${groupA} sees a different proportion of eligible patients compared to ${groupB}`, caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false },
    { id: "sys-c3", text: `Workflow difference: monitoring and diagnostic capabilities vary between ${groupA} and ${groupB} practices`, caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
    { id: "sys-c4", text: `Economic difference: reimbursement familiarity and prior authorization burden differs between groups`, caveat: "", direction: "negative", strength: "High", reliability: "Probable", category: "access", source: "system", accepted: false },
    { id: "sys-c5", text: `Behavioral difference: innovation adoption tendency and risk tolerance may vary between ${groupA} and ${groupB}`, caveat: "", direction: "neutral", strength: "Medium", reliability: "Speculative", category: "adoption", source: "system", accepted: false },
  ];

  return raw.map((s) => ({ ...s, impact: computeImpact(s) }));
}

function generateAdoptionSuggestions(questionText: string): Signal[] {
  const q = (questionText || "").toLowerCase();

  const raw: Omit<Signal, "impact">[] = [
    { id: "sys-1", text: "Positive phase 3 efficacy data supports clinical differentiation", caveat: "", direction: "positive", strength: "High", reliability: "Confirmed", category: "evidence", source: "system", accepted: false },
    { id: "sys-2", text: "Guideline committee reviewing updated treatment recommendations", caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "guideline", source: "system", accepted: false },
    { id: "sys-3", text: "Moderate payer friction observed in early access negotiations", caveat: "", direction: "negative", strength: "Medium", reliability: "Confirmed", category: "access", source: "system", accepted: false },
    { id: "sys-4", text: "Entrenched standard of care creating switching inertia", caveat: "", direction: "negative", strength: "High", reliability: "Confirmed", category: "competition", source: "system", accepted: false },
  ];

  if (q.includes("adoption") || q.includes("indication"))
    raw.push({ id: "sys-5", text: "Early adopter segment showing interest after recent conference data", caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "adoption", source: "system", accepted: false });
  if (q.includes("competitor") || q.includes("share"))
    raw.push({ id: "sys-6", text: "Competitor pipeline readout expected within next quarter", caveat: "", direction: "negative", strength: "High", reliability: "Speculative", category: "competition", source: "system", accepted: false });
  if (q.includes("payer") || q.includes("restriction") || q.includes("access"))
    raw.push({ id: "sys-7", text: "Key regional payer expanding coverage criteria", caveat: "", direction: "positive", strength: "Medium", reliability: "Probable", category: "access", source: "system", accepted: false });
  if (q.includes("guideline") || q.includes("prescribing"))
    raw.push({ id: "sys-8", text: "NCCN guideline update draft circulating among committee members", caveat: "", direction: "positive", strength: "High", reliability: "Probable", category: "guideline", source: "system", accepted: false });
  if (q.includes("launch") || q.includes("segment"))
    raw.push({ id: "sys-9", text: "Launch readiness assessments underway in priority markets", caveat: "", direction: "positive", strength: "Medium", reliability: "Confirmed", category: "timing", source: "system", accepted: false });

  return raw.map((s) => ({ ...s, impact: computeImpact(s) }));
}

function generateSuggestions(questionText: string, questionType?: string, entities?: string[]): Signal[] {
  if (questionType === "comparative" && entities && entities.length >= 2) {
    return generateComparativeSuggestions(entities);
  }
  return generateAdoptionSuggestions(questionText);
}

function generateSummary(signals: Signal[], questionType?: string, entities?: string[]): string {
  const accepted = signals.filter((s) => s.accepted || s.source === "system");
  const positiveHigh = accepted.filter((s) => s.direction === "positive" && s.impact === "High");
  const negativeHigh = accepted.filter((s) => s.direction === "negative" && s.impact === "High");
  const posCount = accepted.filter((s) => s.direction === "positive").length;
  const negCount = accepted.filter((s) => s.direction === "negative").length;

  if (questionType === "comparative" && entities && entities.length >= 2) {
    const groupA = entities[0];
    const groupB = entities[1];
    if (positiveHigh.length > 0 && negativeHigh.length > 0) {
      return `Clinical familiarity and patient mix differences suggest ${groupA} may adopt earlier than ${groupB}, while workflow and economic constraints may slow uptake differently. ${posCount} difference signals favoring divergence vs. ${negCount} converging.`;
    }
    if (positiveHigh.length > 0) {
      return `Strong difference signals suggest ${groupA} and ${groupB} will diverge in adoption. ${posCount} signals point to meaningful group differences.`;
    }
    if (negativeHigh.length > 0) {
      return `Shared constraints may reduce the gap between ${groupA} and ${groupB}. ${negCount} signals suggest convergence.`;
    }
    return `${accepted.length} difference signals registered between ${groupA} and ${groupB}. Confirm or add signals to sharpen the comparison.`;
  }

  if (positiveHigh.length > 0 && negativeHigh.length > 0) {
    const posDriver = positiveHigh[0].category;
    const negDriver = negativeHigh[0].category;
    const posLabel = CATEGORY_CONFIG[posDriver]?.label || posDriver;
    const negLabel = CATEGORY_CONFIG[negDriver]?.label || negDriver;
    return `Strong ${posLabel.toLowerCase()} signal is driving adoption potential, but ${negLabel.toLowerCase()} friction is limiting near-term uptake. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  if (positiveHigh.length > 0) {
    return `Strong positive signals favor the forecast. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  if (negativeHigh.length > 0) {
    return `High-impact headwinds are constraining the outlook. ${posCount} positive vs. ${negCount} negative signals registered.`;
  }
  return `${accepted.length} signals registered. The balance is moderately uncertain — confirm or add signals to sharpen the forecast.`;
}

function getStepHeading(questionType?: string): string {
  switch (questionType) {
    case "comparative": return "What explains the difference between groups?";
    case "ranking": return "What will make one group lead?";
    default: return "What new information do we have?";
  }
}

function getDriverLabel(questionType?: string): string {
  return questionType === "comparative" ? "Difference Drivers" : "Primary Drivers";
}

function getDriverSubtitle(questionType?: string): string {
  return questionType === "comparative" ? "Key factors explaining group differences" : "Highest forecast impact";
}

export default function SignalsPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const questionText = activeQuestion?.text || "";
  const questionType = activeQuestion?.questionType;
  const entities = activeQuestion?.entities || [];
  const isComparative = questionType === "comparative" && entities.length >= 2;

  const systemSuggestions = useMemo(
    () => generateSuggestions(questionText, questionType, entities),
    [questionText, questionType, entities]
  );

  const [signals, setSignals] = useState<Signal[]>(systemSuggestions);
  const prevQuestionRef = useRef(questionText);
  useEffect(() => {
    if (questionText !== prevQuestionRef.current) {
      prevQuestionRef.current = questionText;
      setSignals((prev) => {
        const userSignals = prev.filter((s) => s.source === "user");
        return [...systemSuggestions, ...userSignals];
      });
      setEditingId(null);
    }
  }, [questionText, systemSuggestions]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showSupporting, setShowSupporting] = useState(false);

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("positive");
  const [newStrength, setNewStrength] = useState<Strength>("Medium");
  const [newReliability, setNewReliability] = useState<Reliability>("Probable");
  const [newCategory, setNewCategory] = useState<Category>("evidence");

  function acceptSignal(id: string) {
    setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, accepted: true } : s)));
  }

  function dismissSignal(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSignal(id: string, updates: Partial<Signal>) {
    const isEditingThis = editingId === id;
    setSignals((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      const merged = { ...s, ...updates };
      if (!isEditingThis) {
        return { ...merged, impact: computeImpact(merged) };
      }
      return merged;
    }));
  }

  function commitEdit(id: string) {
    setSignals((prev) => prev.map((s) => {
      if (s.id !== id) return s;
      return { ...s, impact: computeImpact(s) };
    }));
    setEditingId(null);
  }

  function addCustomSignal() {
    if (!newText.trim()) return;
    const trimmed = newText.trim().toLowerCase();
    const isDuplicate = signals.some(
      (s) => s.text.toLowerCase() === trimmed
    );
    if (isDuplicate) {
      alert("This signal already exists. Each signal can only be added once.");
      return;
    }
    const base = { strength: newStrength, reliability: newReliability };
    const sig: Signal = {
      id: `user-${Date.now()}`,
      text: newText.trim(),
      caveat: "",
      direction: newDirection,
      strength: newStrength,
      reliability: newReliability,
      impact: computeImpact(base),
      category: newCategory,
      source: "user",
      accepted: true,
    };
    setSignals((prev) => [...prev, sig]);
    setNewText("");
    setNewDirection("positive");
    setNewStrength("Medium");
    setNewReliability("Probable");
    setNewCategory("evidence");
    setShowAddForm(false);
  }

  function convertEvent(ev: IncomingEvent) {
    const evText = `${ev.title}: ${ev.description}`;
    const isDuplicate = signals.some(
      (s) => s.text.toLowerCase() === evText.toLowerCase()
    );
    if (isDuplicate) {
      alert("This signal already exists. Each signal can only be added once.");
      return;
    }
    const sig: Signal = {
      id: `ev-conv-${Date.now()}`,
      text: evText,
      caveat: "",
      direction: "neutral",
      strength: "Medium",
      reliability: "Speculative",
      impact: "Low",
      category: ev.type as Category,
      source: "user",
      accepted: true,
    };
    setSignals((prev) => [...prev, sig]);
  }

  const allSignals = signals;
  const primaryDrivers = allSignals.filter((s) => s.impact === "High");
  const supportingSignals = allSignals.filter((s) => s.impact !== "High");
  const pending = allSignals.filter((s) => !s.accepted);
  const accepted = allSignals.filter((s) => s.accepted);
  const summary = generateSummary(allSignals, questionType, entities);
  const pendingSupporting = supportingSignals.filter((s) => !s.accepted).length;
  const effectiveShowSupporting = showSupporting || pendingSupporting > 0;

  return (
    <WorkflowLayout
      currentStep="signals"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-5">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 2
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              {getStepHeading(questionType)}
            </h1>
          </div>

          {isComparative && (
            <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-r from-violet-500/5 via-card to-card p-4">
              <div className="flex items-center gap-3">
                <GitCompareArrows className="w-5 h-5 text-violet-400 shrink-0" />
                <div>
                  <div className="text-[10px] text-violet-400 font-semibold uppercase tracking-wider mb-1">Comparing</div>
                  <div className="text-sm font-medium text-foreground">
                    {entities.map((e, i) => (
                      <span key={e}>
                        {i > 0 && <span className="text-muted-foreground mx-1.5">vs</span>}
                        <span className="text-violet-300">{e}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card p-5">
            <div className="flex items-start gap-3">
              <BrainCircuit className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] text-primary font-semibold uppercase tracking-wider mb-1">System Interpretation</div>
                <div className="text-sm text-foreground leading-relaxed">{summary}</div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-foreground">{getDriverLabel(questionType)}</h2>
              <span className="text-xs text-muted-foreground">{getDriverSubtitle(questionType)}</span>
            </div>

            {primaryDrivers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
                No high-impact drivers identified yet. Confirm suggestions or add signals.
              </div>
            ) : (
              <div className="space-y-3">
                {primaryDrivers.map((sig) => (
                  <PrimaryDriverCard
                    key={sig.id}
                    signal={sig}
                    editing={editingId === sig.id}
                    onEdit={() => {
                      if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); }
                    }}
                    onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                    onDismiss={() => dismissSignal(sig.id)}
                    onUpdate={(u) => updateSignal(sig.id, u)}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setShowSupporting(!showSupporting)}
              className="flex items-center gap-2 w-full"
            >
              <Sparkles className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-sm font-semibold text-foreground">Supporting Signals</h2>
              <span className="text-xs text-muted-foreground">({supportingSignals.length})</span>
              {effectiveShowSupporting ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground ml-auto" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground ml-auto" />}
            </button>

            {effectiveShowSupporting && (
              <div className="space-y-2">
                {supportingSignals.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No supporting signals.
                  </div>
                ) : (
                  supportingSignals.map((sig) => (
                    <SupportingSignalRow
                      key={sig.id}
                      signal={sig}
                      editing={editingId === sig.id}
                      onEdit={() => {
                        if (editingId === sig.id) { commitEdit(sig.id); } else { setEditingId(sig.id); }
                      }}
                      onAccept={!sig.accepted ? () => acceptSignal(sig.id) : undefined}
                      onDismiss={() => dismissSignal(sig.id)}
                      onUpdate={(u) => updateSignal(sig.id, u)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {!showAddForm ? (
            <button
              type="button"
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition w-full justify-center"
            >
              <Plus className="w-4 h-4" />
              Add Signal Manually
            </button>
          ) : (
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Add Custom Signal</h3>
                <button type="button" onClick={() => setShowAddForm(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <textarea
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
                placeholder="Describe the signal..."
                rows={2}
                className="w-full rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50"
              />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <SelectField label="Direction" value={newDirection} onChange={(v) => setNewDirection(v as Direction)} options={["positive", "negative", "neutral"]} />
                <SelectField label="Strength" value={newStrength} onChange={(v) => setNewStrength(v as Strength)} options={["High", "Medium", "Low"]} />
                <SelectField label="Reliability" value={newReliability} onChange={(v) => setNewReliability(v as Reliability)} options={["Confirmed", "Probable", "Speculative"]} />
                <SelectField label="Category" value={newCategory} onChange={(v) => setNewCategory(v as Category)} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
              </div>
              <button
                type="button"
                onClick={addCustomSignal}
                disabled={!newText.trim()}
                className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Add Signal
              </button>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Radio className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-foreground">Incoming Events</h2>
              <span className="text-xs text-muted-foreground">Potential signal sources</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-5">
              {INCOMING_EVENTS.map((ev) => {
                const EvIcon = ev.icon;
                return (
                  <button
                    key={ev.id}
                    type="button"
                    onClick={() => convertEvent(ev)}
                    className="rounded-xl border border-border bg-card p-4 text-left hover:border-primary/30 hover:bg-muted/20 transition group"
                  >
                    <EvIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition mb-2" />
                    <div className="text-xs font-semibold text-foreground">{ev.title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground leading-snug">{ev.description}</div>
                    <div className="mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition">+ Convert to signal</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <Link href="/forecast" className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500">
              Continue to See Forecast
            </Link>
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function PrimaryDriverCard({
  signal,
  editing,
  onEdit,
  onAccept,
  onDismiss,
  onUpdate,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
  onUpdate: (u: Partial<Signal>) => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;
  const dirColor = signal.direction === "positive" ? "border-emerald-500/30 bg-emerald-500/5" : signal.direction === "negative" ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/10";
  const dirAccent = signal.direction === "positive" ? "text-emerald-400" : signal.direction === "negative" ? "text-red-400" : "text-muted-foreground";

  return (
    <div className={`rounded-2xl border p-5 space-y-3 ${dirColor}`}>
      <div className="flex items-start gap-4">
        <div className={`shrink-0 rounded-xl p-2.5 bg-card border border-border ${dirAccent}`}>
          {signal.direction === "positive" ? <ArrowUpRight className="w-5 h-5" /> : signal.direction === "negative" ? <ArrowDownRight className="w-5 h-5" /> : <Minus className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea value={signal.text} onChange={(e) => onUpdate({ text: e.target.value })} rows={2} className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground" />
              <input value={signal.caveat} onChange={(e) => onUpdate({ caveat: e.target.value })} className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 placeholder:text-amber-400/40" placeholder="Add caveat or note..." />
            </div>
          ) : (
            <div>
              <div className="text-base font-semibold text-foreground leading-snug">{signal.text}</div>
              {signal.caveat && <div className="mt-1 text-xs text-amber-300/70 italic">Caveat: {signal.caveat}</div>}
            </div>
          )}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <ImpactBadge impact={signal.impact} />
            <DirectionBadge direction={signal.direction} />
            <StrengthBadge strength={signal.strength} />
            <ReliabilityBadge reliability={signal.reliability} />
            <div className={`flex items-center gap-1 text-xs ${catCfg.color}`}>
              <CatIcon className="w-3 h-3" />
              {catCfg.label}
            </div>
            {!signal.accepted && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300 font-semibold">Pending</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className={`rounded-lg border p-1.5 transition ${editing ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/20"}`} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {onAccept && (
            <button type="button" onClick={onAccept} className="rounded-lg border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition" title="Confirm">
              <Check className="w-3.5 h-3.5" />
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Remove">
            {signal.accepted ? <Trash2 className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-2 gap-2 pl-14 md:grid-cols-4">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Reliability" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} />
          <SelectField label="Category" value={signal.category} onChange={(v) => onUpdate({ category: v as Category })} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
        </div>
      )}
    </div>
  );
}

function SupportingSignalRow({
  signal,
  editing,
  onEdit,
  onAccept,
  onDismiss,
  onUpdate,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onAccept?: () => void;
  onDismiss: () => void;
  onUpdate: (u: Partial<Signal>) => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 rounded-md bg-muted/20 p-1 ${catCfg.color}`}>
          <CatIcon className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea value={signal.text} onChange={(e) => onUpdate({ text: e.target.value })} rows={1} className="w-full rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-foreground" />
              <input value={signal.caveat} onChange={(e) => onUpdate({ caveat: e.target.value })} className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-200 placeholder:text-amber-400/40" placeholder="Add caveat..." />
            </div>
          ) : (
            <div>
              <div className="text-xs text-foreground/80">{signal.text}</div>
              {signal.caveat && <div className="mt-0.5 text-[11px] text-amber-300/60 italic">Caveat: {signal.caveat}</div>}
            </div>
          )}
          <div className="mt-1 flex items-center gap-1.5 flex-wrap">
            <ImpactBadge impact={signal.impact} />
            <DirectionBadge direction={signal.direction} />
            <StrengthBadge strength={signal.strength} />
            {!signal.accepted && <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] text-amber-300 font-semibold">Pending</span>}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className={`rounded-lg border p-1 transition ${editing ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/20"}`} title="Edit">
            <Pencil className="w-3 h-3" />
          </button>
          {onAccept && (
            <button type="button" onClick={onAccept} className="rounded-lg border border-emerald-500/30 p-1 text-emerald-400 hover:bg-emerald-500/10 transition" title="Confirm">
              <Check className="w-3 h-3" />
            </button>
          )}
          <button type="button" onClick={onDismiss} className="rounded-lg border border-border p-1 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Remove">
            {signal.accepted ? <Trash2 className="w-3 h-3" /> : <X className="w-3 h-3" />}
          </button>
        </div>
      </div>
      {editing && (
        <div className="grid grid-cols-2 gap-2 pl-7 md:grid-cols-4">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Reliability" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} />
          <SelectField label="Category" value={signal.category} onChange={(v) => onUpdate({ category: v as Category })} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
        </div>
      )}
    </div>
  );
}

function ImpactBadge({ impact }: { impact: Impact }) {
  const cls = impact === "High" ? "bg-rose-500/20 text-rose-300 border-rose-500/30" : impact === "Medium" ? "bg-blue-500/15 text-blue-300 border-blue-500/20" : "bg-muted/30 text-muted-foreground border-border";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${cls}`}>
      Impact: {impact}
    </span>
  );
}

function DirectionBadge({ direction }: { direction: Direction }) {
  const color = direction === "positive" ? "text-emerald-400" : direction === "negative" ? "text-red-400" : "text-muted-foreground";
  const Icon = direction === "positive" ? ArrowUpRight : direction === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-0.5 text-[10px] font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {direction.charAt(0).toUpperCase() + direction.slice(1)}
    </span>
  );
}

function StrengthBadge({ strength }: { strength: Strength }) {
  const cls = strength === "High" ? "bg-amber-500/15 text-amber-300" : strength === "Medium" ? "bg-blue-500/15 text-blue-300" : "bg-muted/30 text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{strength}</span>;
}

function ReliabilityBadge({ reliability }: { reliability: Reliability }) {
  const cls = reliability === "Confirmed" ? "bg-emerald-500/15 text-emerald-300" : reliability === "Probable" ? "bg-violet-500/15 text-violet-300" : "bg-muted/30 text-muted-foreground";
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>{reliability}</span>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-[10px] text-muted-foreground mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground">
        {options.map((o) => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );
}
