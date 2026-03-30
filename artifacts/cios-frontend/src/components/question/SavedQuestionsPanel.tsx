import { useState, useEffect, useCallback } from "react";
import { ListTree, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface SavedQuestion {
  id: string;
  caseId: string;
  questionId: string;
  parentQuestionId: string | null;
  questionText: string;
  questionRole: string;
  questionType: string;
  outcomeStructure: string | null;
  timeHorizon: string | null;
  priorityRank: number;
  status: string;
  source: string;
  linkedSignals: string | null;
  linkedForecastId: string | null;
  dependencies: string | null;
  notes: string | null;
}

const ROLE_COLORS: Record<string, string> = {
  primary: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  secondary: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  deferred: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  scenario: "bg-purple-500/10 text-purple-400 border-purple-500/20",
};

const TYPE_COLORS: Record<string, string> = {
  strategic: "bg-blue-500/10 text-blue-400",
  competitive: "bg-purple-500/10 text-purple-400",
  financial: "bg-amber-500/10 text-amber-400",
  operational: "bg-slate-500/10 text-slate-400",
  diagnostic: "bg-emerald-500/10 text-emerald-400",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Analyzing",
  saved: "Saved",
  deferred: "Deferred",
  promoted: "Promoted",
  discarded: "Discarded",
};

export default function SavedQuestionsPanel({ caseId }: { caseId: string }) {
  const [questions, setQuestions] = useState<SavedQuestion[]>([]);
  const [collapsed, setCollapsed] = useState(true);
  const [loading, setLoading] = useState(false);

  const loadQuestions = useCallback(async () => {
    if (!caseId) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/cases/${caseId}/questions`);
      if (res.ok) {
        const data = await res.json();
        setQuestions(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error("Failed to load saved questions:", e);
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const updateStatus = async (questionId: string, status: string) => {
    try {
      await fetch(`${API}/api/cases/${caseId}/questions/${questionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      loadQuestions();
    } catch (e) {
      console.error("Failed to update question status:", e);
    }
  };

  if (questions.length === 0) return null;

  const primary = questions.find(q => q.questionRole === "primary");
  const secondary = questions.filter(q => q.questionRole !== "primary" && q.status !== "discarded");

  if (secondary.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/5"
      >
        <div className="flex items-center gap-2">
          <ListTree className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Question Repository
          </span>
          <span className="text-[10px] text-muted-foreground/60">
            ({secondary.length} linked question{secondary.length !== 1 ? "s" : ""})
          </span>
        </div>
        {collapsed ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>

      {!collapsed && (
        <div className="px-5 pb-4 space-y-2">
          {secondary.map((q) => (
            <div key={q.id} className={`rounded-lg border p-3 ${q.status === "active" ? "border-blue-500/20 bg-blue-500/5" : "border-border bg-muted/5"}`}>
              <div className="text-xs text-foreground/80">{q.questionText}</div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${ROLE_COLORS[q.questionRole] || ROLE_COLORS.secondary}`}>
                  {q.questionRole}
                </span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${TYPE_COLORS[q.questionType] || TYPE_COLORS.strategic}`}>
                  {q.questionType}
                </span>
                {q.timeHorizon && (
                  <span className="text-[9px] text-muted-foreground">{q.timeHorizon}</span>
                )}
                <span className={`text-[9px] px-1.5 py-0.5 rounded ml-auto ${q.status === "active" ? "bg-blue-500/20 text-blue-300" : "bg-slate-500/20 text-slate-300"}`}>
                  {STATUS_LABELS[q.status] || q.status}
                </span>
              </div>
              <div className="flex gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => updateStatus(q.questionId, "active")}
                  className={`text-[9px] px-2 py-0.5 rounded border ${q.status === "active" ? "border-blue-500/40 bg-blue-500/10 text-blue-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
                >
                  Analyze
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(q.questionId, "saved")}
                  className={`text-[9px] px-2 py-0.5 rounded border ${q.status === "saved" ? "border-slate-500/40 bg-slate-500/10 text-slate-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(q.questionId, "deferred")}
                  className={`text-[9px] px-2 py-0.5 rounded border ${q.status === "deferred" ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-border text-muted-foreground hover:text-foreground hover:bg-muted/10"}`}
                >
                  Defer
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus(q.questionId, "discarded")}
                  className="text-[9px] px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-red-400 hover:border-red-500/30"
                >
                  Discard
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
