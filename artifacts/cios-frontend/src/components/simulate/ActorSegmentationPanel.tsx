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

const INTERACTION_COLORS: Record<string, string> = {
  influences: "text-blue-400",
  blocks: "text-red-400",
  enables: "text-emerald-400",
  competes: "text-amber-400",
  coordinates: "text-violet-400",
};

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

  const sensitivityColor = (s: string) =>
    s === "high" ? "text-red-400" : s === "moderate" ? "text-amber-400" : "text-slate-400";

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
                    <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded border border-border">{actor.timing}</span>
                    {expandedActor === actor.name ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </button>

                {expandedActor === actor.name && (
                  <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Behaviors</div>
                        <ul className="space-y-0.5">
                          {actor.behavioralCharacteristics.map((b, i) => (
                            <li key={i} className="text-xs text-foreground/80">• {b}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Constraints</div>
                        <ul className="space-y-0.5">
                          {actor.constraints.map((c, i) => (
                            <li key={i} className="text-xs text-foreground/80">• {c}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider mb-1">Triggers</div>
                        <ul className="space-y-0.5">
                          {actor.triggers.map((t, i) => (
                            <li key={i} className="text-xs text-foreground/80">• {t}</li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    {actor.signalSensitivity.length > 0 && (
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Signal Sensitivity</div>
                        <div className="space-y-1">
                          {actor.signalSensitivity.map((ss, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                              <span className={`font-medium w-16 ${sensitivityColor(ss.sensitivity)}`}>{ss.sensitivity}</span>
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
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Interactions</div>
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
            <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">System Dynamics</div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-[10px] text-emerald-400/70 uppercase tracking-wider mb-1">Drivers</div>
                <ul className="space-y-0.5">
                  {result.systemDynamics.primaryDrivers.map((d, i) => (
                    <li key={i} className="text-xs text-foreground/80">• {d}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-amber-400/70 uppercase tracking-wider mb-1">Bottlenecks</div>
                <ul className="space-y-0.5">
                  {result.systemDynamics.keyBottlenecks.map((b, i) => (
                    <li key={i} className="text-xs text-foreground/80">• {b}</li>
                  ))}
                </ul>
              </div>
              <div>
                <div className="text-[10px] text-red-400/70 uppercase tracking-wider mb-1">Cascade Risks</div>
                <ul className="space-y-0.5">
                  {result.systemDynamics.cascadeRisks.map((r, i) => (
                    <li key={i} className="text-xs text-foreground/80">• {r}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
