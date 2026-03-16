import { useState } from "react";
import { useRoute } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout";
import { Card, Badge, Button } from "@/components/ui-components";
import { useGetCase } from "@workspace/api-client-react";
import { cn } from "@/lib/cn";
import {
  Users, Play, RefreshCcw, TrendingUp, TrendingDown,
  ChevronRight, AlertTriangle, CheckCircle2, Clock, Zap,
  Shield, Minus, Activity,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type Stance =
  | "early_supporter" | "supportive" | "neutral" | "cautious" | "resistant"
  | "active_opposition" | "increased_pressure" | "monitoring" | "complacent";

interface AgentResult {
  agentId: string;
  label: string;
  role: string;
  stance: Stance;
  reactionScore: number;
  baseReactionScore?: number;
  topSignals: Array<{ description: string; signalType: string; contribution: number }>;
  reasoning: string;
  responsePhase: "early" | "mainstream" | "lagging";
  influenceAnnotations?: Array<{ fromLabel: string; label: string; delta: number }>;
}

interface AdoptionPhase {
  phase: string;
  label: string;
  timeframe: string;
  agents: string[];
}

interface SimulationResult {
  id: string;
  simulationId: string;
  caseId: string;
  agentResults: AgentResult[];
  adoptionSequence: AdoptionPhase[];
  overallReadiness: string;
  signalCount: string;
  simulatedAt: string;
  agentDerivedActorTranslation?: number;
}

// ─── Stance config ──────────────────────────────────────────────────────────
const STANCE_CONFIG: Record<Stance, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  early_supporter: {
    label: "Early Supporter",
    color: "text-success",
    bg: "bg-success/10",
    border: "border-success/25",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  supportive: {
    label: "Supportive",
    color: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/25",
    icon: <TrendingUp className="w-3 h-3" />,
  },
  neutral: {
    label: "Neutral",
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border",
    icon: <Minus className="w-3 h-3" />,
  },
  cautious: {
    label: "Cautious",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    icon: <TrendingDown className="w-3 h-3" />,
  },
  resistant: {
    label: "Resistant",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/25",
    icon: <TrendingDown className="w-3 h-3" />,
  },
  active_opposition: {
    label: "Active Opposition",
    color: "text-destructive",
    bg: "bg-destructive/10",
    border: "border-destructive/25",
    icon: <Shield className="w-3 h-3" />,
  },
  increased_pressure: {
    label: "Increased Pressure",
    color: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/25",
    icon: <AlertTriangle className="w-3 h-3" />,
  },
  monitoring: {
    label: "Monitoring",
    color: "text-muted-foreground",
    bg: "bg-muted/20",
    border: "border-border",
    icon: <Clock className="w-3 h-3" />,
  },
  complacent: {
    label: "Complacent",
    color: "text-muted-foreground/60",
    bg: "bg-muted/10",
    border: "border-border/50",
    icon: <Minus className="w-3 h-3" />,
  },
};

const PHASE_COLORS = {
  early: { dot: "bg-success", text: "text-success", label: "bg-success/10 border-success/20 text-success" },
  mainstream: { dot: "bg-primary", text: "text-primary", label: "bg-primary/10 border-primary/20 text-primary" },
  lagging: { dot: "bg-muted-foreground/40", text: "text-muted-foreground", label: "bg-muted/20 border-border text-muted-foreground" },
};

// Signal types short form
const SIGNAL_SHORT: Record<string, string> = {
  "Phase III clinical": "Ph.III",
  "Guideline inclusion": "Guideline",
  "KOL endorsement": "KOL",
  "Field intelligence": "Field Intel",
  "Operational friction": "Ops Friction",
  "Competitor counteraction": "Competitor",
  "Access / commercial": "Access",
  "Regulatory / clinical": "Regulatory",
};

// ─── Agent Row ───────────────────────────────────────────────────────────────
function AgentRow({ agent, isExpanded, onToggle }: {
  agent: AgentResult;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const stanceCfg = STANCE_CONFIG[agent.stance] ?? STANCE_CONFIG.neutral;
  const phaseCfg = PHASE_COLORS[agent.responsePhase];
  const scoreAbs = Math.abs(agent.reactionScore);
  const scoreWidth = Math.min(100, (scoreAbs / 2.5) * 100);
  const isNegative = agent.reactionScore < 0;
  const isAdversarial = ["active_opposition", "increased_pressure", "monitoring", "complacent"].includes(agent.stance);

  return (
    <>
      <tr
        className="group cursor-pointer hover:bg-muted/20 transition-colors border-b border-border/40"
        onClick={onToggle}
      >
        <td className="px-5 py-4">
          <div>
            <p className="text-sm font-semibold">{agent.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{agent.role}</p>
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={cn(
            "inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
            stanceCfg.bg, stanceCfg.border, stanceCfg.color
          )}>
            {stanceCfg.icon}
            {stanceCfg.label}
          </span>
        </td>
        <td className="px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden w-24">
              <div
                className={cn("h-full rounded-full", isNegative ? "bg-destructive/70" : "bg-success/70")}
                style={{ width: `${scoreWidth}%` }}
              />
            </div>
            <span className={cn("text-xs font-mono font-semibold", isNegative ? "text-destructive" : "text-success")}>
              {isNegative ? "" : "+"}{agent.reactionScore.toFixed(2)}
            </span>
          </div>
        </td>
        <td className="px-5 py-4">
          <span className={cn(
            "text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border",
            phaseCfg.label
          )}>
            {agent.responsePhase === "early" ? "Early" : agent.responsePhase === "mainstream" ? "Mainstream" : "Lagging"}
          </span>
        </td>
        <td className="px-5 py-4">
          <div className="flex flex-wrap gap-1">
            {agent.topSignals.slice(0, 2).map((s, i) => (
              <span
                key={i}
                className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  s.contribution > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                )}
              >
                {SIGNAL_SHORT[s.signalType] ?? s.signalType}
              </span>
            ))}
          </div>
        </td>
        <td className="px-4 py-4 text-right">
          <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground transition-transform", isExpanded && "rotate-90")} />
        </td>
      </tr>
      {isExpanded && (
        <tr className="bg-muted/5 border-b border-border/40">
          <td colSpan={6} className="px-5 pb-5 pt-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Reasoning</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{agent.reasoning}</p>
                {agent.baseReactionScore !== undefined && agent.baseReactionScore !== agent.reactionScore && (
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    Base score (signal-only): {agent.baseReactionScore > 0 ? "+" : ""}{agent.baseReactionScore.toFixed(2)} →
                    After peer influence: {agent.reactionScore > 0 ? "+" : ""}{agent.reactionScore.toFixed(2)}
                  </p>
                )}
              </div>
              {agent.topSignals.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">Top influencing signals</p>
                  <div className="space-y-1.5">
                    {agent.topSignals.map((s, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <span className={cn(
                          "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded mt-0.5",
                          s.contribution > 0 ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"
                        )}>
                          {s.contribution > 0 ? "+" : ""}{s.contribution.toFixed(2)}
                        </span>
                        <p className="text-xs text-muted-foreground leading-snug line-clamp-2">{s.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(agent.influenceAnnotations ?? []).length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
                    Peer-stakeholder influence
                  </p>
                  <div className="space-y-2">
                    {agent.influenceAnnotations!.map((ann, i) => (
                      <div key={i} className={cn(
                        "flex items-start gap-2 p-2 rounded-lg border text-xs",
                        ann.delta > 0
                          ? "bg-success/5 border-success/20 text-success"
                          : "bg-destructive/5 border-destructive/20 text-destructive"
                      )}>
                        <span className="font-bold shrink-0 mt-0.5">
                          {ann.delta > 0 ? "+" : ""}{ann.delta.toFixed(2)}
                        </span>
                        <span className="text-muted-foreground leading-snug">
                          <span className="font-medium text-foreground">{ann.fromLabel}:</span>{" "}
                          {ann.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Adoption Sequence ───────────────────────────────────────────────────────
function AdoptionSequencePanel({ sequence }: { sequence: AdoptionPhase[] }) {
  return (
    <div className="grid grid-cols-3 gap-4">
      {sequence.map((phase) => {
        const cfg = PHASE_COLORS[phase.phase as keyof typeof PHASE_COLORS] ?? PHASE_COLORS.lagging;
        return (
          <div key={phase.phase} className="border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className={cn("w-2 h-2 rounded-full", cfg.dot)} />
              <span className="text-xs font-semibold">{phase.label}</span>
              <span className="text-[10px] text-muted-foreground ml-auto">{phase.timeframe}</span>
            </div>
            {phase.agents.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No agents in this phase</p>
            ) : (
              <ul className="space-y-1.5">
                {phase.agents.map((agent) => (
                  <li key={agent} className="text-xs flex items-center gap-1.5">
                    <div className={cn("w-1 h-1 rounded-full shrink-0", cfg.dot)} />
                    {agent}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Signal×Agent Matrix ─────────────────────────────────────────────────────
const SIGNAL_TYPES_LIST = [
  "Phase III clinical",
  "Guideline inclusion",
  "KOL endorsement",
  "Field intelligence",
  "Operational friction",
  "Competitor counteraction",
  "Access / commercial",
  "Regulatory / clinical",
];

const SIGNAL_WEIGHTS: Record<string, Record<string, number>> = {
  "Phase III clinical":       { academic_specialist: 1.0, community_specialist: 0.6, inpatient_prescriber: 0.65, payer: 0.55, guideline_body: 0.95, competitor: 0.8,  commercial_msl: 0.55 },
  "Guideline inclusion":      { academic_specialist: 0.75, community_specialist: 0.85, inpatient_prescriber: 0.9, payer: 0.6, guideline_body: 1.0, competitor: 0.5, commercial_msl: 0.65 },
  "KOL endorsement":          { academic_specialist: 0.5, community_specialist: 0.9, inpatient_prescriber: 0.55, payer: 0.2, guideline_body: 0.45, competitor: 0.35, commercial_msl: 0.8 },
  "Field intelligence":       { academic_specialist: 0.25, community_specialist: 0.65, inpatient_prescriber: 0.5, payer: 0.3, guideline_body: 0.2, competitor: 0.45, commercial_msl: 0.9 },
  "Operational friction":     { academic_specialist: 0.2, community_specialist: 0.55, inpatient_prescriber: 0.85, payer: 0.45, guideline_body: 0.35, competitor: 0.3, commercial_msl: 0.75 },
  "Competitor counteraction": { academic_specialist: 0.4, community_specialist: 0.5, inpatient_prescriber: 0.45, payer: 0.35, guideline_body: 0.3, competitor: 1.0, commercial_msl: 0.65 },
  "Access / commercial":      { academic_specialist: 0.25, community_specialist: 0.75, inpatient_prescriber: 0.8, payer: 1.0, guideline_body: 0.4, competitor: 0.2, commercial_msl: 0.7 },
  "Regulatory / clinical":    { academic_specialist: 0.6, community_specialist: 0.45, inpatient_prescriber: 0.65, payer: 0.8, guideline_body: 0.9, competitor: 0.25, commercial_msl: 0.4 },
};

const AGENT_COLUMNS = [
  { id: "academic_specialist", short: "Academic KOL" },
  { id: "community_specialist", short: "Community Sp." },
  { id: "inpatient_prescriber", short: "Inpatient" },
  { id: "payer", short: "Payer" },
  { id: "guideline_body", short: "Guideline" },
  { id: "competitor", short: "Competitor" },
  { id: "commercial_msl", short: "Field Force" },
];

function heatColor(w: number): string {
  if (w >= 0.85) return "bg-success/30 text-success font-bold";
  if (w >= 0.65) return "bg-success/15 text-success";
  if (w >= 0.4) return "bg-muted/30 text-muted-foreground";
  return "bg-muted/10 text-muted-foreground/50";
}

function InfluenceMatrix({ activeSignalTypes }: { activeSignalTypes: Set<string> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs text-left border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold sticky left-0 bg-background border-b border-border min-w-[160px]">Signal type</th>
            {AGENT_COLUMNS.map((a) => (
              <th key={a.id} className="px-3 py-2 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold text-center border-b border-border whitespace-nowrap">{a.short}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {SIGNAL_TYPES_LIST.map((sig) => {
            const isActive = activeSignalTypes.has(sig);
            return (
              <tr key={sig} className={cn("border-b border-border/30", isActive && "ring-1 ring-inset ring-primary/20")}>
                <td className={cn(
                  "px-3 py-2 font-medium sticky left-0 bg-background whitespace-nowrap",
                  isActive ? "text-foreground" : "text-muted-foreground/60"
                )}>
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block mr-1.5 mb-0.5" />}
                  {sig}
                </td>
                {AGENT_COLUMNS.map((a) => {
                  const w = SIGNAL_WEIGHTS[sig]?.[a.id] ?? 0;
                  return (
                    <td key={a.id} className="px-3 py-2 text-center">
                      <span className={cn("inline-block px-2 py-0.5 rounded text-[10px]", heatColor(w))}>
                        {w.toFixed(2)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function AgentSimulation() {
  const [, params] = useRoute("/cases/:caseId/agents");
  const caseId = params?.caseId ?? "";
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showMatrix, setShowMatrix] = useState(false);

  const queryClient = useQueryClient();
  const { data: caseData } = useGetCase(caseId);
  const cd = caseData as any;

  const { data: simulation, isLoading } = useQuery<SimulationResult | null>({
    queryKey: [`/api/cases/${caseId}/simulation`],
    queryFn: () => fetch(`/api/cases/${caseId}/simulation`).then((r) => r.json()),
    refetchOnWindowFocus: false,
  });

  const { mutate: runSimulation, isPending: isRunning } = useMutation({
    mutationFn: () =>
      fetch(`/api/cases/${caseId}/simulation`, { method: "POST" }).then((r) => {
        if (!r.ok) return r.json().then((e) => Promise.reject(e));
        return r.json();
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/cases/${caseId}/simulation`] });
    },
  });

  const [runError, setRunError] = useState<string | null>(null);

  const handleRun = () => {
    setRunError(null);
    (runSimulation as any)(undefined, {
      onError: (err: any) => setRunError(err?.error ?? "Simulation failed"),
    });
  };

  const hasSimulation = simulation && simulation.agentResults?.length > 0;

  const activeSignalTypes = hasSimulation
    ? new Set(simulation.agentResults.flatMap((a) => a.topSignals.map((s) => s.signalType)))
    : new Set<string>();

  // Sort: non-adversarial first by score desc, adversarial last
  const sortedResults = hasSimulation
    ? [...simulation.agentResults].sort((a, b) => {
        const aAdv = ["active_opposition", "increased_pressure", "monitoring", "complacent"].includes(a.stance);
        const bAdv = ["active_opposition", "increased_pressure", "monitoring", "complacent"].includes(b.stance);
        if (aAdv !== bAdv) return aAdv ? 1 : -1;
        return b.reactionScore - a.reactionScore;
      })
    : [];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="primary">{caseId}</Badge>
              <span className="text-sm font-medium text-muted-foreground">
                {cd?.assetName ?? cd?.primaryBrand}
              </span>
            </div>
            <h1 className="text-3xl font-bold">Agent Simulation</h1>
            <p className="text-muted-foreground mt-1">
              Models how each stakeholder group reacts to the current signal mix and predicts adoption sequence.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {hasSimulation && (
              <span className="text-[10px] text-muted-foreground">
                Last run: {new Date(simulation.simulatedAt).toLocaleDateString()} · {simulation.signalCount} signals
              </span>
            )}
            <Button
              onClick={handleRun}
              disabled={isRunning}
              className="gap-2"
            >
              {isRunning ? (
                <><RefreshCcw className="w-4 h-4 animate-spin" /> Running…</>
              ) : hasSimulation ? (
                <><RefreshCcw className="w-4 h-4" /> Re-run Simulation</>
              ) : (
                <><Play className="w-4 h-4" /> Run Simulation</>
              )}
            </Button>
          </div>
        </div>

        {runError && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-destructive/30 bg-destructive/10 text-sm text-destructive">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {runError}
          </div>
        )}

        {/* No simulation yet */}
        {!hasSimulation && !isLoading && (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border rounded-2xl bg-muted/10">
            <Users className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No simulation run yet</p>
            <p className="text-xs text-muted-foreground/70 mt-1 max-w-sm">
              Add signals to the Signal Register first, then click Run Simulation to model how each stakeholder group will react.
            </p>
          </div>
        )}

        {hasSimulation && (
          <>
            {/* Overall readiness */}
            <Card>
              <div className="flex items-start gap-3">
                <Activity className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground mb-1">Overall Adoption Readiness</p>
                  <p className="text-sm font-medium leading-relaxed">{simulation.overallReadiness}</p>
                </div>
              </div>
            </Card>

            {/* Agent-by-agent table */}
            <div>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stakeholder Reactions</span>
                <span className="text-xs text-muted-foreground">({sortedResults.length} agents · click row for detail)</span>
              </div>
              <Card noPadding>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/20 border-b border-border">
                      <tr>
                        <th className="px-5 py-3 font-semibold">Stakeholder</th>
                        <th className="px-5 py-3 font-semibold">Stance</th>
                        <th className="px-5 py-3 font-semibold">Reaction strength</th>
                        <th className="px-5 py-3 font-semibold">Movement phase</th>
                        <th className="px-5 py-3 font-semibold">Key drivers</th>
                        <th className="px-4 py-3 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {/* Separator between prescribers/payers and competitor */}
                      {sortedResults.map((agent, idx) => {
                        const isAdv = ["active_opposition", "increased_pressure", "monitoring", "complacent"].includes(agent.stance);
                        const prevAdv = idx > 0 && ["active_opposition", "increased_pressure", "monitoring", "complacent"].includes(sortedResults[idx - 1].stance);
                        return (
                          <>
                            {isAdv && !prevAdv && (
                              <tr key="sep" className="bg-muted/5">
                                <td colSpan={6} className="px-5 py-1.5">
                                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Adversarial stakeholders — barrier assessment</span>
                                </td>
                              </tr>
                            )}
                            <AgentRow
                              key={agent.agentId}
                              agent={agent}
                              isExpanded={expandedId === agent.agentId}
                              onToggle={() => setExpandedId(expandedId === agent.agentId ? null : agent.agentId)}
                            />
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Adoption sequence */}
            <div>
              <div className="flex items-center gap-2 mb-3 px-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Adoption Sequence</span>
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Predicted order of stakeholder movement</span>
              </div>
              <AdoptionSequencePanel sequence={simulation.adoptionSequence} />
            </div>

            {/* Signal × Agent influence matrix */}
            <div>
              <button
                onClick={() => setShowMatrix((v) => !v)}
                className="flex items-center gap-2 px-1 mb-3 group"
              >
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider group-hover:text-foreground transition-colors">Signal × Stakeholder Influence Matrix</span>
                <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", showMatrix && "rotate-90")} />
                <span className="text-[10px] text-muted-foreground">(how much each signal type moves each stakeholder)</span>
              </button>
              {showMatrix && (
                <Card noPadding>
                  <InfluenceMatrix activeSignalTypes={activeSignalTypes} />
                </Card>
              )}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
