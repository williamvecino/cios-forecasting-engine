import { useState } from "react";
import { Loader2, Users, ChevronDown, ChevronUp, ArrowRight } from "lucide-react";

interface SignalSensitivity {
  signalType: string;
  sensitivity: "high" | "moderate" | "low";
  expectedReaction: string;
}

interface Interaction {
  targetActor: string;
  interactionType: "influences" | "blocks" | "enables" | "competes" | "coordinates";
  description: string;
}

interface ActorSegment {
  name: string;
  role: string;
  behavioralCharacteristics: string[];
  constraints: string[];
  triggers: string[];
  influenceWeight: number;
  timing: string;
  signalSensitivity: SignalSensitivity[];
  interactions: Interaction[];
}

interface ActorSegmentationResult {
  actors: ActorSegment[];
  systemDynamics: {
    primaryDrivers: string[];
    keyBottlenecks: string[];
    cascadeRisks: string[];
  };
  totalActors: number;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

const SEMANTIC_COLORS = {
  constraint: "text-red-400 bg-red-400/10 border-red-400/20",
  sensitivity: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20",
  driver: "text-green-400 bg-green-400/10 border-green-400/20",
  interaction: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

const INTERACTION_COLORS: Record<string, string> = {
  influences: "text-blue-400",
  blocks: "text-blue-300",
  enables: "text-blue-400",
  competes: "text-blue-300",
  coordinates: "text-blue-400",
};

function buildCausalChains(dynamics: ActorSegmentationResult["systemDynamics"]) {
  const chains: Array<{ driver: string; constraint: string | null; outcome: string | null }> = [];
  const minLen = Math.min(
    dynamics.primaryDrivers.length,
    dynamics.keyBottlenecks.length,
    dynamics.cascadeRisks.length
  );
  for (let i = 0; i < minLen; i++) {
    chains.push({
      driver: dynamics.primaryDrivers[i],
      constraint: dynamics.keyBottlenecks[i],
      outcome: dynamics.cascadeRisks[i],
    });
  }
  for (let i = minLen; i < dynamics.primaryDrivers.length; i++) {
    chains.push({
      driver: dynamics.primaryDrivers[i],
      constraint: dynamics.keyBottlenecks[i] || null,
      outcome: dynamics.cascadeRisks[i] || null,
    });
  }
  return chains;
}

export function ActorSegmentationPanel({ question, brand, therapeuticArea, signals, context }: {
  question: string;
  brand?: string;
  therapeuticArea?: string;
  signals?: Array<{ text: string; direction: string }>;
  context?: string;
}) {
  const [result, setResult] = useState<ActorSegmentationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedActor, setExpandedActor] = useState<string | null>(null);

  async function runSegmentation() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/actor-segmentation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, brand, therapeuticArea, signals, context }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setResult(data);
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
          <Users className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-foreground">Actor Segmentation</h3>
          <span className="text-xs text-muted-foreground">Market actors & system dynamics</span>
        </div>
        {!result && (
          <button
            onClick={runSegmentation}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-400 hover:bg-cyan-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Users className="w-3 h-3" />}
            {loading ? "Identifying actors..." : "Map Actors"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>
      )}

