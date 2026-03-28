import { useState } from "react";
import { Loader2, Users, ChevronDown, ChevronUp, Zap } from "lucide-react";

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

export function StakeholderReactionPanel({ question, actors, context }: {
  question: string;
  actors?: Array<{ name: string; role: string; influenceWeight: number }>;
  context?: string;
}) {
  const [result, setResult] = useState<StakeholderReactionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scenarioLabel, setScenarioLabel] = useState("");
  const [scenarioDesc, setScenarioDesc] = useState("");
  const [expandedActor, setExpandedActor] = useState<string | null>(null);

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

  const dirColor = (d: string) =>
    d === "supportive" ? "text-emerald-400" : d === "resistant" ? "text-red-400" : d === "mixed" ? "text-amber-400" : "text-slate-400";

  const intensityBadge = (i: string) =>
    i === "strong" ? "bg-red-500/10 text-red-400 border-red-500/20" :
    i === "moderate" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
    i === "mild" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
    "bg-slate-500/10 text-slate-400 border-slate-500/20";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Stakeholder Reactions</h3>
          <span className="text-xs text-muted-foreground">How actors respond to scenarios</span>
        </div>
      </div>

      {error && <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>}

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
          <div className="rounded-xl bg-slate-800/50 border border-border p-4 space-y-2">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Impact</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground">Net Effect</div>
                <div className={`text-sm font-medium ${
                  result.systemImpact.netEffect === "accelerates" ? "text-emerald-400" :
                  result.systemImpact.netEffect === "decelerates" ? "text-red-400" :
                  result.systemImpact.netEffect === "destabilizes" ? "text-orange-400" :
                  "text-slate-400"
                }`}>{result.systemImpact.netEffect}</div>
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground">Confidence</div>
                <div className="text-sm text-foreground/80">{result.systemImpact.confidenceInPrediction}</div>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-muted-foreground">Key Uncertainty</div>
              <p className="text-xs text-foreground/70">{result.systemImpact.keyUncertainty}</p>
            </div>
          </div>

          <div className="space-y-2">
            {result.reactions.map((r) => (
              <div key={r.actorName} className="rounded-lg border border-border bg-muted/10">
                <button
                  onClick={() => setExpandedActor(expandedActor === r.actorName ? null : r.actorName)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm font-medium text-foreground">{r.actorName}</div>
                      <div className={`text-xs ${dirColor(r.reactionDirection)}`}>{r.reactionDirection}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-medium rounded border px-1.5 py-0.5 ${intensityBadge(r.reactionIntensity)}`}>{r.reactionIntensity}</span>
                    <span className="text-[10px] text-muted-foreground">{r.timeToReact}</span>
                    {expandedActor === r.actorName ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {expandedActor === r.actorName && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Initial Reaction</div>
                      <p className="text-xs text-foreground/80">{r.initialReaction}</p>
                    </div>
                    <div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Behavior Change</div>
                      <p className="text-xs text-foreground/80">{r.behaviorChange}</p>
                    </div>
                    {r.cascadeEffects.length > 0 && (
                      <div>
                        <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Cascade Effects</div>
                        <ul className="space-y-0.5">
                          {r.cascadeEffects.map((e, i) => <li key={i} className="text-xs text-foreground/70">• {e}</li>)}
                        </ul>
                      </div>
                    )}
                    {r.responseConsiderations.length > 0 && (
                      <div>
                        <div className="text-[10px] text-blue-400/70 uppercase tracking-wider mb-1">Response Considerations</div>
                        <ul className="space-y-0.5">
                          {r.responseConsiderations.map((m, i) => <li key={i} className="text-xs text-foreground/70">• {m}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.criticalWatchpoints.length > 0 && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
              <div className="text-[10px] text-red-400 uppercase tracking-wider font-medium mb-1">Critical Watchpoints</div>
              <ul className="space-y-0.5">
                {result.criticalWatchpoints.map((w, i) => <li key={i} className="text-xs text-foreground/70">• {w}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
