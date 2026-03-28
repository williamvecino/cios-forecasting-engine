import { useState } from "react";
import { Loader2, ListOrdered, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Clock, Eye, Zap, Shield } from "lucide-react";

interface PrioritizedAction {
  rank: number;
  action: string;
  category: "investigate" | "prepare" | "execute" | "monitor" | "hedge";
  leverage: "high" | "moderate" | "low";
  urgency: "immediate" | "near-term" | "watch";
  rationale: string;
  dependsOn: string[];
  riskIfDelayed: string;
  ownerRole: string;
  timeframe: string;
}

interface DecisionReadiness {
  score: number;
  gaps: string[];
  recommendation: string;
}

interface PrioritizationResult {
  prioritizedActions: PrioritizedAction[];
  decisionReadiness: DecisionReadiness;
  nextReviewTrigger: string;
}

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return "/api";
}

const CATEGORY_CONFIG: Record<string, { icon: typeof Zap; color: string; label: string }> = {
  investigate: { icon: Eye, color: "text-blue-400", label: "Investigate" },
  prepare: { icon: Clock, color: "text-amber-400", label: "Prepare" },
  execute: { icon: Zap, color: "text-emerald-400", label: "Execute" },
  monitor: { icon: Eye, color: "text-violet-400", label: "Monitor" },
  hedge: { icon: Shield, color: "text-red-400", label: "Hedge" },
};

export function PrioritizationPanel({ question, probability, signals, actors, context }: {
  question: string;
  probability?: number;
  signals?: Array<{ text: string; direction: string; strength: string }>;
  actors?: Array<{ name: string; influenceWeight: number }>;
  context?: string;
}) {
  const [result, setResult] = useState<PrioritizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAction, setExpandedAction] = useState<number | null>(null);

  async function runPrioritization() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/agents/prioritization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, probability, signals, actors, context }),
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

  const urgencyColor = (u: string) =>
    u === "immediate" ? "bg-red-500/10 text-red-400 border-red-500/20" :
    u === "near-term" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
    "bg-slate-500/10 text-slate-400 border-slate-500/20";

  const leverageColor = (l: string) =>
    l === "high" ? "text-emerald-400" : l === "moderate" ? "text-amber-400" : "text-slate-400";

  const readinessColor = (score: number) =>
    score >= 70 ? "text-emerald-400" : score >= 40 ? "text-amber-400" : "text-red-400";

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <ListOrdered className="w-4 h-4 text-amber-400" />
          <h3 className="text-sm font-bold text-foreground">Action Prioritization</h3>
          <span className="text-xs text-muted-foreground">Ranked by leverage and urgency</span>
        </div>
        {!result && (
          <button
            onClick={runPrioritization}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 text-xs font-medium text-amber-400 hover:bg-amber-500/20 transition disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ListOrdered className="w-3 h-3" />}
            {loading ? "Ranking actions..." : "Prioritize Actions"}
          </button>
        )}
      </div>

      {error && (
        <div className="px-5 py-3 text-xs text-red-400 bg-red-500/5">{error}</div>
      )}

      {result && (
        <div className="p-5 space-y-5">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-slate-800/50 border border-border px-4 py-3 flex items-center gap-3">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Decision Readiness</div>
                <div className={`text-2xl font-bold ${readinessColor(result.decisionReadiness.score)}`}>
                  {result.decisionReadiness.score}<span className="text-sm font-normal text-muted-foreground">/100</span>
                </div>
              </div>
            </div>
            <div className="flex-1">
              <p className="text-xs text-foreground/80 leading-relaxed">{result.decisionReadiness.recommendation}</p>
              {result.decisionReadiness.gaps.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {result.decisionReadiness.gaps.map((g, i) => (
                    <span key={i} className="text-[10px] text-amber-400/80 bg-amber-500/10 border border-amber-500/15 rounded px-1.5 py-0.5">{g}</span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            {result.prioritizedActions.map((action) => {
              const cfg = CATEGORY_CONFIG[action.category] || CATEGORY_CONFIG.monitor;
              const Icon = cfg.icon;
              return (
                <div key={action.rank} className="rounded-lg border border-border bg-muted/10">
                  <button
                    onClick={() => setExpandedAction(expandedAction === action.rank ? null : action.rank)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/10 text-amber-400 text-xs font-bold">
                        #{action.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground">{action.action}</div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-medium ${cfg.color}`}>
                            <Icon className="w-2.5 h-2.5 inline mr-0.5" />
                            {cfg.label}
                          </span>
                          <span className={`text-[10px] font-medium ${leverageColor(action.leverage)}`}>
                            Leverage: {action.leverage}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-medium rounded border px-2 py-0.5 ${urgencyColor(action.urgency)}`}>
                        {action.urgency}
                      </span>
                      {expandedAction === action.rank ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </button>

                  {expandedAction === action.rank && (
                    <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
                      <div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Rationale</div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{action.rationale}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Owner</div>
                          <div className="text-xs text-foreground/90">{action.ownerRole}</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Timeframe</div>
                          <div className="text-xs text-foreground/90">{action.timeframe}</div>
                        </div>
                      </div>
                      <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3">
                        <div className="flex items-center gap-1.5 mb-1">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          <span className="text-[10px] text-red-400 uppercase tracking-wider font-medium">Risk if Delayed</span>
                        </div>
                        <p className="text-xs text-foreground/70">{action.riskIfDelayed}</p>
                      </div>
                      {action.dependsOn.length > 0 && (
                        <div>
                          <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Depends On</div>
                          <div className="flex flex-wrap gap-1">
                            {action.dependsOn.map((d, i) => (
                              <span key={i} className="text-[10px] text-violet-400/80 bg-violet-500/10 border border-violet-500/15 rounded px-1.5 py-0.5">{d}</span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="rounded-lg bg-blue-500/5 border border-blue-500/15 p-3">
            <div className="text-[10px] text-blue-400 uppercase tracking-wider font-medium mb-1">Next Review Trigger</div>
            <p className="text-xs text-foreground/80">{result.nextReviewTrigger}</p>
          </div>
        </div>
      )}
    </div>
  );
}
