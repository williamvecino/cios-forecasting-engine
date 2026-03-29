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
  Users,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Layers,
  Target,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap,
  Lock,
  Activity,
  BarChart2,
  ArrowUpRight,
  Minus,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface Segment {
  id: string;
  segmentId: string;
  caseId: string;
  segmentName: string;
  segmentType: string;
  adoptionLikelihood: number;
  confidenceLevel: string | null;
  evidenceDiversityScore: number | null;
  posteriorFragilityScore: number | null;
  primaryDrivers: string | null;
  primaryBarriers: string | null;
  operationalConstraints: string | null;
  accessConstraints: string | null;
  behavioralSignals: string | null;
  forecastHorizon: string | null;
  priorityRank: number | null;
  priorityTier: string | null;
  rationaleSummary: string | null;
  upwardLevers: string | null;
  movementBlockers: string | null;
  signalCount: number | null;
  positiveSignalCount: number | null;
  negativeSignalCount: number | null;
  derivedFrom: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CaseOption {
  caseId: string;
  assetName: string;
  primaryBrand: string;
  strategicQuestion: string;
  currentProbability: number | null;
}

function safeParse(json: string | null): any[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function tierLabel(tier: string | null): string {
  switch (tier) {
    case "early_mover": return "Early Mover";
    case "persuadable_blocked": return "Persuadable — Blocked";
    case "persuadable_effort": return "Persuadable — Effort Needed";
    case "low_near_term": return "Low Near-Term";
    default: return tier || "Unknown";
  }
}

function tierColor(tier: string | null): string {
  switch (tier) {
    case "early_mover": return "text-emerald-400";
    case "persuadable_blocked": return "text-amber-400";
    case "persuadable_effort": return "text-orange-400";
    case "low_near_term": return "text-red-400";
    default: return "text-slate-400";
  }
}

function tierBg(tier: string | null): string {
  switch (tier) {
    case "early_mover": return "bg-emerald-500/20 border-emerald-500/30";
    case "persuadable_blocked": return "bg-amber-500/20 border-amber-500/30";
    case "persuadable_effort": return "bg-orange-500/20 border-orange-500/30";
    case "low_near_term": return "bg-red-500/20 border-red-500/30";
    default: return "bg-slate-500/20 border-slate-500/30";
  }
}

function confidenceIcon(level: string | null) {
  switch (level) {
    case "High": return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    case "Moderate": return <Activity className="w-4 h-4 text-blue-400" />;
    case "Developing": return <Clock className="w-4 h-4 text-amber-400" />;
    default: return <AlertTriangle className="w-4 h-4 text-red-400" />;
  }
}

function barColor(likelihood: number): string {
  if (likelihood >= 0.6) return "#34d399";
  if (likelihood >= 0.4) return "#fbbf24";
  if (likelihood >= 0.25) return "#fb923c";
  return "#f87171";
}

export default function AdoptionSegmentsPage() {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const [tierFilter, setTierFilter] = useState<string>("all");

  const { data: cases = [] } = useQuery<CaseOption[]>({
    queryKey: ["cases-list"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/cases`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeCaseId = selectedCaseId || (cases.length > 0 ? cases[0].caseId : "");

  const { data: segments = [], isLoading, refetch } = useQuery<Segment[]>({
    queryKey: ["adoption-segments", activeCaseId],
    queryFn: async () => {
      if (!activeCaseId) return [];
      const r = await fetch(`${API}/api/cases/${activeCaseId}/adoption-segments`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeCaseId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/adoption-segments/generate`, { method: "POST" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Generation failed" }));
        throw new Error(err.error || "Generation failed");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adoption-segments", activeCaseId] });
    },
  });

  const filteredSegments = useMemo(() => {
    if (tierFilter === "all") return segments;
    return segments.filter(s => s.priorityTier === tierFilter);
  }, [segments, tierFilter]);

  const chartData = useMemo(() =>
    filteredSegments.map(s => ({
      name: s.segmentName.length > 18 ? s.segmentName.slice(0, 16) + "…" : s.segmentName,
      fullName: s.segmentName,
      adoption: Number((s.adoptionLikelihood * 100).toFixed(1)),
      tier: s.priorityTier,
    })),
    [filteredSegments],
  );

  const tierCounts = useMemo(() => {
    const counts = { early_mover: 0, persuadable_blocked: 0, persuadable_effort: 0, low_near_term: 0 };
    for (const s of segments) {
      const t = s.priorityTier as keyof typeof counts;
      if (t in counts) counts[t]++;
    }
    return counts;
  }, [segments]);

  const selectedCase = cases.find(c => c.caseId === activeCaseId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#10101c] to-[#0c0c18] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forecast" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Users className="w-6 h-6 text-indigo-400" />
          <h1 className="text-2xl font-bold tracking-tight">Adoption Segmentation Panel</h1>
        </div>
        <p className="text-slate-400 text-sm -mt-2 ml-11">
          Segment-level adoption maps derived from forecast signals, actor dynamics, and evidence quality.
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
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {generateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {segments.length > 0 ? "Regenerate Segments" : "Generate Segments"}
          </button>

          {segments.length > 0 && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Filter by Tier</label>
              <select
                value={tierFilter}
                onChange={e => setTierFilter(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
              >
                <option value="all" className="bg-slate-900">All Tiers</option>
                <option value="early_mover" className="bg-slate-900">Early Movers ({tierCounts.early_mover})</option>
                <option value="persuadable_blocked" className="bg-slate-900">Persuadable — Blocked ({tierCounts.persuadable_blocked})</option>
                <option value="persuadable_effort" className="bg-slate-900">Persuadable — Effort ({tierCounts.persuadable_effort})</option>
                <option value="low_near_term" className="bg-slate-900">Low Near-Term ({tierCounts.low_near_term})</option>
              </select>
            </div>
          )}
        </div>

        {generateMutation.isError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {(generateMutation.error as Error).message}
          </div>
        )}

        {selectedCase && segments.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Segments</div>
              <div className="text-2xl font-bold text-slate-100 mt-1">{segments.length}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Base Probability</div>
              <div className="text-2xl font-bold text-blue-400 mt-1">
                {selectedCase.currentProbability != null ? (selectedCase.currentProbability * 100).toFixed(0) + "%" : "—"}
              </div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Early Movers</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{tierCounts.early_mover}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Blocked Segments</div>
              <div className="text-2xl font-bold text-amber-400 mt-1">{tierCounts.persuadable_blocked}</div>
            </div>
          </div>
        )}

        {segments.length > 0 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              Adoption Likelihood by Segment
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="name" type="category" width={140} tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: "#1e1e2e", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                  formatter={(value: any, _name: any, props: any) => [`${value}%`, props.payload.fullName]}
                  labelFormatter={() => ""}
                />
                <Bar dataKey="adoption" radius={[0, 6, 6, 0]} barSize={22}>
                  {chartData.map((entry, i) => (
                    <Cell key={i} fill={barColor(entry.adoption / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16 text-slate-500">Loading segments…</div>
        )}

        {!isLoading && segments.length === 0 && activeCaseId && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-slate-400 text-sm">No adoption segments generated yet.</div>
            <div className="text-slate-500 text-xs mt-1">Click "Generate Segments" to translate the current forecast into segment-level adoption maps.</div>
          </div>
        )}

        {filteredSegments.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-300 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-400" />
              Segment Detail — Ranked by Priority
            </h2>

            {filteredSegments.map((seg, idx) => {
              const isExpanded = expandedSegment === seg.id;
              const drivers = safeParse(seg.primaryDrivers);
              const barriers = safeParse(seg.primaryBarriers);
              const opConstraints = safeParse(seg.operationalConstraints);
              const accessConst = safeParse(seg.accessConstraints);
              const behavioral = safeParse(seg.behavioralSignals);
              const levers = safeParse(seg.upwardLevers);
              const blockers = safeParse(seg.movementBlockers);

              return (
                <div
                  key={seg.id}
                  className={`border rounded-2xl transition-all ${isExpanded ? "bg-white/[0.04] border-indigo-500/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}
                >
                  <button
                    onClick={() => setExpandedSegment(isExpanded ? null : seg.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4"
                  >
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-300 text-sm font-bold">
                      {seg.priorityRank ?? idx + 1}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-100">{seg.segmentName}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${tierBg(seg.priorityTier)}`}>
                          {tierLabel(seg.priorityTier)}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">{seg.rationaleSummary?.slice(0, 100)}</div>
                    </div>

                    <div className="flex items-center gap-6 flex-shrink-0">
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Adoption</div>
                        <div className="text-lg font-bold" style={{ color: barColor(seg.adoptionLikelihood) }}>
                          {(seg.adoptionLikelihood * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Confidence</div>
                        <div className="flex items-center gap-1 text-sm">
                          {confidenceIcon(seg.confidenceLevel)}
                          <span className="text-slate-300">{seg.confidenceLevel ?? "—"}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-500">Signals</div>
                        <div className="text-sm text-slate-300">
                          <span className="text-emerald-400">{seg.positiveSignalCount ?? 0}↑</span>
                          {" / "}
                          <span className="text-red-400">{seg.negativeSignalCount ?? 0}↓</span>
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Evidence Diversity</div>
                          <div className="text-lg font-semibold text-slate-200 mt-1">
                            {seg.evidenceDiversityScore != null ? (seg.evidenceDiversityScore * 100).toFixed(0) + "%" : "—"}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Fragility</div>
                          <div className="text-lg font-semibold text-slate-200 mt-1">
                            {seg.posteriorFragilityScore != null ? seg.posteriorFragilityScore.toFixed(3) : "—"}
                          </div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Forecast Horizon</div>
                          <div className="text-lg font-semibold text-slate-200 mt-1">{seg.forecastHorizon ?? "—"}</div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Total Signals</div>
                          <div className="text-lg font-semibold text-slate-200 mt-1">{seg.signalCount ?? 0}</div>
                        </div>
                      </div>

                      {seg.rationaleSummary && (
                        <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-lg p-3">
                          <div className="text-xs font-medium text-indigo-300 mb-1">Rationale</div>
                          <div className="text-sm text-slate-300 leading-relaxed">{seg.rationaleSummary}</div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {drivers.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-emerald-400 mb-2 flex items-center gap-1">
                              <TrendingUp className="w-3 h-3" /> Primary Drivers
                            </div>
                            <ul className="space-y-1">
                              {drivers.map((d, i) => (
                                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                  <ArrowUpRight className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                                  {d}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {barriers.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-red-400 mb-2 flex items-center gap-1">
                              <TrendingDown className="w-3 h-3" /> Primary Barriers
                            </div>
                            <ul className="space-y-1">
                              {barriers.map((b, i) => (
                                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                  <ShieldAlert className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                                  {b}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {(opConstraints.length > 0 || accessConst.length > 0) && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {opConstraints.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-orange-400 mb-2 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Operational Constraints
                              </div>
                              <ul className="space-y-1">
                                {opConstraints.map((c, i) => (
                                  <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                                    <Minus className="w-3 h-3 text-orange-500 mt-0.5 flex-shrink-0" />
                                    {c}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {accessConst.length > 0 && (
                            <div>
                              <div className="text-xs font-medium text-amber-400 mb-2 flex items-center gap-1">
                                <Lock className="w-3 h-3" /> Access Constraints
                              </div>
                              <ul className="space-y-1">
                                {accessConst.map((a, i) => (
                                  <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                                    <Minus className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
                                    {a}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}

                      {behavioral.length > 0 && (
                        <div>
                          <div className="text-xs font-medium text-blue-400 mb-2 flex items-center gap-1">
                            <Activity className="w-3 h-3" /> Behavioral Signals
                          </div>
                          <ul className="space-y-1">
                            {behavioral.map((b, i) => (
                              <li key={i} className="text-sm text-slate-400 flex items-start gap-2">
                                <Minus className="w-3 h-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                {b}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-white/5 pt-4">
                        {levers.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-cyan-400 mb-2 flex items-center gap-1">
                              <Target className="w-3 h-3" /> Upward Levers
                            </div>
                            <ul className="space-y-1">
                              {levers.map((l, i) => (
                                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                  <Zap className="w-3 h-3 text-cyan-500 mt-0.5 flex-shrink-0" />
                                  {l}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {blockers.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-rose-400 mb-2 flex items-center gap-1">
                              <ShieldAlert className="w-3 h-3" /> Movement Blockers
                            </div>
                            <ul className="space-y-1">
                              {blockers.map((b, i) => (
                                <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                                  <Lock className="w-3 h-3 text-rose-500 mt-0.5 flex-shrink-0" />
                                  {b}
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
            })}
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