      {result && (
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-muted-foreground">Actors identified: <span className="text-foreground font-medium">{result.totalActors}</span></span>
          </div>

          <div className="space-y-2">
            {result.actors.map((actor) => (
              <div key={actor.name} className="rounded-lg border border-border bg-muted/10">
                <button
                  onClick={() => setExpandedActor(expandedActor === actor.name ? null : actor.name)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-cyan-500/10">
                      <div className="text-center">
                        <div className="text-xs font-bold text-cyan-400">{actor.influenceWeight}</div>
                        <div className="text-[8px] text-cyan-400/50">weight</div>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-foreground">{actor.name}</div>
                      <div className="text-xs text-muted-foreground">{actor.role}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {actor.triggers[0] && (
                      <span className={`text-[10px] px-2 py-0.5 rounded border ${SEMANTIC_COLORS.driver}`}>
                        {actor.triggers[0]}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded border border-border">{actor.timing}</span>
                    {expandedActor === actor.name ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {expandedActor === actor.name && (
                  <div className="px-4 pb-4 space-y-4 border-t border-border pt-3">
                    <div>
                      <div className={`text-[10px] uppercase tracking-wider mb-1.5 font-medium ${SEMANTIC_COLORS.driver.split(' ')[0]}`}>Behaviors</div>
                      <ul className="space-y-1">
                        {actor.behavioralCharacteristics.map((b, i) => (
                          <li key={i} className="text-xs text-foreground/80">• {b}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className={`text-[10px] uppercase tracking-wider mb-1.5 font-medium ${SEMANTIC_COLORS.constraint.split(' ')[0]}`}>Constraints</div>
                      <ul className="space-y-1">
                        {actor.constraints.map((c, i) => (
                          <li key={i} className="text-xs text-foreground/80">• {c}</li>
                        ))}
                      </ul>
                    </div>

                    <div>
                      <div className={`text-[10px] uppercase tracking-wider mb-1.5 font-medium ${SEMANTIC_COLORS.driver.split(' ')[0]}`}>Triggers</div>
                      <ul className="space-y-1">
                        {actor.triggers.map((t, i) => (
                          <li key={i} className="text-xs text-foreground/80">• {t}</li>
                        ))}
                      </ul>
                    </div>

                    {actor.signalSensitivity.length > 0 && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-1.5 font-medium ${SEMANTIC_COLORS.sensitivity.split(' ')[0]}`}>Signal Sensitivity</div>
                        <div className="space-y-1">
                          {actor.signalSensitivity.map((ss, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`font-medium px-1.5 py-0.5 rounded text-[10px] ${
                                ss.sensitivity === "high" ? "text-yellow-300 bg-yellow-400/15 border-yellow-400/30 font-bold"
                                  : ss.sensitivity === "moderate" ? SEMANTIC_COLORS.sensitivity
                                  : "text-yellow-400/50 bg-yellow-400/5"
                              }`}>{ss.sensitivity}</span>
                              <span className="text-foreground/70">{ss.signalType}</span>
                              <span className="text-muted-foreground/40">→</span>
                              <span className="text-foreground/50">{ss.expectedReaction}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {actor.interactions.length > 0 && (
                      <div>
                        <div className={`text-[10px] uppercase tracking-wider mb-1.5 font-medium ${SEMANTIC_COLORS.interaction.split(' ')[0]}`}>Interactions</div>
                        <div className="space-y-1">
                          {actor.interactions.map((int, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`font-medium ${INTERACTION_COLORS[int.interactionType] || "text-slate-400"}`}>{int.interactionType}</span>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/30" />
                              <span className="text-foreground/90">{int.targetActor}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-slate-800/50 border border-border p-4 space-y-3">
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Dynamics — Causal Chains</div>
            <div className="space-y-2">
              {buildCausalChains(result.systemDynamics).map((chain, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg bg-muted/5 px-3 py-2.5 text-xs flex-wrap">
                  <span className={`font-medium px-2 py-0.5 rounded border ${SEMANTIC_COLORS.driver}`}>{chain.driver}</span>
                  {chain.constraint && (
                    <>
                      <span className="text-muted-foreground/60 font-mono">→</span>
                      <span className={`font-medium px-2 py-0.5 rounded border ${SEMANTIC_COLORS.constraint}`}>{chain.constraint}</span>
                    </>
                  )}
                  {chain.outcome && (
                    <>
                      <span className="text-muted-foreground/60 font-mono">→</span>
                      <span className={`font-medium px-2 py-0.5 rounded border ${SEMANTIC_COLORS.sensitivity}`}>{chain.outcome}</span>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-4 pt-2 border-t border-border/30 text-[9px] text-muted-foreground/60">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400"></span> Driver</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400"></span> Constraint</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400"></span> Outcome / Sensitivity</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Interaction</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
