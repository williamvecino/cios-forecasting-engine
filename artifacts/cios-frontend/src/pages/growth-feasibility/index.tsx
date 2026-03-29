import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const API = import.meta.env.VITE_API_URL || "";

function getApiBase() {
  if (typeof window !== "undefined" && window.location.hostname !== "localhost") {
    return `https://${window.location.hostname}:443/api`;
  }
  return `${API}/api`;
}

interface FeasibilityRow {
  id: string;
  feasibilityId: string;
  caseId: string;
  scope: string;
  segmentName: string | null;
  segmentType: string | null;
  feasibilityScore: number;
  feasibilityTier: string;
  nearTermPotential: number;
  nearTermLabel: string;
  mediumTermPotential: number;
  mediumTermLabel: string;
  topUnlocks: string;
  topConstraints: string;
  adoptionLikelihood: number | null;
  barrierLoad: number | null;
  readinessScore: number | null;
  competitiveRiskLoad: number | null;
  scalabilityRating: string | null;
  revenueTranslation: string | null;
  rationale: string | null;
  confidenceLevel: string;
  priorityRank: number | null;
  derivedFrom: string | null;
}

interface CaseOption {
  caseId: string;
  question: string;
}

const TIER_COLORS: Record<string, string> = {
  high_growth: "#22c55e",
  moderate_growth: "#3b82f6",
  constrained_growth: "#eab308",
  blocked: "#ef4444",
  monitor_only: "#6b7280",
};

const TIER_LABELS: Record<string, string> = {
  high_growth: "High Growth",
  moderate_growth: "Moderate Growth",
  constrained_growth: "Constrained Growth",
  blocked: "Blocked",
  monitor_only: "Monitor Only",
};

const POTENTIAL_COLORS: Record<string, string> = {
  Strong: "#22c55e",
  Moderate: "#3b82f6",
  Limited: "#eab308",
  Minimal: "#ef4444",
};

function safeParseArray(json: string | null): string[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>{(value * 100).toFixed(0)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value * 100}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

function PotentialBadge({ label, level }: { label: string; level: string }) {
  const color = POTENTIAL_COLORS[level] ?? "#6b7280";
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-center">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-bold" style={{ color }}>{level}</div>
    </div>
  );
}

function UnlockConstraintList({ items, type }: { items: string[]; type: "unlock" | "constraint" }) {
  if (items.length === 0) return null;
  const isUnlock = type === "unlock";
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {isUnlock ? "Top Unlocks" : "Top Constraints"}
      </div>
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2 text-xs">
          <span className={`mt-0.5 shrink-0 ${isUnlock ? "text-emerald-400" : "text-rose-400"}`}>
            {isUnlock ? "▲" : "▼"}
          </span>
          <span className="text-slate-300">{item}</span>
        </div>
      ))}
    </div>
  );
}

