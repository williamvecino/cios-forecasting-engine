import { useState } from "react";
import {
  Globe,
  Loader2,
  Check,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  ChevronDown,
  ChevronUp,
  Radar,
  Shield,
  AlertTriangle,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface CandidateSignal {
  signalLabel: string;
  source: string;
  sourceDate: string;
  signalType: string;
  suggestedDirection: "positive" | "negative" | "neutral";
  suggestedStrength: "High" | "Medium" | "Low";
  suggestedConfidence: "Confirmed" | "Probable" | "Speculative";
  relevanceScore: number;
  whyItMatters: string;
}

interface ExternalSignalScoutResult {
  candidates: CandidateSignal[];
  searchContext: string;
  inputHash: string;
}

interface Props {
  activeQuestion: string;
  subject?: string;
  timeHorizon?: string;
  existingSignalTexts: string[];
  onAcceptSignal: (signal: {
    text: string;
    direction: "positive" | "negative" | "neutral";
    strength: "High" | "Medium" | "Low";
    reliability: "Confirmed" | "Probable" | "Speculative";
    category: string;
    sourceType: string;
    sourceDate: string;
  }) => void;
}

const DIRECTION_ICON = {
  positive: ArrowUpRight,
  negative: ArrowDownRight,
  neutral: Minus,
};

const DIRECTION_COLOR = {
  positive: "text-emerald-400",
  negative: "text-red-400",
  neutral: "text-zinc-400",
};

const CONFIDENCE_COLOR = {
  Confirmed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  Probable: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  Speculative: "border-zinc-500/30 bg-zinc-500/10 text-zinc-400",
};

const TYPE_TO_CATEGORY: Record<string, string> = {
  regulatory: "evidence",
  clinical: "evidence",
  competitive: "competition",
  market: "adoption",
  payer: "access",
  guideline: "guideline",
  pipeline: "competition",
  safety: "evidence",
  economic: "access",
};

export default function ExternalSignalScoutPanel({
  activeQuestion,
  subject,
  timeHorizon,
  existingSignalTexts,
  onAcceptSignal,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ExternalSignalScoutResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set());
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());

  async function runScout() {
    setLoading(true);
    setError(null);
    setResult(null);
    setAcceptedIds(new Set());
    setDismissedIds(new Set());

    try {
      const res = await fetch(`${API}/api/agents/external-signal-scout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeQuestion,
          subject,
          timeHorizon,
          existingSignals: existingSignalTexts,
        }),
      });

      if (!res.ok) {
        throw new Error("Scout request failed");
      }

      const data = await res.json();
      if (data.externalSignals) {
        setResult(data.externalSignals);
      } else {
        throw new Error("No results returned");
      }
    } catch (err) {
      setError("Failed to scout external signals. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleAccept(candidate: CandidateSignal, index: number) {
    onAcceptSignal({
      text: candidate.signalLabel,
      direction: candidate.suggestedDirection,
      strength: candidate.suggestedStrength,
      reliability: candidate.suggestedConfidence,
      category: TYPE_TO_CATEGORY[candidate.signalType] || "evidence",
      sourceType: `${candidate.source} (${candidate.sourceDate})`,
      sourceDate: candidate.sourceDate,
    });
    setAcceptedIds((prev) => new Set(prev).add(index));
  }

  function handleDismiss(index: number) {
    setDismissedIds((prev) => new Set(prev).add(index));
  }

  const visibleCandidates = result?.candidates.filter(
    (_, i) => !dismissedIds.has(i)
  ) || [];

  return (
    <div className="rounded-2xl border border-border bg-card">
      <button
        type="button"
        onClick={() => {
          setExpanded(!expanded);
          if (!expanded && !result && !loading) {
            runScout();
          }
        }}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-muted/10 transition rounded-2xl"
      >
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-blue-500/10 p-2">
            <Radar className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold text-foreground">External Signal Scout</div>
            <div className="text-[11px] text-muted-foreground">
              {result
                ? `${visibleCandidates.length} candidate signal${visibleCandidates.length !== 1 ? "s" : ""} found`
                : "Scan for relevant external signals"}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-5 py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-3 py-6 justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
              <span className="text-sm text-muted-foreground">Scanning external sources...</span>
            </div>
          )}

          {result && !loading && (
            <>
              <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {result.searchContext}
              </div>

              {visibleCandidates.length === 0 ? (
                <div className="text-sm text-muted-foreground py-4 text-center">
                  All candidates have been processed.
                </div>
              ) : (
                <div className="space-y-2">
                  {result.candidates.map((candidate, index) => {
                    if (dismissedIds.has(index)) return null;
                    const isAccepted = acceptedIds.has(index);
                    const DirIcon = DIRECTION_ICON[candidate.suggestedDirection];

                    return (
                      <div
                        key={index}
                        className={`rounded-xl border p-3 space-y-2 transition ${
                          isAccepted
                            ? "border-emerald-500/30 bg-emerald-500/5"
                            : "border-border bg-muted/5 hover:bg-muted/10"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2 flex-1 min-w-0">
                            <DirIcon className={`w-4 h-4 mt-0.5 shrink-0 ${DIRECTION_COLOR[candidate.suggestedDirection]}`} />
                            <div className="min-w-0">
                              <div className="text-sm text-foreground leading-snug">
                                {candidate.signalLabel}
                              </div>
                              <div className="text-[11px] text-muted-foreground mt-1">
                                {candidate.whyItMatters}
                              </div>
                            </div>
                          </div>

                          {!isAccepted ? (
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleAccept(candidate, index)}
                                className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-1.5 hover:bg-emerald-500/20 transition"
                                title="Accept signal"
                              >
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDismiss(index)}
                                className="rounded-lg border border-border p-1.5 hover:bg-muted/20 transition"
                                title="Dismiss"
                              >
                                <X className="w-3.5 h-3.5 text-muted-foreground" />
                              </button>
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[10px] text-emerald-400 shrink-0">
                              <Check className="w-3 h-3" />
                              Added
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          <span className="rounded-md bg-muted/20 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {candidate.signalType}
                          </span>
                          <span className="rounded-md bg-muted/20 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {candidate.suggestedStrength}
                          </span>
                          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${CONFIDENCE_COLOR[candidate.suggestedConfidence]}`}>
                            {candidate.suggestedConfidence}
                          </span>
                          <span className="rounded-md bg-muted/20 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Globe className="w-2.5 h-2.5 inline mr-0.5" />
                            {candidate.source}
                          </span>
                          <span className="rounded-md bg-muted/20 border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            {candidate.sourceDate}
                          </span>
                          <span className="rounded-md bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 text-[10px] text-blue-400">
                            {Math.round(candidate.relevanceScore * 100)}% relevant
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button
                type="button"
                onClick={runScout}
                disabled={loading}
                className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/30 transition inline-flex items-center gap-1.5"
              >
                <Radar className="w-3 h-3" />
                Rescan
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
