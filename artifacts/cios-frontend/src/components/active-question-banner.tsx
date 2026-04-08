import { useState, useCallback, useEffect } from "react";
import { Target, ChevronDown } from "lucide-react";
import type { ActiveQuestion } from "../lib/workflow";
import { storeActiveQuestion, getStoredActiveQuestion } from "../lib/workflow";

function buildOutcomeAnchor(q: ActiveQuestion): string {
  const outcome = q.outcome || "adoption";
  const subject = q.subject || "";
  const horizon = q.timeHorizon || "";
  const outcomeCapitalized = outcome.charAt(0).toUpperCase() + outcome.slice(1);
  const parts = [outcomeCapitalized];
  if (subject) parts.push(`of ${subject}`);
  if (horizon) parts.push(`within ${horizon}`);
  return parts.join(" ");
}

const STAGE_BADGE_CONFIG: Record<string, { label: string; shortLabel: string; style: string }> = {
  INVESTIGATIONAL: {
    label: "Stage 1 — Investigational",
    shortLabel: "Stage 1",
    style: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  },
  RECENTLY_APPROVED: {
    label: "Stage 2 — Recently Approved",
    shortLabel: "Stage 2",
    style: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  },
  ESTABLISHED: {
    label: "Stage 3 — Established",
    shortLabel: "Stage 3",
    style: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  },
  MATURE: {
    label: "Stage 4 — Mature",
    shortLabel: "Stage 4",
    style: "bg-gray-500/15 text-gray-400 border-gray-500/30",
  },
};

const STAGE_OPTIONS = [
  { value: "INVESTIGATIONAL", label: "Stage 1 — Investigational" },
  { value: "RECENTLY_APPROVED", label: "Stage 2 — Recently Approved" },
  { value: "ESTABLISHED", label: "Stage 3 — Established" },
  { value: "MATURE", label: "Stage 4 — Mature" },
];

interface Props {
  activeQuestion: ActiveQuestion | null;
  draftText?: string;
  onClear: () => void;
  onStageOverride?: (stage: string) => void;
}