export default function GrowthFeasibilityPage() {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [selectedCase, setSelectedCase] = useState<string>("");
  const [overall, setOverall] = useState<FeasibilityRow | null>(null);
  const [segments, setSegments] = useState<FeasibilityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${getApiBase()}/cases`)
      .then(r => r.json())
      .then(data => {
        const items = (data.cases || data || []).map((c: any) => ({
          caseId: c.id,
          question: c.question || c.rawInput || c.id,
        }));
        setCases(items);
        if (items.length > 0 && !selectedCase) setSelectedCase(items[0].caseId);
      })
      .catch(() => {});
  }, []);

  const fetchFeasibility = useCallback(async (caseId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/growth-feasibility/${caseId}`);
      const data = await res.json();
      const rows: FeasibilityRow[] = data.feasibility || [];
      setOverall(rows.find(r => r.scope === "overall") || null);
      setSegments(rows.filter(r => r.scope === "segment").sort((a, b) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedCase) fetchFeasibility(selectedCase);
  }, [selectedCase, fetchFeasibility]);

  const generate = async () => {
    if (!selectedCase) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${getApiBase()}/growth-feasibility/${selectedCase}/generate`, { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setOverall(data.overall || null);
      setSegments((data.segments || []).sort((a: FeasibilityRow, b: FeasibilityRow) => (a.priorityRank ?? 99) - (b.priorityRank ?? 99)));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const chartData = segments.map(s => ({
    name: (s.segmentName ?? "").length > 18 ? (s.segmentName ?? "").slice(0, 16) + "…" : (s.segmentName ?? ""),
    score: Number((s.feasibilityScore * 100).toFixed(1)),
    tier: s.feasibilityTier,
  }));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="border-b border-border bg-card/50 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <Link href="/" className="text-xs text-muted-foreground hover:text-foreground mb-1 inline-block">← Back</Link>
            <h1 className="text-xl font-bold">Growth Feasibility</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Where is realistic growth most achievable under current constraints?
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={selectedCase}
              onChange={(e) => setSelectedCase(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
            >
              {cases.map(c => (
                <option key={c.caseId} value={c.caseId}>
                  {c.question.length > 60 ? c.question.slice(0, 57) + "…" : c.question}
                </option>
              ))}
            </select>
            <button
              onClick={generate}
              disabled={generating || !selectedCase}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {generating ? "Generating…" : "Generate"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div>
        )}

        {loading && (
          <div className="text-center py-12 text-muted-foreground">Loading feasibility data…</div>
        )}

        {!loading && !overall && !error && (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-3">No growth feasibility analysis yet.</p>
            <p className="text-xs text-slate-500">
              Generate adoption segments, barrier diagnosis, readiness timeline, and competitive risk first, then generate feasibility.
            </p>
          </div>
        )}

        {overall && (
          <>
            <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Overall Growth Feasibility</div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold" style={{ color: TIER_COLORS[overall.feasibilityTier] }}>
                      {(overall.feasibilityScore * 100).toFixed(0)}%
                    </span>
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold"
                      style={{ backgroundColor: TIER_COLORS[overall.feasibilityTier] + "20", color: TIER_COLORS[overall.feasibilityTier], border: `1px solid ${TIER_COLORS[overall.feasibilityTier]}40` }}
                    >
                      {TIER_LABELS[overall.feasibilityTier] ?? overall.feasibilityTier}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-slate-500 mb-1">Confidence</div>
                  <span className={`text-sm font-semibold ${overall.confidenceLevel === "High" ? "text-emerald-400" : overall.confidenceLevel === "Moderate" ? "text-blue-400" : "text-amber-400"}`}>
                    {overall.confidenceLevel}
                  </span>
                </div>
              </div>

              {overall.rationale && (
                <p className="text-sm text-slate-300 leading-relaxed">{overall.rationale}</p>
              )}

              <div className="grid grid-cols-2 gap-3">
                <PotentialBadge label="Near-Term (0–6 mo)" level={overall.nearTermLabel} />
                <PotentialBadge label="Medium-Term (6–18 mo)" level={overall.mediumTermLabel} />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ScoreBar label="Adoption" value={overall.adoptionLikelihood ?? 0} color="#3b82f6" />
                <ScoreBar label="Readiness" value={overall.readinessScore ?? 0} color="#22c55e" />
                <ScoreBar label="Barrier Load" value={overall.barrierLoad ?? 0} color="#ef4444" />
                <ScoreBar label="Competitive Risk" value={overall.competitiveRiskLoad ?? 0} color="#f97316" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Scalability</span>
                    <span className={`text-xs font-bold ${overall.scalabilityRating === "High" ? "text-emerald-400" : overall.scalabilityRating === "Moderate" ? "text-blue-400" : "text-rose-400"}`}>
                      {overall.scalabilityRating}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Revenue Translation</span>
                    <span className={`text-xs font-bold ${overall.revenueTranslation === "High" ? "text-emerald-400" : overall.revenueTranslation === "Moderate" ? "text-blue-400" : "text-rose-400"}`}>
                      {overall.revenueTranslation}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <UnlockConstraintList items={safeParseArray(overall.topUnlocks)} type="unlock" />
                  <UnlockConstraintList items={safeParseArray(overall.topConstraints)} type="constraint" />
                </div>
              </div>
            </div>

            {chartData.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Segment Feasibility Ranking</div>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <YAxis type="category" dataKey="name" width={130} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1e293b", border: "1px solid #334155", borderRadius: "8px", fontSize: "12px" }}
                        formatter={(val: number) => [`${val}%`, "Feasibility"]}
                      />
                      <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                        {chartData.map((d, i) => (
                          <Cell key={i} fill={TIER_COLORS[d.tier] ?? "#6b7280"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Segment Details</div>
              {segments.map((seg) => {
                const isExpanded = expandedSegment === seg.id;
                const unlocks = safeParseArray(seg.topUnlocks);
                const constraints = safeParseArray(seg.topConstraints);
                const tierColor = TIER_COLORS[seg.feasibilityTier] ?? "#6b7280";

                return (
                  <div key={seg.id} className="rounded-2xl border border-border bg-card overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition"
                      onClick={() => setExpandedSegment(isExpanded ? null : seg.id)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold" style={{ color: tierColor }}>
                          {(seg.feasibilityScore * 100).toFixed(0)}%
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-foreground">{seg.segmentName}</div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span
                              className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                              style={{ backgroundColor: tierColor + "20", color: tierColor, border: `1px solid ${tierColor}40` }}
                            >
                              {TIER_LABELS[seg.feasibilityTier] ?? seg.feasibilityTier}
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Near: {seg.nearTermLabel} · Med: {seg.mediumTermLabel}
                            </span>
                          </div>
                        </div>
                      </div>
                      <span className="text-slate-500 text-xs">{isExpanded ? "▲" : "▼"}</span>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-border/50 px-5 py-4 space-y-4">
                        {seg.rationale && (
                          <p className="text-sm text-slate-300 leading-relaxed">{seg.rationale}</p>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                          <PotentialBadge label="Near-Term" level={seg.nearTermLabel} />
                          <PotentialBadge label="Medium-Term" level={seg.mediumTermLabel} />
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <ScoreBar label="Adoption" value={seg.adoptionLikelihood ?? 0} color="#3b82f6" />
                          <ScoreBar label="Readiness" value={seg.readinessScore ?? 0} color="#22c55e" />
                          <ScoreBar label="Barrier Load" value={seg.barrierLoad ?? 0} color="#ef4444" />
                          <ScoreBar label="Competitive Risk" value={seg.competitiveRiskLoad ?? 0} color="#f97316" />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <UnlockConstraintList items={unlocks} type="unlock" />
                          <UnlockConstraintList items={constraints} type="constraint" />
                        </div>

                        <div className="flex items-center gap-4 text-[10px] text-slate-500">
                          <span>Scalability: <span className="font-semibold text-slate-300">{seg.scalabilityRating}</span></span>
                          <span>Revenue: <span className="font-semibold text-slate-300">{seg.revenueTranslation}</span></span>
                          <span>Confidence: <span className="font-semibold text-slate-300">{seg.confidenceLevel}</span></span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
