import { useState, useMemo } from "react";
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
} from "lucide-react";

type Direction = "positive" | "negative" | "neutral";
type Strength = "High" | "Medium" | "Low";
type Reliability = "Confirmed" | "Probable" | "Speculative";
type Category = "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";

interface Signal {
  id: string;
  text: string;
  caveat: string;
  direction: Direction;
  strength: Strength;
  reliability: Reliability;
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

function generateSuggestions(questionText: string): Signal[] {
  const q = (questionText || "").toLowerCase();

  const base: Signal[] = [
    {
      id: "sys-1",
      text: "Positive phase 3 efficacy data supports clinical differentiation",
      caveat: "",
      direction: "positive",
      strength: "High",
      reliability: "Confirmed",
      category: "evidence",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-2",
      text: "Guideline committee reviewing updated treatment recommendations",
      caveat: "",
      direction: "positive",
      strength: "Medium",
      reliability: "Probable",
      category: "guideline",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-3",
      text: "Moderate payer friction observed in early access negotiations",
      caveat: "",
      direction: "negative",
      strength: "Medium",
      reliability: "Confirmed",
      category: "access",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-4",
      text: "Entrenched standard of care creating switching inertia",
      caveat: "",
      direction: "negative",
      strength: "High",
      reliability: "Confirmed",
      category: "competition",
      source: "system",
      accepted: false,
    },
  ];

  if (q.includes("adoption") || q.includes("indication")) {
    base.push({
      id: "sys-5",
      text: "Early adopter segment showing interest after recent conference data",
      caveat: "",
      direction: "positive",
      strength: "Medium",
      reliability: "Probable",
      category: "adoption",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("competitor") || q.includes("share")) {
    base.push({
      id: "sys-6",
      text: "Competitor pipeline readout expected within next quarter",
      caveat: "",
      direction: "negative",
      strength: "High",
      reliability: "Speculative",
      category: "competition",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("payer") || q.includes("restriction") || q.includes("access")) {
    base.push({
      id: "sys-7",
      text: "Key regional payer expanding coverage criteria",
      caveat: "",
      direction: "positive",
      strength: "Medium",
      reliability: "Probable",
      category: "access",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("guideline") || q.includes("prescribing")) {
    base.push({
      id: "sys-8",
      text: "NCCN guideline update draft circulating among committee members",
      caveat: "",
      direction: "positive",
      strength: "High",
      reliability: "Probable",
      category: "guideline",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("launch") || q.includes("segment")) {
    base.push({
      id: "sys-9",
      text: "Launch readiness assessments underway in priority markets",
      caveat: "",
      direction: "positive",
      strength: "Medium",
      reliability: "Confirmed",
      category: "timing",
      source: "system",
      accepted: false,
    });
  }

  return base;
}

export default function SignalsPage() {
  const { activeQuestion, clearQuestion } = useActiveQuestion();
  const questionText = activeQuestion?.text || "";

  const systemSuggestions = useMemo(
    () => generateSuggestions(questionText),
    [questionText]
  );

  const [signals, setSignals] = useState<Signal[]>(systemSuggestions);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("positive");
  const [newStrength, setNewStrength] = useState<Strength>("Medium");
  const [newReliability, setNewReliability] = useState<Reliability>("Probable");
  const [newCategory, setNewCategory] = useState<Category>("evidence");

  function acceptSignal(id: string) {
    setSignals((prev) =>
      prev.map((s) => (s.id === id ? { ...s, accepted: true } : s))
    );
  }

  function dismissSignal(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }

  function updateSignal(id: string, updates: Partial<Signal>) {
    setSignals((prev) =>
      prev.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  }

  function addCustomSignal() {
    if (!newText.trim()) return;
    const sig: Signal = {
      id: `user-${Date.now()}`,
      text: newText.trim(),
      caveat: "",
      direction: newDirection,
      strength: newStrength,
      reliability: newReliability,
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
    const sig: Signal = {
      id: `ev-conv-${Date.now()}`,
      text: `${ev.title}: ${ev.description}`,
      caveat: "",
      direction: "neutral",
      strength: "Medium",
      reliability: "Speculative",
      category: ev.type as Category,
      source: "user",
      accepted: true,
    };
    setSignals((prev) => [...prev, sig]);
  }

  const pending = signals.filter((s) => !s.accepted);
  const accepted = signals.filter((s) => s.accepted);

  return (
    <WorkflowLayout
      currentStep="signals"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-6">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 2
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              What new information do we have?
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              The system suggests signals based on your question context.
              Review, edit, confirm, or add your own.
            </p>
          </div>

          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  System Suggested Signals
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({pending.length} pending review)
                </span>
              </div>
              {pending.map((sig) => (
                <SuggestedSignalCard
                  key={sig.id}
                  signal={sig}
                  onAccept={() => acceptSignal(sig.id)}
                  onDismiss={() => dismissSignal(sig.id)}
                  onUpdate={(updates) => updateSignal(sig.id, updates)}
                />
              ))}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-primary" />
                <h2 className="text-sm font-semibold text-foreground">
                  Active Signals
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({accepted.length})
                </span>
              </div>
            </div>

            {accepted.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No active signals yet. Confirm suggestions above or add your own.
              </div>
            ) : (
              <div className="space-y-2">
                {accepted.map((sig) => (
                  <ActiveSignalRow
                    key={sig.id}
                    signal={sig}
                    editing={editingId === sig.id}
                    onEdit={() => setEditingId(editingId === sig.id ? null : sig.id)}
                    onUpdate={(updates) => updateSignal(sig.id, updates)}
                    onRemove={() => dismissSignal(sig.id)}
                  />
                ))}
              </div>
            )}

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
          </div>

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
                    <div className="mt-2 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition">
                      + Convert to signal
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {accepted.length > 0 && (
            <div className="flex justify-end">
              <Link
                href="/forecast"
                className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500"
              >
                Continue to See Forecast
              </Link>
            </div>
          )}
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}

function SuggestedSignalCard({
  signal,
  onAccept,
  onDismiss,
  onUpdate,
}: {
  signal: Signal;
  onAccept: () => void;
  onDismiss: () => void;
  onUpdate: (updates: Partial<Signal>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(signal.text);
  const [editCaveat, setEditCaveat] = useState(signal.caveat);
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;

  function handleSaveEdit() {
    onUpdate({ text: editText, caveat: editCaveat });
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Sparkles className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
                placeholder="Signal description..."
              />
              <input
                value={editCaveat}
                onChange={(e) => setEditCaveat(e.target.value)}
                className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 placeholder:text-amber-400/40"
                placeholder="Add caveat or note (e.g. 'only applies to US market')..."
              />
            </div>
          ) : (
            <div>
              <div className="text-sm text-foreground">{signal.text}</div>
              {signal.caveat && (
                <div className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-300/80 italic">
                  <span className="shrink-0">Caveat:</span>
                  <span>{signal.caveat}</span>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {editing ? (
            <>
              <button type="button" onClick={handleSaveEdit} className="rounded-lg border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition" title="Save">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={() => { setEditText(signal.text); setEditCaveat(signal.caveat); setEditing(false); }} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/20 transition" title="Cancel">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/20 transition" title="Edit">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={onAccept} className="rounded-lg border border-emerald-500/30 p-1.5 text-emerald-400 hover:bg-emerald-500/10 transition" title="Confirm">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button type="button" onClick={onDismiss} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:bg-muted/20 transition" title="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {!editing && (
        <div className="pl-7">
          <input
            value={signal.caveat}
            onChange={(e) => onUpdate({ caveat: e.target.value })}
            className="w-full rounded-lg border border-transparent bg-transparent px-0 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/30 hover:border-amber-500/20 focus:border-amber-500/30 focus:bg-amber-500/5 transition"
            placeholder="+ Add caveat or note..."
          />
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap pl-7">
        <DirectionBadge direction={signal.direction} />
        <StrengthBadge strength={signal.strength} />
        <ReliabilityBadge reliability={signal.reliability} />
        <div className={`flex items-center gap-1 text-xs ${catCfg.color}`}>
          <CatIcon className="w-3 h-3" />
          {catCfg.label}
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

function ActiveSignalRow({
  signal,
  editing,
  onEdit,
  onUpdate,
  onRemove,
}: {
  signal: Signal;
  editing: boolean;
  onEdit: () => void;
  onUpdate: (updates: Partial<Signal>) => void;
  onRemove: () => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 rounded-md bg-muted/20 p-1.5 ${catCfg.color}`}>
          <CatIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={signal.text}
                onChange={(e) => onUpdate({ text: e.target.value })}
                rows={2}
                className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
              />
              <input
                value={signal.caveat}
                onChange={(e) => onUpdate({ caveat: e.target.value })}
                className="w-full rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-200 placeholder:text-amber-400/40"
                placeholder="Add caveat or note..."
              />
            </div>
          ) : (
            <div>
              <div className="text-sm text-foreground/90">{signal.text}</div>
              {signal.caveat && (
                <div className="mt-1 text-xs text-amber-300/70 italic">
                  Caveat: {signal.caveat}
                </div>
              )}
            </div>
          )}
          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
            <DirectionBadge direction={signal.direction} />
            <StrengthBadge strength={signal.strength} />
            <ReliabilityBadge reliability={signal.reliability} />
            {signal.source === "user" && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">Manual</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={onEdit} className={`rounded-lg border p-1.5 transition ${editing ? "border-primary/30 text-primary bg-primary/10" : "border-border text-muted-foreground hover:bg-muted/20"}`} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg border border-border p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition" title="Remove">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {editing && (
        <div className="grid grid-cols-2 gap-2 pl-9 md:grid-cols-4">
          <SelectField label="Direction" value={signal.direction} onChange={(v) => onUpdate({ direction: v as Direction })} options={["positive", "negative", "neutral"]} />
          <SelectField label="Strength" value={signal.strength} onChange={(v) => onUpdate({ strength: v as Strength })} options={["High", "Medium", "Low"]} />
          <SelectField label="Reliability" value={signal.reliability} onChange={(v) => onUpdate({ reliability: v as Reliability })} options={["Confirmed", "Probable", "Speculative"]} />
          <SelectField label="Category" value={signal.category} onChange={(v) => onUpdate({ category: v as Category })} options={["evidence", "access", "competition", "guideline", "timing", "adoption"]} />
        </div>
      )}
    </div>
  );
}

function DirectionBadge({ direction }: { direction: Direction }) {
  const color = direction === "positive" ? "text-emerald-400" : direction === "negative" ? "text-red-400" : "text-muted-foreground";
  const Icon = direction === "positive" ? ArrowUpRight : direction === "negative" ? ArrowDownRight : Minus;
  return (
    <span className={`flex items-center gap-0.5 text-xs font-medium ${color}`}>
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
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-border bg-muted/20 px-2 py-1.5 text-xs text-foreground"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o.charAt(0).toUpperCase() + o.slice(1)}
          </option>
        ))}
      </select>
    </div>
  );
}
