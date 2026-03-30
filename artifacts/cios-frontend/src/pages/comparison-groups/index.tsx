import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import WorkflowLayout from "@/components/workflow-layout";
import QuestionGate from "@/components/question-gate";
import { useActiveQuestion } from "@/hooks/use-active-question";
import {
  ArrowRight,
  GitCompareArrows,
  Plus,
  Trash2,
  Sparkles,
  PenLine,
  Check,
} from "lucide-react";
import SavedQuestionsPanel from "@/components/question/SavedQuestionsPanel";

const DEFAULT_GROUPS: Record<string, string[]> = {
  "launch timing": ["Early launch", "Delayed launch"],
  "adoption": ["Rapid adoption", "Slow adoption"],
  "approval": ["Approval achieved", "Approval delayed"],
  "guideline": ["Guideline inclusion", "Guideline exclusion"],
  "market entry": ["Market entry on time", "Market entry delayed"],
  "biosimilar": ["Market entry on time", "Market entry delayed"],
  "generic": ["Market entry on time", "Market entry delayed"],
};

function suggestDefaultGroups(questionText: string): string[] {
  const q = questionText.toLowerCase();
  for (const [keyword, groups] of Object.entries(DEFAULT_GROUPS)) {
    if (q.includes(keyword)) return groups;
  }
  return [];
}

export default function ComparisonGroupsPage() {
  const [, navigate] = useLocation();
  const { activeQuestion, updateQuestion, clearQuestion } = useActiveQuestion();

  const existingGroups = activeQuestion?.comparisonGroups || [];
  const [groups, setGroups] = useState<string[]>(
    existingGroups.length >= 2
      ? existingGroups
      : suggestDefaultGroups(activeQuestion?.text || activeQuestion?.rawInput || "")
  );
  const [newGroup, setNewGroup] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  useEffect(() => {
    if (existingGroups.length >= 2 && groups.length === 0) {
      setGroups(existingGroups);
    }
  }, [existingGroups]);

  const handleAddGroup = () => {
    const trimmed = newGroup.trim();
    if (!trimmed || groups.includes(trimmed)) return;
    setGroups([...groups, trimmed]);
    setNewGroup("");
  };

  const handleRemoveGroup = (index: number) => {
    setGroups(groups.filter((_, i) => i !== index));
  };

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditValue(groups[index]);
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    const updated = [...groups];
    updated[editingIndex] = trimmed;
    setGroups(updated);
    setEditingIndex(null);
    setEditValue("");
  };

  const handleContinue = () => {
    if (!activeQuestion) return;
    updateQuestion({
      text: activeQuestion.text,
      rawInput: activeQuestion.rawInput,
      caseId: activeQuestion.caseId,
      timeHorizon: activeQuestion.timeHorizon,
      questionType: activeQuestion.questionType,
      entities: activeQuestion.entities,
      comparisonGroups: groups,
      subject: activeQuestion.subject,
      outcome: activeQuestion.outcome,
    });
    navigate("/signals");
  };

  const questionText = activeQuestion?.text || "";
  const subject = activeQuestion?.subject || "this therapy";

  return (
    <WorkflowLayout
      currentStep="comparison-groups"
      activeQuestion={activeQuestion}
      onClearQuestion={clearQuestion}
    >
      <QuestionGate activeQuestion={activeQuestion}>
        <section className="space-y-5 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Step 2
            </div>
            <h1 className="mt-2 text-2xl font-semibold text-foreground">
              Define Comparison Groups
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              What outcome scenarios should be compared? These groups represent
              alternative futures — not entities or populations.
            </p>
          </div>

          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-primary/60 mb-2">
              Strategic Question
            </div>
            <div className="text-sm font-medium text-foreground leading-relaxed">
              {questionText}
            </div>
          </div>

          {activeQuestion?.caseId && (
            <SavedQuestionsPanel caseId={activeQuestion.caseId} />
          )}

          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <GitCompareArrows className="w-5 h-5 text-violet-400" />
              <h2 className="text-sm font-semibold text-foreground">Possible Outcomes</h2>
            </div>

            <p className="text-xs text-muted-foreground">
              Each group represents one plausible outcome scenario. Signals and evidence
              will be evaluated against these scenarios to produce distinct forecasts.
            </p>

            {groups.length === 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 text-xs text-amber-300">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>No comparison groups defined yet. Add at least two scenarios to compare.</span>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {groups.map((group, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-3"
                >
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-[11px] font-bold text-violet-300 shrink-0">
                    {String.fromCharCode(65 + i)}
                  </span>
                  {editingIndex === i ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="flex-1 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-sm text-foreground"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") setEditingIndex(null);
                        }}
                      />
                      <button
                        onClick={handleSaveEdit}
                        className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <span className="flex-1 text-sm font-medium text-foreground">{group}</span>
                      <button
                        onClick={() => handleStartEdit(i)}
                        className="rounded-lg border border-border p-1.5 hover:bg-muted/20 transition cursor-pointer"
                        title="Edit"
                      >
                        <PenLine className="w-3 h-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => handleRemoveGroup(i)}
                        className="rounded-lg border border-border p-1.5 hover:bg-red-500/10 hover:border-red-500/30 transition cursor-pointer"
                        title="Remove"
                      >
                        <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-400" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Add a scenario (e.g., Late 2027 launch)"
                className="flex-1 rounded-xl border border-border bg-muted/20 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroup.trim()) {
                    e.preventDefault();
                    handleAddGroup();
                  }
                }}
              />
              <button
                onClick={handleAddGroup}
                disabled={!newGroup.trim()}
                className="rounded-xl border border-primary/30 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </div>
          </div>

          {groups.length >= 2 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <div className="flex items-center gap-2 text-xs text-emerald-400">
                <Check className="w-3.5 h-3.5" />
                <span>
                  {groups.length} comparison groups defined. Evidence and signals will be
                  evaluated against these scenarios.
                </span>
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleContinue}
              className="rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground hover:bg-primary/90 inline-flex items-center gap-2 cursor-pointer"
            >
              Continue to Add Information
              <ArrowRight className="w-4 h-4" />
            </button>
            {groups.length < 2 && (
              <span className="text-xs text-muted-foreground">
                You can continue without comparison groups for non-comparative questions.
              </span>
            )}
          </div>
        </section>
      </QuestionGate>
    </WorkflowLayout>
  );
}
