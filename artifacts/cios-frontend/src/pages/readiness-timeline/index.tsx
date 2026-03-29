import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  ArrowLeft,
  Clock,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  Ban,
  Zap,
  Shield,
  Target,
  Layers,
  RefreshCw,
  ArrowRight,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface Milestone {
  id: string;
  readinessId: string;
  caseId: string;
  segmentId: string | null;
  segmentName: string | null;
  milestoneName: string;
  milestoneCategory: string;
  expectedTimeWindow: string;
  currentStatus: string;
  readinessScore: number;
  gatingBarriers: string;
  requiredSignals: string;
  supportingSignals: string;
  counterSignals: string;
  accelerators: string;
  delayRisks: string;
  estimatedImpactOnAdoption: number;
  confidenceLevel: string;
  priorityRank: number;
  dependsOnMilestones: string;
  rationaleSummary: string;
  derivedFrom: string;
  createdAt: string | null;
}

interface CaseOption {
  caseId: string;
  assetName: string;
  primaryBrand: string;
  strategicQuestion: string;
}

const TIME_WINDOW_ORDER = ["now", "0-3 months", "3-6 months", "6-12 months", "12-18 months", "18+ months"];
const TIME_WINDOW_LABELS: Record<string, string> = {
  "now": "Now / Immediate",
  "0-3 months": "0–3 months",
  "3-6 months": "3–6 months",
  "6-12 months": "6–12 months",
  "12-18 months": "12–18 months",
  "18+ months": "18+ months",
};
const TIME_WINDOW_COLORS: Record<string, string> = {
  "now": "#34d399",
  "0-3 months": "#4ade80",
  "3-6 months": "#fbbf24",
  "6-12 months": "#fb923c",
  "12-18 months": "#f87171",
  "18+ months": "#94a3b8",
};

const STATUS_CONFIG: Record<string, { label: string; icon: any; color: string; bg: string }> = {
  substantially_ready: { label: "Ready", icon: CheckCircle2, color: "text-emerald-400", bg: "bg-emerald-500/20 border-emerald-500/30" },
  on_track: { label: "On Track", icon: Target, color: "text-blue-400", bg: "bg-blue-500/20 border-blue-500/30" },
  blocked_but_unlockable: { label: "Blocked — Unlockable", icon: Unlock, color: "text-amber-400", bg: "bg-amber-500/20 border-amber-500/30" },
  blocked: { label: "Blocked", icon: Lock, color: "text-red-400", bg: "bg-red-500/20 border-red-500/30" },
  unlikely_within_horizon: { label: "Unlikely Near-Term", icon: Ban, color: "text-slate-400", bg: "bg-slate-500/20 border-slate-500/30" },
};

const CATEGORY_LABELS: Record<string, string> = {
  evidence_consolidation: "Evidence Consolidation",
  guideline_movement: "Guideline Movement",
  access_reimbursement: "Access / Reimbursement",
  workflow_readiness: "Operational / Workflow",
  kol_diffusion: "KOL / Peer Diffusion",
  community_translation: "Community Translation",
  competitive_displacement: "Competitive Displacement",
  supply_manufacturing: "Supply / Manufacturing",
  field_readiness: "Sales / Field Readiness",
  account_pathway: "Account Pathway",
};

function safeJSON(val: string | null | undefined): any[] {
  if (!val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

function ReadinessBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#34d399" : pct >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-xs font-medium" style={{ color }}>{pct}%</span>
    </div>
  );
}

