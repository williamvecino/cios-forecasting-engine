import { useState } from "react";
import { Loader2, Zap, AlertTriangle, Eye } from "lucide-react";

interface ActorReaction {
  actorName: string;
  initialReaction: string;
  reactionIntensity: string;
  reactionDirection: string;
  behaviorChange: string;
  timeToReact: string;
  cascadeEffects: string[];
  secondOrderEffects: string[];
  responseConsiderations: string[];
}

interface StakeholderReactionResult {
  reactions: ActorReaction[];
  systemImpact: {
    netEffect: string;
    confidenceInPrediction: string;
    keyUncertainty: string;
    timeline: string;
  };
  criticalWatchpoints: string[];
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

const dirColor = (d: string) =>
  d === "supportive" ? "text-emerald-400" : d === "resistant" ? "text-rose-400" : d === "mixed" ? "text-amber-400" : "text-slate-400";

const intensityBadge = (i: string) => {
  const styles: Record<string, string> = {
    strong: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    moderate: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    mild: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return styles[i] || "bg-slate-500/10 text-slate-400 border-slate-500/20";
};

const netEffectColor = (e: string) => {
  if (e === "accelerates") return "text-emerald-400";
  if (e === "decelerates") return "text-rose-400";
  if (e === "destabilizes") return "text-orange-400";
  return "text-slate-400";
};

export function StakeholderReactionPanel({ question, brand, therapeuticArea, actors, context }: {
  question: string;
  brand?: string;
  therapeuticArea?: string;
  actors?: Array<{ name: string; role: string; influenceWeight: number }>;
  context?: string;
}) {
  const [result, setResult] = useState<StakeholderReactionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [scenarioDesc, setScenarioDesc] = useState("");

  async function runReaction() {
    if (!scenarioLabel.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/stakeholder-reaction`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          brand,
          therapeuticArea,
          actors,
          scenario: { label: scenarioLabel, description: scenarioDesc || scenarioLabel },
          context,
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

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Stakeholder Reactions</h3>
        </div>
      </div>

      {error && <div className="px-5 py-3 text-xs text-rose-400 bg-rose-500/5">{error}</div>}

      {!result && (
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Scenario Name</label>
            <input
              type="text"
              value={scenarioLabel}
              onChange={(e) => setScenarioLabel(e.target.value)}
              placeholder="e.g. FDA approval granted 3 months early"
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Description (optional)</label>
            <textarea
              value={scenarioDesc}
              onChange={(e) => setScenarioDesc(e.target.value)}
              placeholder="Describe the scenario in more detail..."
              rows={2}
              className="w-full rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <button
            onClick={runReaction}
            disabled={loading || !scenarioLabel.trim()}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            {loading ? "Simulating reactions..." : "Simulate Reactions"}
          </button>
        </div>
      )}

      {result && (
        <div className="p-5 space-y-5">
          <div className="rounded-xl bg-slate-800/50 border border-border p-4">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">System Impact</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">Net Effect</div>
                <div className={`text-sm font-semibold ${netEffectColor(result.systemImpact.netEffect)}`}>
                  {result.systemImpact.netEffect}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-0.5">Confidence</div>
                <div className="text-sm text-foreground/80">{result.systemImpact.confidenceInPrediction}</div>
              </div>
            </div>
            <div className="mt-3">
              <div className="text-[10px] text-muted-foreground mb-0.5">Key Uncertainty</div>
              <p className="text-xs text-foreground/70">{result.systemImpact.keyUncertainty}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 pr-3">Actor</th>
                  <th className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 pr-3">Behavior</th>
                  <th className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2 pr-3">Strength</th>
                  <th className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider pb-2">Timing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {result.reactions.map((r) => (
                  <tr key={r.actorName} className="group">
                    <td className="py-3 pr-3 align-top">
                      <div className="text-sm font-medium text-foreground">{r.actorName}</div>
                      <div className={`text-[11px] capitalize ${dirColor(r.reactionDirection)}`}>{r.reactionDirection}</div>
                    </td>
                    <td className="py-3 pr-3 align-top max-w-[280px]">
                      <p className="text-[12px] text-foreground/80 leading-relaxed">{r.behaviorChange}</p>
                      {r.cascadeEffects.length > 0 && (
                        <div className="mt-1.5">
                          {r.cascadeEffects.map((e, i) => (
                            <p key={i} className="text-[11px] text-amber-400/70 leading-relaxed">→ {e}</p>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3 align-top">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize ${intensityBadge(r.reactionIntensity)}`}>
                        {r.reactionIntensity}
                      </span>
                    </td>
                    <td className="py-3 align-top">
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap">{r.timeToReact}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.criticalWatchpoints.length > 0 && (
            <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider">Critical Watchpoints</span>
              </div>
              <ul className="space-y-1.5">
                {result.criticalWatchpoints.map((w, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Eye className="w-3 h-3 text-rose-400/60 mt-0.5 shrink-0" />
                    <span className="text-[12px] text-foreground/80 leading-relaxed">{w}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