export default function ActiveQuestionBanner({ activeQuestion, draftText, onClear, onStageOverride }: Props) {
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [localStage, setLocalStage] = useState<string | null>(null);
  const [localRationale, setLocalRationale] = useState<string | null>(null);
  const [localStageRaw, setLocalStageRaw] = useState<string | null>(null);
  const [localStageNote, setLocalStageNote] = useState<string | null>(null);

  useEffect(() => {
    if (!activeQuestion?.caseId || activeQuestion?.lifecycleStage || localStage) return;
    const API = import.meta.env.VITE_API_URL || "";
    fetch(`${API}/api/cases/${activeQuestion.caseId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.drugStage) {
          setLocalStage(data.drugStage);
          setLocalRationale(data.drugStageRationale || null);
          setLocalStageRaw(data.drugStageRaw || null);
          setLocalStageNote(data.drugStageNote || null);
          const stored = getStoredActiveQuestion();
          if (stored) {
            stored.lifecycleStage = data.drugStage;
            stored.lifecycleStageRationale = data.drugStageRationale || undefined;
            storeActiveQuestion(stored);
          }
        }
      })
      .catch(() => {});
  }, [activeQuestion?.caseId, activeQuestion?.lifecycleStage, localStage]);

  const stage = localStage || activeQuestion?.lifecycleStage;
  const rationale = localRationale || activeQuestion?.lifecycleStageRationale;
  const stageNote = localStageNote;
  const stageRaw = localStageRaw;
  const badgeConfig = stage ? STAGE_BADGE_CONFIG[stage] : null;

  const handleStageOverride = useCallback(async (newStage: string) => {
    if (!activeQuestion?.caseId) return;
    const API = import.meta.env.VITE_API_URL || "";
    try {
      const resp = await fetch(`${API}/api/cases/${activeQuestion.caseId}/lifecycle-stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setLocalStage(data.drugStage);
        setLocalRationale(data.drugStageRationale);
        const stored = getStoredActiveQuestion();
        if (stored) {
          stored.lifecycleStage = data.drugStage;
          stored.lifecycleStageRationale = data.drugStageRationale;
          storeActiveQuestion(stored);
        }
        if (onStageOverride) onStageOverride(newStage);
      }
    } catch (err) {
      console.error("Failed to override lifecycle stage:", err);
    }
  }, [activeQuestion?.caseId, onStageOverride]);

  return (
    <div className="space-y-0">
      {activeQuestion && (
        <div className="rounded-t-2xl border border-primary/30 bg-primary/5 px-5 py-3 flex items-center gap-2">
          <Target className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/70">Outcome being forecast:</span>
          <span className="text-sm font-semibold text-primary">{buildOutcomeAnchor(activeQuestion)}</span>
        </div>
      )}
      <div className={`border border-border bg-card p-5 ${activeQuestion ? "rounded-b-2xl border-t-0" : "rounded-2xl"}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Active Question
          </div>

          {activeQuestion ? (
            <>
              <div className="mt-2 text-lg font-semibold text-foreground">
                {activeQuestion.text}
              </div>
              {activeQuestion.outcome && (
                <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-1.5">
                  <Target className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs font-semibold text-primary/80 uppercase tracking-wider">Outcome being forecast:</span>
                  <span className="text-xs font-medium text-foreground">{activeQuestion.outcome}</span>
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted/30 px-3 py-1">
                  ID: {activeQuestion.id}
                </span>
                {activeQuestion.caseId && (
                  <span className="rounded-full bg-muted/30 px-3 py-1 font-mono">
                    Case: {activeQuestion.caseId.length > 12 ? activeQuestion.caseId.slice(0, 8) + "…" : activeQuestion.caseId}
                  </span>
                )}
                {activeQuestion.timeHorizon && (
                  <span className="rounded-full bg-muted/30 px-3 py-1">
                    Horizon: {activeQuestion.timeHorizon}
                  </span>
                )}
                {badgeConfig && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowStageDropdown(!showStageDropdown)}
                      className={`rounded-full border px-3 py-1 font-medium flex items-center gap-1 hover:opacity-80 transition-opacity ${badgeConfig.style}`}
                      title={rationale || "Click to change lifecycle stage"}
                    >
                      {stageNote ? `${badgeConfig.shortLabel} — New Indication` : badgeConfig.label}
                      <ChevronDown className="w-3 h-3" />
                    </button>
                    {showStageDropdown && (
                      <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border bg-card shadow-lg py-1 min-w-[220px]">
                        {STAGE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setShowStageDropdown(false);
                              if (opt.value !== stage) {
                                handleStageOverride(opt.value);
                              }
                            }}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-muted/30 transition-colors flex items-center gap-2 ${opt.value === stage ? "font-semibold text-foreground" : "text-muted-foreground"}`}
                          >
                            <span className={`w-2 h-2 rounded-full shrink-0 ${opt.value === stage ? "bg-primary" : "bg-muted-foreground/30"}`} />
                            {opt.label}
                          </button>
                        ))}
                        {stageNote && (
                          <div className="border-t border-border/50 px-3 py-2 mt-1">
                            <div className="text-[10px] font-medium text-blue-400/80">{stageNote}</div>
                            {stageRaw && stageRaw !== stage && (
                              <div className="text-[10px] text-muted-foreground/50 mt-0.5">Drug-level stage: {STAGE_BADGE_CONFIG[stageRaw]?.label || stageRaw}</div>
                            )}
                          </div>
                        )}
                        {rationale && (
                          <div className={`${stageNote ? "" : "border-t border-border/50 mt-1"} px-3 py-2`}>
                            <div className="text-[10px] text-muted-foreground/60">{rationale}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : draftText ? (
            <>
              <div className="mt-2 text-lg font-medium text-foreground/80">
                {draftText}
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-amber-500/10 border border-amber-500/20 px-3 py-1 text-amber-300">
                  Draft — click Continue to create case
                </span>
              </div>
            </>
          ) : (
            <>
              <div className="mt-2 text-sm text-muted-foreground">
                No question is active yet.
              </div>
              <div className="mt-2 text-sm text-muted-foreground/70">
                Type a question below or browse the <a href="/library" className="text-foreground/80 underline underline-offset-2">Library</a> for sample forecasts.
              </div>
            </>
          )}
        </div>

        {activeQuestion && (
          <button
            type="button"
            onClick={onClear}
            className="rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground hover:border-border/80 hover:bg-muted/20"
          >
            New Forecast
          </button>
        )}
      </div>
      </div>
    </div>
  );
}