function MilestoneCard({ milestone, isExpanded, onToggle }: { milestone: Milestone; isExpanded: boolean; onToggle: () => void }) {
  const statusCfg = STATUS_CONFIG[milestone.currentStatus] ?? STATUS_CONFIG.blocked;
  const StatusIcon = statusCfg.icon;
  const gatingBarriers = safeJSON(milestone.gatingBarriers);
  const supportingSignals = safeJSON(milestone.supportingSignals);
  const counterSignals = safeJSON(milestone.counterSignals);
  const accelerators = safeJSON(milestone.accelerators);
  const delayRisks = safeJSON(milestone.delayRisks);
  const requiredSignals = safeJSON(milestone.requiredSignals);
  const dependencies = safeJSON(milestone.dependsOnMilestones);

  return (
    <div className={`border rounded-xl transition-all ${isExpanded ? "bg-white/[0.04] border-cyan-500/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}>
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <StatusIcon className={`w-4 h-4 flex-shrink-0 ${statusCfg.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-slate-200">{CATEGORY_LABELS[milestone.milestoneCategory] ?? milestone.milestoneCategory}</span>
            {milestone.segmentName && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400">{milestone.segmentName}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${statusCfg.bg} ${statusCfg.color}`}>{statusCfg.label}</span>
            <span className="text-xs text-slate-500">{milestone.confidenceLevel} confidence</span>
            {gatingBarriers.length > 0 && (
              <span className="text-xs text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {gatingBarriers.length} gating
              </span>
            )}
          </div>
        </div>
        <div className="flex-shrink-0 w-24">
          <ReadinessBar score={milestone.readinessScore} />
        </div>
        {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-white/5 pt-3">
          <div className="text-sm text-slate-400 leading-relaxed">{milestone.rationaleSummary}</div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-white/[0.03] rounded-lg p-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Time Window</div>
              <div className="text-sm font-medium mt-0.5" style={{ color: TIME_WINDOW_COLORS[milestone.expectedTimeWindow] ?? "#94a3b8" }}>
                {TIME_WINDOW_LABELS[milestone.expectedTimeWindow] ?? milestone.expectedTimeWindow}
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Readiness</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">{(milestone.readinessScore * 100).toFixed(0)}%</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Impact if Achieved</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">+{(milestone.estimatedImpactOnAdoption * 100).toFixed(1)}pp</div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-2.5">
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">Confidence</div>
              <div className="text-sm font-medium text-slate-200 mt-0.5">{milestone.confidenceLevel}</div>
            </div>
          </div>

          {dependencies.length > 0 && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-2.5">
              <div className="text-[10px] text-indigo-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Layers className="w-3 h-3" /> Depends On
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dependencies.map((dep: string) => (
                  <span key={dep} className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/20 text-indigo-300">
                    {CATEGORY_LABELS[dep] ?? dep}
                  </span>
                ))}
              </div>
            </div>
          )}

          {gatingBarriers.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5">
              <div className="text-[10px] text-red-300 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Lock className="w-3 h-3" /> Gating Barriers
              </div>
              <div className="space-y-1.5">
                {gatingBarriers.map((b: any, i: number) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                    <span className="text-xs text-slate-300 flex-1">{b.name || b.category}</span>
                    <span className="text-[10px] text-red-400">{(b.strength * 100).toFixed(0)}%</span>
                    {b.isStructural === "yes" && <span className="text-[10px] text-red-500 bg-red-500/10 px-1 rounded">structural</span>}
                    {b.removalDifficulty && <span className="text-[10px] text-slate-500">{b.removalDifficulty}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {accelerators.length > 0 && (
              <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-2.5">
                <div className="text-[10px] text-emerald-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <Zap className="w-3 h-3" /> Accelerators
                </div>
                <ul className="space-y-1">
                  {accelerators.map((a: string, i: number) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <ArrowRight className="w-3 h-3 text-emerald-400 mt-0.5 flex-shrink-0" />
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {delayRisks.length > 0 && (
              <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-2.5">
                <div className="text-[10px] text-orange-300 uppercase tracking-wider mb-1 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Delay Risks
                </div>
                <ul className="space-y-1">
                  {delayRisks.map((d: string, i: number) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-1.5">
                      <AlertTriangle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {supportingSignals.length > 0 && (
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Supporting Signals</div>
              <div className="space-y-1">
                {supportingSignals.map((s: any, i: number) => (
                  <div key={i} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="text-emerald-400">+</span>
                    <span className="flex-1">{s.description}</span>
                    <span className="text-slate-500 text-[10px]">{s.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {counterSignals.length > 0 && (
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Counter-Signals</div>
              <div className="space-y-1">
                {counterSignals.map((s: any, i: number) => (
                  <div key={i} className="text-xs text-slate-300 flex items-center gap-2">
                    <span className="text-red-400">−</span>
                    <span className="flex-1">{s.description}</span>
                    <span className="text-slate-500 text-[10px]">{s.type}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {requiredSignals.length > 0 && (
            <div className="bg-white/[0.02] border border-white/5 rounded-lg p-2.5">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Required Signals</div>
              <ul className="space-y-1">
                {requiredSignals.map((r: string, i: number) => (
                  <li key={i} className="text-xs text-amber-300 flex items-start gap-1.5">
                    <Target className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {r}
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

export default function ReadinessTimelinePage() {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [view, setView] = useState<"overall" | "segment">("overall");
  const [selectedSegment, setSelectedSegment] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: cases = [] } = useQuery<CaseOption[]>({
    queryKey: ["cases-list"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/cases`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeCaseId = selectedCaseId || (cases.length > 0 ? cases[0].caseId : "");

  const { data: milestones = [], isLoading } = useQuery<Milestone[]>({
    queryKey: ["readiness-timeline", activeCaseId],
    queryFn: async () => {
      if (!activeCaseId) return [];
      const r = await fetch(`${API}/api/cases/${activeCaseId}/readiness-timeline`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeCaseId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/readiness-timeline/generate`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Generation failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["readiness-timeline", activeCaseId] });
    },
  });

  const overallMilestones = useMemo(() => milestones.filter(m => !m.segmentId), [milestones]);
  const segmentMilestones = useMemo(() => milestones.filter(m => m.segmentId), [milestones]);
  const segmentNames = useMemo(() => [...new Set(segmentMilestones.map(m => m.segmentName).filter(Boolean))] as string[], [segmentMilestones]);

  const displayMilestones = useMemo(() => {
    if (view === "overall") return overallMilestones;
    if (selectedSegment === "all") return segmentMilestones;
    return segmentMilestones.filter(m => m.segmentName === selectedSegment);
  }, [view, overallMilestones, segmentMilestones, selectedSegment]);

  const groupedByWindow = useMemo(() => {
    const groups: Record<string, Milestone[]> = {};
    for (const tw of TIME_WINDOW_ORDER) {
      const items = displayMilestones.filter(m => m.expectedTimeWindow === tw);
      if (items.length > 0) groups[tw] = items;
    }
    return groups;
  }, [displayMilestones]);

  const overallReadiness = overallMilestones.length > 0
    ? overallMilestones.reduce((s, m) => s + m.readinessScore, 0) / overallMilestones.length
    : 0;

  const readyNow = overallMilestones.filter(m => m.currentStatus === "substantially_ready").length;
  const blocked = overallMilestones.filter(m => m.currentStatus === "blocked" || m.currentStatus === "unlikely_within_horizon").length;
  const unlockable = overallMilestones.filter(m => m.currentStatus === "blocked_but_unlockable").length;

  const timeDistData = useMemo(() => {
    return TIME_WINDOW_ORDER.map(tw => ({
      window: TIME_WINDOW_LABELS[tw] ?? tw,
      count: overallMilestones.filter(m => m.expectedTimeWindow === tw).length,
      key: tw,
    })).filter(d => d.count > 0);
  }, [overallMilestones]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#10101c] to-[#0c0c18] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forecast" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Clock className="w-6 h-6 text-cyan-400" />
          <h1 className="text-2xl font-bold tracking-tight">Readiness Timeline</h1>
        </div>
        <p className="text-slate-400 text-sm -mt-2 ml-11">
          When adoption is likely to move, what must change first, and in what sequence. Derived from forecast, segments, barriers, and signals.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Case</label>
            <select
              value={activeCaseId}
              onChange={e => { setSelectedCaseId(e.target.value); setExpandedId(null); }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 min-w-[280px]"
            >
              {cases.map(c => (
                <option key={c.caseId} value={c.caseId} className="bg-slate-900">
                  {c.assetName || c.primaryBrand || c.caseId}: {(c.strategicQuestion || "").slice(0, 60)}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => generateMutation.mutate()}
            disabled={!activeCaseId || generateMutation.isPending}
            className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${generateMutation.isPending ? "animate-spin" : ""}`} />
            {generateMutation.isPending ? "Generating…" : milestones.length > 0 ? "Regenerate" : "Generate Timeline"}
          </button>
        </div>

        {generateMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2 text-sm text-red-300">
            {(generateMutation.error as Error).message}
          </div>
        )}

        {milestones.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Overall Readiness</div>
                <div className="mt-2"><ReadinessBar score={overallReadiness} /></div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Ready Now</div>
                <div className="text-2xl font-bold text-emerald-400 mt-1">{readyNow}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Blocked — Unlockable</div>
                <div className="text-2xl font-bold text-amber-400 mt-1">{unlockable}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Blocked</div>
                <div className="text-2xl font-bold text-red-400 mt-1">{blocked}</div>
              </div>
            </div>

            {timeDistData.length > 0 && (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Milestones by Time Window
                </h2>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={timeDistData} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis dataKey="window" tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                    <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} barSize={32}>
                      {timeDistData.map(d => (
                        <Cell key={d.key} fill={TIME_WINDOW_COLORS[d.key] ?? "#94a3b8"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex items-center gap-2">
              <button
                onClick={() => { setView("overall"); setSelectedSegment("all"); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "overall" ? "bg-cyan-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                Overall Timeline
              </button>
              <button
                onClick={() => setView("segment")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${view === "segment" ? "bg-cyan-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
              >
                By Segment
              </button>

              {view === "segment" && segmentNames.length > 0 && (
                <select
                  value={selectedSegment}
                  onChange={e => setSelectedSegment(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 ml-2"
                >
                  <option value="all" className="bg-slate-900">All Segments</option>
                  {segmentNames.map(s => (
                    <option key={s} value={s} className="bg-slate-900">{s}</option>
                  ))}
                </select>
              )}
            </div>

            {Object.keys(groupedByWindow).length === 0 && (
              <div className="text-center py-12 text-slate-500">No milestones match the current view.</div>
            )}

            {Object.entries(groupedByWindow).map(([tw, items]) => (
              <div key={tw} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIME_WINDOW_COLORS[tw] ?? "#94a3b8" }} />
                  <h3 className="text-sm font-semibold text-slate-300">{TIME_WINDOW_LABELS[tw] ?? tw}</h3>
                  <span className="text-xs text-slate-500">{items.length} milestone{items.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="space-y-2 ml-5 border-l-2 pl-4" style={{ borderColor: TIME_WINDOW_COLORS[tw] ?? "#94a3b8" }}>
                  {items.map(m => (
                    <MilestoneCard
                      key={m.id}
                      milestone={m}
                      isExpanded={expandedId === m.id}
                      onToggle={() => setExpandedId(expandedId === m.id ? null : m.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        {isLoading && <div className="text-center py-16 text-slate-500">Loading readiness timeline…</div>}

        {!isLoading && milestones.length === 0 && activeCaseId && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <Clock className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-slate-400 text-sm">No readiness timeline generated yet.</div>
            <div className="text-slate-500 text-xs mt-1">
              Generate adoption segments and barrier diagnosis first, then generate the readiness timeline.
            </div>
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Link href="/forecast" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Forecast
          </Link>
        </div>
      </div>
    </div>
  );
}
