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
  ShieldAlert,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Zap,
  Lock,
  Unlock,
  Target,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  Clock,
  BarChart2,
  Minus,
  ArrowUpRight,
  Layers,
  Filter,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface Barrier {
  id: string;
  barrierId: string;
  caseId: string;
  segmentId: string | null;
  segmentName: string | null;
  barrierName: string;
  barrierCategory: string;
  barrierStrength: number;
  barrierConfidence: string;
  barrierScope: string | null;
  primarySignals: string | null;
  counterSignals: string | null;
  whyItMatters: string | null;
  removalDifficulty: string | null;
  isStructural: string | null;
  estimatedImpactIfResolved: number | null;
  priorityRank: number | null;
  priorityClass: string | null;
  rationaleSummary: string | null;
  signalCount: number | null;
  counterSignalCount: number | null;
  derivedFrom: string | null;
}

interface GenerateResponse {
  overall: Barrier[];
  bySegment: Record<string, Barrier[]>;
  summary: {
    totalBarriers: number;
    overallCount: number;
    segmentCount: number;
    categoryDistribution: Record<string, number>;
    topPriority: Barrier | null;
  };
}

interface CaseOption {
  caseId: string;
  assetName: string;
  primaryBrand: string;
  strategicQuestion: string;
}

function safeParse(json: string | null): any[] {
  if (!json) return [];
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

const CATEGORY_LABELS: Record<string, string> = {
  evidence_data_quality: "Evidence / Data Quality",
  clinical_reasoning: "Clinical Reasoning",
  safety_risk: "Safety / Risk Perception",
  access_reimbursement: "Access / Reimbursement",
  workflow_operational: "Workflow / Operational Burden",
  guideline_soc_inertia: "Guideline / SOC Inertia",
  identity_role: "Identity / Role Ownership",
  economic_budget: "Economic / Budget Pressure",
  competitive_entrenchment: "Competitive Entrenchment",
  awareness_translation: "Awareness / Translation Gap",
};

const CATEGORY_COLORS: Record<string, string> = {
  evidence_data_quality: "#818cf8",
  clinical_reasoning: "#a78bfa",
  safety_risk: "#f87171",
  access_reimbursement: "#fb923c",
  workflow_operational: "#fbbf24",
  guideline_soc_inertia: "#34d399",
  identity_role: "#f472b6",
  economic_budget: "#38bdf8",
  competitive_entrenchment: "#e879f9",
  awareness_translation: "#94a3b8",
};

function priorityLabel(cls: string | null): string {
  switch (cls) {
    case "high_impact_removable": return "High Impact — Removable";
    case "high_impact_structural": return "High Impact — Structural";
    case "secondary": return "Secondary";
    case "downstream_echo": return "Downstream Echo";
    default: return cls || "Unknown";
  }
}

function priorityBg(cls: string | null): string {
  switch (cls) {
    case "high_impact_removable": return "bg-emerald-500/20 border-emerald-500/30 text-emerald-300";
    case "high_impact_structural": return "bg-red-500/20 border-red-500/30 text-red-300";
    case "secondary": return "bg-slate-500/20 border-slate-500/30 text-slate-300";
    case "downstream_echo": return "bg-slate-600/20 border-slate-600/30 text-slate-400";
    default: return "bg-slate-500/20 border-slate-500/30 text-slate-300";
  }
}

function strengthColor(s: number): string {
  if (s >= 0.6) return "#f87171";
  if (s >= 0.4) return "#fb923c";
  if (s >= 0.2) return "#fbbf24";
  return "#94a3b8";
}

function removalIcon(difficulty: string | null) {
  if (difficulty === "structural") return <Lock className="w-3.5 h-3.5 text-red-400" />;
  if (difficulty === "difficult") return <Lock className="w-3.5 h-3.5 text-orange-400" />;
  if (difficulty === "moderate") return <Unlock className="w-3.5 h-3.5 text-amber-400" />;
  return <Unlock className="w-3.5 h-3.5 text-emerald-400" />;
}

function confidenceIcon(level: string | null) {
  switch (level) {
    case "High": return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
    case "Moderate": return <Activity className="w-3.5 h-3.5 text-blue-400" />;
    case "Developing": return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    default: return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
  }
}

export default function BarrierDiagnosisPage() {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [expandedBarrier, setExpandedBarrier] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"overall" | "by-segment">("overall");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const { data: cases = [] } = useQuery<CaseOption[]>({
    queryKey: ["cases-list"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/cases`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeCaseId = selectedCaseId || (cases.length > 0 ? cases[0].caseId : "");

  const { data: barriers = [], isLoading } = useQuery<Barrier[]>({
    queryKey: ["barrier-diagnosis", activeCaseId],
    queryFn: async () => {
      if (!activeCaseId) return [];
      const r = await fetch(`${API}/api/cases/${activeCaseId}/barrier-diagnosis`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeCaseId,
  });

  const generateMutation = useMutation<GenerateResponse>({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/barrier-diagnosis/generate`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["barrier-diagnosis", activeCaseId] });
    },
  });

  const overallBarriers = useMemo(() => barriers.filter(b => !b.segmentId), [barriers]);
  const segmentBarriers = useMemo(() => barriers.filter(b => !!b.segmentId), [barriers]);

  const segmentGroups = useMemo(() => {
    const groups: Record<string, Barrier[]> = {};
    for (const b of segmentBarriers) {
      const name = b.segmentName || "Unknown";
      if (!groups[name]) groups[name] = [];
      groups[name].push(b);
    }
    return groups;
  }, [segmentBarriers]);

  const displayBarriers = useMemo(() => {
    let list = viewMode === "overall" ? overallBarriers : segmentBarriers;
    if (categoryFilter !== "all") {
      list = list.filter(b => b.barrierCategory === categoryFilter);
    }
    return list;
  }, [viewMode, overallBarriers, segmentBarriers, categoryFilter]);

  const categoryDistribution = useMemo(() => {
    const source = overallBarriers;
    const counts: Record<string, { count: number; avgStrength: number }> = {};
    for (const b of source) {
      const key = b.barrierCategory;
      if (!counts[key]) counts[key] = { count: 0, avgStrength: 0 };
      counts[key].count++;
      counts[key].avgStrength += b.barrierStrength;
    }
    return Object.entries(counts)
      .map(([key, val]) => ({
        category: CATEGORY_LABELS[key] || key,
        categoryKey: key,
        count: val.count,
        avgStrength: Number(((val.avgStrength / val.count) * 100).toFixed(1)),
        color: CATEGORY_COLORS[key] || "#94a3b8",
      }))
      .sort((a, b) => b.avgStrength - a.avgStrength);
  }, [overallBarriers]);

  const activeCats = useMemo(() => {
    const cats = new Set<string>();
    for (const b of barriers) cats.add(b.barrierCategory);
    return cats;
  }, [barriers]);

  const topPriority = overallBarriers.length > 0 ? overallBarriers[0] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#10101c] to-[#0c0c18] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forecast" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <ShieldAlert className="w-6 h-6 text-rose-400" />
          <h1 className="text-2xl font-bold tracking-tight">What Is Blocking Progress</h1>
        </div>
        <p className="text-slate-400 text-sm -mt-2 ml-11">
          Diagnose dominant sources of resistance by category, segment, and priority. Identify where intervention would have the highest impact.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Case</label>
            <select
              value={activeCaseId}
              onChange={e => setSelectedCaseId(e.target.value)}
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
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {barriers.length > 0 ? "Regenerate Diagnosis" : "Diagnose Barriers"}
          </button>
        </div>

        {generateMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {(generateMutation.error as Error).message}
          </div>
        )}

        {barriers.length > 0 && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Overall Barriers</div>
                <div className="text-2xl font-bold text-slate-100 mt-1">{overallBarriers.length}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Segment-Level</div>
                <div className="text-2xl font-bold text-slate-100 mt-1">{segmentBarriers.length}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Categories Active</div>
                <div className="text-2xl font-bold text-indigo-400 mt-1">{activeCats.size}</div>
              </div>
              <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
                <div className="text-xs text-slate-500">Top Priority</div>
                <div className="text-sm font-semibold text-rose-400 mt-1 truncate">
                  {topPriority ? (CATEGORY_LABELS[topPriority.barrierCategory] || topPriority.barrierCategory) : "—"}
                </div>
              </div>
            </div>

            {topPriority && (
              <div className="bg-rose-500/5 border border-rose-500/20 rounded-2xl p-5">
                <div className="text-xs font-medium text-rose-300 mb-2 flex items-center gap-1.5">
                  <Target className="w-4 h-4" /> Address First
                </div>
                <div className="text-lg font-semibold text-slate-100">
                  {CATEGORY_LABELS[topPriority.barrierCategory] || topPriority.barrierCategory}
                </div>
                <div className="text-sm text-slate-300 mt-1">{topPriority.barrierName}</div>
                <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                  <span>Strength: <span style={{ color: strengthColor(topPriority.barrierStrength) }}>{(topPriority.barrierStrength * 100).toFixed(0)}%</span></span>
                  <span className="flex items-center gap-1">{removalIcon(topPriority.removalDifficulty)} {topPriority.removalDifficulty}</span>
                  <span>Impact if resolved: +{topPriority.estimatedImpactIfResolved != null ? (topPriority.estimatedImpactIfResolved * 100).toFixed(1) : "—"}pp</span>
                  <span className={`px-2 py-0.5 rounded-full border ${priorityBg(topPriority.priorityClass)}`}>{priorityLabel(topPriority.priorityClass)}</span>
                </div>
              </div>
            )}

            {categoryDistribution.length > 0 && (
              <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-rose-400" />
                  Barrier Strength by Category (Overall)
                </h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={categoryDistribution} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${v}%`} />
                    <YAxis dataKey="category" type="category" width={180} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#1e1e2e", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                      formatter={(value: any) => [`${value}%`, "Avg Strength"]}
                      labelFormatter={() => ""}
                    />
                    <Bar dataKey="avgStrength" radius={[0, 6, 6, 0]} barSize={20}>
                      {categoryDistribution.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex rounded-lg border border-white/10 overflow-hidden">
                <button
                  onClick={() => setViewMode("overall")}
                  className={`px-4 py-2 text-sm ${viewMode === "overall" ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  Overall ({overallBarriers.length})
                </button>
                <button
                  onClick={() => setViewMode("by-segment")}
                  className={`px-4 py-2 text-sm ${viewMode === "by-segment" ? "bg-white/10 text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
                >
                  By Segment ({segmentBarriers.length})
                </button>
              </div>

              <div>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                >
                  <option value="all" className="bg-slate-900">All Categories</option>
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-slate-900">{label}</option>
                  ))}
                </select>
              </div>
            </div>
          </>
        )}

        {isLoading && (
          <div className="text-center py-16 text-slate-500">Loading barrier diagnosis…</div>
        )}

        {!isLoading && barriers.length === 0 && activeCaseId && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <ShieldAlert className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-slate-400 text-sm">No barrier diagnosis generated yet.</div>
            <div className="text-slate-500 text-xs mt-1">Click "Diagnose Barriers" to analyze adoption barriers from forecast signals and segment data.</div>
          </div>
        )}

        {viewMode === "overall" && displayBarriers.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-rose-400" />
              Overall Barrier Ranking
            </h2>
            {displayBarriers.map((b, idx) => (
              <BarrierCard
                key={b.id}
                barrier={b}
                index={idx}
                isExpanded={expandedBarrier === b.id}
                onToggle={() => setExpandedBarrier(expandedBarrier === b.id ? null : b.id)}
              />
            ))}
          </div>
        )}

        {viewMode === "by-segment" && Object.keys(segmentGroups).length > 0 && (
          <div className="space-y-6">
            {Object.entries(segmentGroups).map(([segName, segBarriers]) => {
              const filtered = categoryFilter === "all" ? segBarriers : segBarriers.filter(b => b.barrierCategory === categoryFilter);
              if (filtered.length === 0) return null;
              return (
                <div key={segName}>
                  <h3 className="text-sm font-semibold text-slate-200 mb-3 flex items-center gap-2">
                    <Target className="w-4 h-4 text-indigo-400" />
                    {segName}
                    <span className="text-xs text-slate-500 font-normal">({filtered.length} barriers)</span>
                  </h3>
                  <div className="space-y-2">
                    {filtered.map((b, idx) => (
                      <BarrierCard
                        key={b.id}
                        barrier={b}
                        index={idx}
                        isExpanded={expandedBarrier === b.id}
                        onToggle={() => setExpandedBarrier(expandedBarrier === b.id ? null : b.id)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-center gap-4 pt-4">
          <Link href="/adoption-segments" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Adoption Segments
          </Link>
          <Link href="/forecast" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
            ← Back to Forecast
          </Link>
        </div>
      </div>
    </div>
  );
}

function BarrierCard({ barrier: b, index, isExpanded, onToggle }: {
  barrier: Barrier;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const primarySignals = safeParse(b.primarySignals);
  const counterSignals = safeParse(b.counterSignals);

  return (
    <div className={`border rounded-2xl transition-all ${isExpanded ? "bg-white/[0.04] border-rose-500/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}>
      <button onClick={onToggle} className="w-full text-left px-5 py-4 flex items-center gap-4">
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-300 text-sm font-bold">
          {b.priorityRank ?? index + 1}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-100">{CATEGORY_LABELS[b.barrierCategory] || b.barrierCategory}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${priorityBg(b.priorityClass)}`}>
              {priorityLabel(b.priorityClass)}
            </span>
            {b.segmentName && (
              <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded-full">{b.segmentName}</span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 truncate">{b.barrierName}</div>
        </div>

        <div className="flex items-center gap-5 flex-shrink-0">
          <div className="text-right">
            <div className="text-xs text-slate-500">Strength</div>
            <div className="text-lg font-bold" style={{ color: strengthColor(b.barrierStrength) }}>
              {(b.barrierStrength * 100).toFixed(0)}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Removability</div>
            <div className="flex items-center gap-1 text-sm">
              {removalIcon(b.removalDifficulty)}
              <span className="text-slate-300 capitalize">{b.removalDifficulty ?? "—"}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Confidence</div>
            <div className="flex items-center gap-1 text-sm">
              {confidenceIcon(b.barrierConfidence)}
              <span className="text-slate-300">{b.barrierConfidence}</span>
            </div>
          </div>
          {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] rounded-lg p-3">
              <div className="text-xs text-slate-500">Barrier Strength</div>
              <div className="text-lg font-semibold mt-1" style={{ color: strengthColor(b.barrierStrength) }}>
                {(b.barrierStrength * 100).toFixed(1)}%
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <div className="text-xs text-slate-500">Structural?</div>
              <div className="flex items-center gap-1.5 mt-1">
                {b.isStructural === "yes" ? <Lock className="w-4 h-4 text-red-400" /> : <Unlock className="w-4 h-4 text-emerald-400" />}
                <span className="text-lg font-semibold text-slate-200">{b.isStructural === "yes" ? "Yes" : "No"}</span>
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <div className="text-xs text-slate-500">Impact if Resolved</div>
              <div className="text-lg font-semibold text-emerald-400 mt-1">
                +{b.estimatedImpactIfResolved != null ? (b.estimatedImpactIfResolved * 100).toFixed(1) : "—"}pp
              </div>
            </div>
            <div className="bg-white/[0.03] rounded-lg p-3">
              <div className="text-xs text-slate-500">Signals</div>
              <div className="text-sm text-slate-300 mt-1">
                <span className="text-red-400">{b.signalCount ?? 0} barrier</span>
                {" / "}
                <span className="text-emerald-400">{b.counterSignalCount ?? 0} counter</span>
              </div>
            </div>
          </div>

          {b.whyItMatters && (
            <div className="bg-rose-500/5 border border-rose-500/20 rounded-lg p-3">
              <div className="text-xs font-medium text-rose-300 mb-1">Why This Barrier Matters</div>
              <div className="text-sm text-slate-300 leading-relaxed">{b.whyItMatters}</div>
            </div>
          )}

          {b.rationaleSummary && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
              <div className="text-xs font-medium text-indigo-300 mb-1">Diagnosis Rationale</div>
              <div className="text-sm text-slate-300 leading-relaxed">{b.rationaleSummary}</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {primarySignals.length > 0 && (
              <div>
                <div className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Supporting Signals ({primarySignals.length})
                </div>
                <ul className="space-y-1.5">
                  {primarySignals.map((s: any, i: number) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2 bg-white/[0.02] rounded-lg p-2">
                      <ShieldAlert className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div>{s.description || "Unnamed signal"}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {s.type} · LR: {s.likelihoodRatio?.toFixed(2) ?? "—"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {counterSignals.length > 0 && (
              <div>
                <div className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Counter-Signals ({counterSignals.length})
                </div>
                <ul className="space-y-1.5">
                  {counterSignals.map((s: any, i: number) => (
                    <li key={i} className="text-sm text-slate-300 flex items-start gap-2 bg-white/[0.02] rounded-lg p-2">
                      <ArrowUpRight className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <div>{s.description || "Unnamed signal"}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {s.type} · LR: {s.likelihoodRatio?.toFixed(2) ?? "—"}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
