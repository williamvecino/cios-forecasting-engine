import { useState } from "react";
import { Loader2, ShieldCheck, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";

interface QualityAssessment {
  signalId: string;
  signalText: string;
  qualityScore: number;
  reliability: string;
  freshness: string;
  directness: string;
  duplicationRisk: string;
  warnings: string[];
  recommendation: string;
  rationale: string;
}

interface SignalQualityResult {
  assessments: QualityAssessment[];
  overallQuality: {
    averageScore: number;
    signalsToVerify: number;
    signalsToDowngrade: number;
    signalsToRemove: number;
    signalGaps: string[];
  };
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

export default function SignalQualityPanel({ question, signals }: {
  question: string;
  signals: Array<{ id: string; text: string; direction: string; strength: string; reliability: string; source?: string; source_type?: string; observed_date?: string | null }>;
}) {
  const [result, setResult] = useState<SignalQualityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function runQuality() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/signal-quality`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          signals: signals.map(s => ({ ...s, confidence: s.reliability })),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const scoreColor = (s: number) => s >= 70 ? "text-emerald-400" : s >= 40 ? "text-amber-400" : "text-red-400";
  const recColor = (r: string) => r === "keep" ? "text-emerald-400" : r === "verify" ? "text-amber-400" : r === "downgrade" ? "text-orange-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-3 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-bold text-foreground">Signal Quality Assessment</span>
          {result && (
            <span className={`text-xs font-medium ${scoreColor(result.overallQuality.averageScore)}`}>
              Avg: {Math.round(result.overallQuality.averageScore)}/100
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-border px-5 pb-4 pt-3 space-y-4">
          {!result && (
            <button
              onClick={runQuality}
              disabled={loading || signals.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 text-xs font-medium text-emerald-400 hover:bg-emerald-500/20 transition disabled:opacity-50 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
              {loading ? "Assessing quality..." : `Assess ${signals.length} Signals`}
            </button>
          )}

          {error && <div className="text-xs text-red-400">{error}</div>}

          {result && (
            <div className="space-y-3">
              <div className="text-[10px] text-muted-foreground/70 leading-snug">
                {result.overallQuality.averageScore >= 70
                  ? "Overall signal quality is good — most evidence is reliable, recent, and directly relevant to the question."
                  : result.overallQuality.averageScore >= 40
                  ? "Signal quality is mixed — some evidence may be outdated, indirect, or from weaker sources. Consider verifying flagged signals before relying on the forecast."
                  : "Signal quality is low — much of the evidence may be unreliable or not directly relevant. The forecast should be treated with caution until stronger signals are added."}
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span title="These signals need confirmation from a second source">Verify: <span className="text-amber-400 font-medium">{result.overallQuality.signalsToVerify}</span></span>
                <span title="These signals are weaker than initially rated and should carry less weight">Downgrade: <span className="text-orange-400 font-medium">{result.overallQuality.signalsToDowngrade}</span></span>
                <span title="These signals are unreliable or irrelevant and should not influence the forecast">Remove: <span className="text-red-400 font-medium">{result.overallQuality.signalsToRemove}</span></span>
              </div>

              {result.overallQuality.signalGaps.length > 0 && (
                <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                    <span className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">Signal Gaps</span>
                  </div>
                  <ul className="space-y-0.5">
                    {result.overallQuality.signalGaps.map((g, i) => (
                      <li key={i} className="text-xs text-foreground/70">• {g}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-1.5">
                {result.assessments.map((a) => (
                  <div key={a.signalId} className="rounded-lg border border-border bg-muted/10 px-3 py-2 space-y-1">
                    <div className="flex items-center gap-3">
                      <div className={`text-xs font-bold w-8 text-center shrink-0 ${scoreColor(a.qualityScore)}`} title={
                        a.qualityScore >= 70 ? "Good quality — reliable and relevant" :
                        a.qualityScore >= 40 ? "Fair quality — usable but has some weaknesses" :
                        "Low quality — may not be reliable enough to influence the forecast"
                      }>{a.qualityScore}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-foreground truncate">{a.signalText}</div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted-foreground">
                          <span title="How trustworthy is the source">{a.reliability}</span>
                          <span>·</span>
                          <span title="How recent is this information">{a.freshness}</span>
                          <span>·</span>
                          <span title="How directly relevant to the question">{a.directness}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${recColor(a.recommendation)}`}>{a.recommendation}</span>
                    </div>
                    {a.rationale && (
                      <div className="text-[10px] text-muted-foreground/70 pl-11 leading-snug">{a.rationale}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
