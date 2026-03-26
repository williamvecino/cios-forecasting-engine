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
} from "lucide-react";

type Direction = "positive" | "negative" | "neutral";
type Strength = "High" | "Medium" | "Low";
type Category = "evidence" | "access" | "competition" | "guideline" | "timing" | "adoption";

interface Signal {
  id: string;
  text: string;
  direction: Direction;
  strength: Strength;
  category: Category;
  source: "system" | "user";
  accepted: boolean;
}

const CATEGORY_CONFIG: Record<Category, { icon: React.ElementType; label: string; color: string }> = {
  evidence: { icon: FlaskConical, label: "Evidence", color: "text-emerald-400" },
  access: { icon: Shield, label: "Access", color: "text-blue-400" },
  competition: { icon: Swords, label: "Competition", color: "text-red-400" },
  guideline: { icon: BookOpen, label: "Guideline", color: "text-violet-400" },
  timing: { icon: Clock, label: "Timing", color: "text-amber-400" },
  adoption: { icon: Users, label: "Adoption", color: "text-cyan-400" },
};

function generateSuggestions(questionText: string): Signal[] {
  const q = (questionText || "").toLowerCase();

  const base: Signal[] = [
    {
      id: "sys-1",
      text: "Positive phase 3 efficacy data supports clinical differentiation",
      direction: "positive",
      strength: "High",
      category: "evidence",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-2",
      text: "Guideline committee reviewing updated treatment recommendations",
      direction: "positive",
      strength: "Medium",
      category: "guideline",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-3",
      text: "Moderate payer friction observed in early access negotiations",
      direction: "negative",
      strength: "Medium",
      category: "access",
      source: "system",
      accepted: false,
    },
    {
      id: "sys-4",
      text: "Entrenched standard of care creating switching inertia",
      direction: "negative",
      strength: "High",
      category: "competition",
      source: "system",
      accepted: false,
    },
  ];

  if (q.includes("adoption") || q.includes("indication")) {
    base.push({
      id: "sys-5",
      text: "Early adopter segment showing interest after recent conference data",
      direction: "positive",
      strength: "Medium",
      category: "adoption",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("competitor") || q.includes("share")) {
    base.push({
      id: "sys-6",
      text: "Competitor pipeline readout expected within next quarter",
      direction: "negative",
      strength: "High",
      category: "competition",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("payer") || q.includes("restriction") || q.includes("access")) {
    base.push({
      id: "sys-7",
      text: "Key regional payer expanding coverage criteria",
      direction: "positive",
      strength: "Medium",
      category: "access",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("guideline") || q.includes("prescribing")) {
    base.push({
      id: "sys-8",
      text: "NCCN guideline update draft circulating among committee members",
      direction: "positive",
      strength: "High",
      category: "guideline",
      source: "system",
      accepted: false,
    });
  }

  if (q.includes("launch") || q.includes("segment")) {
    base.push({
      id: "sys-9",
      text: "Launch readiness assessments underway in priority markets",
      direction: "positive",
      strength: "Medium",
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

  const [newText, setNewText] = useState("");
  const [newDirection, setNewDirection] = useState<Direction>("positive");
  const [newStrength, setNewStrength] = useState<Strength>("Medium");
  const [newCategory, setNewCategory] = useState<Category>("evidence");

  function acceptSignal(id: string) {
    setSignals((prev) =>
      prev.map((s) => (s.id === id ? { ...s, accepted: true } : s))
    );
  }

  function dismissSignal(id: string) {
    setSignals((prev) => prev.filter((s) => s.id !== id));
  }

  function addCustomSignal() {
    if (!newText.trim()) return;
    const sig: Signal = {
      id: `user-${Date.now()}`,
      text: newText.trim(),
      direction: newDirection,
      strength: newStrength,
      category: newCategory,
      source: "user",
      accepted: true,
    };
    setSignals((prev) => [...prev, sig]);
    setNewText("");
    setNewDirection("positive");
    setNewStrength("Medium");
    setNewCategory("evidence");
    setShowAddForm(false);
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
              Accept, dismiss, or add your own.
            </p>
          </div>

          {pending.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-foreground">
                  System Suggestions
                </h2>
                <span className="text-xs text-muted-foreground">
                  ({pending.length} pending review)
                </span>
              </div>
              {pending.map((sig) => (
                <SignalSuggestionCard
                  key={sig.id}
                  signal={sig}
                  onAccept={() => acceptSignal(sig.id)}
                  onDismiss={() => dismissSignal(sig.id)}
                />
              ))}
            </div>
          )}

          {accepted.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-foreground">
                  Accepted Signals ({accepted.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {accepted.map((sig) => (
                  <AcceptedSignalCard
                    key={sig.id}
                    signal={sig}
                    onRemove={() => dismissSignal(sig.id)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
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
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">Add Custom Signal</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-muted-foreground hover:text-foreground"
                  >
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

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Direction</label>
                    <select
                      value={newDirection}
                      onChange={(e) => setNewDirection(e.target.value as Direction)}
                      className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
                    >
                      <option value="positive">Positive</option>
                      <option value="negative">Negative</option>
                      <option value="neutral">Neutral</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Strength</label>
                    <select
                      value={newStrength}
                      onChange={(e) => setNewStrength(e.target.value as Strength)}
                      className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
                    >
                      <option value="High">High</option>
                      <option value="Medium">Medium</option>
                      <option value="Low">Low</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1.5">Category</label>
                    <select
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value as Category)}
                      className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground"
                    >
                      <option value="evidence">Evidence</option>
                      <option value="access">Access</option>
                      <option value="competition">Competition</option>
                      <option value="guideline">Guideline</option>
                      <option value="timing">Timing</option>
                      <option value="adoption">Adoption</option>
                    </select>
                  </div>
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

function SignalSuggestionCard({
  signal,
  onAccept,
  onDismiss,
}: {
  signal: Signal;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;
  const dirColor =
    signal.direction === "positive"
      ? "text-emerald-400"
      : signal.direction === "negative"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <div className="flex items-start gap-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
      <div className="shrink-0 mt-0.5">
        <Sparkles className="w-4 h-4 text-amber-400" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground">{signal.text}</div>
        <div className="mt-2 flex items-center gap-3 flex-wrap">
          <div className={`flex items-center gap-1 text-xs font-medium ${dirColor}`}>
            {signal.direction === "positive" ? (
              <ArrowUpRight className="w-3 h-3" />
            ) : signal.direction === "negative" ? (
              <ArrowDownRight className="w-3 h-3" />
            ) : (
              <Minus className="w-3 h-3" />
            )}
            {signal.direction.charAt(0).toUpperCase() + signal.direction.slice(1)}
          </div>
          <span
            className={[
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              signal.strength === "High"
                ? "bg-amber-500/15 text-amber-300"
                : signal.strength === "Medium"
                ? "bg-blue-500/15 text-blue-300"
                : "bg-muted/30 text-muted-foreground",
            ].join(" ")}
          >
            {signal.strength}
          </span>
          <div className={`flex items-center gap-1 text-xs ${catCfg.color}`}>
            <CatIcon className="w-3 h-3" />
            {catCfg.label}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          type="button"
          onClick={onAccept}
          className="rounded-lg border border-emerald-500/30 p-2 text-emerald-400 hover:bg-emerald-500/10 transition"
          title="Accept"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-muted/20 transition"
          title="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function AcceptedSignalCard({
  signal,
  onRemove,
}: {
  signal: Signal;
  onRemove: () => void;
}) {
  const catCfg = CATEGORY_CONFIG[signal.category];
  const CatIcon = catCfg.icon;
  const dirColor =
    signal.direction === "positive"
      ? "text-emerald-400"
      : signal.direction === "negative"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border bg-card p-4 group relative">
      <div className="flex items-start gap-3">
        <div className={`shrink-0 mt-0.5 rounded-md bg-muted/20 p-1.5 ${catCfg.color}`}>
          <CatIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm text-foreground/90">{signal.text}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <span className={`text-xs font-medium ${dirColor}`}>
              {signal.direction === "positive" ? "Positive" : signal.direction === "negative" ? "Negative" : "Neutral"}
            </span>
            <span className="text-xs text-muted-foreground">{signal.strength}</span>
            {signal.source === "user" && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                Manual
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-lg p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition opacity-0 group-hover:opacity-100"
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
