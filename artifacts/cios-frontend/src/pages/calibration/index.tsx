import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  ScatterChart,
  Scatter,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
  Cell,
} from "recharts";
import {
  Activity,
  Target,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  BarChart2,
  ShieldAlert,
  BookOpen,
  Filter,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Layers,
  GitBranch,
  Minus,
  Info,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface DashboardData {
  coreMetrics: {
    totalForecasts: number;
    resolvedForecasts: number;
    openForecasts: number;
    meanBrierScore: number | null;
    medianBrierScore: number | null;
    overconfidenceRate: number | null;
    underconfidenceRate: number | null;
    meanAbsoluteError: number | null;
    forecastRevisionCount: number;
    revisionImprovementRate: number | null;
  };
  calibrationBuckets: {
    bucket: string;
    count: number;
    meanPredicted: number;
    meanActual: number;
    gap: number;
    meanBrier: number;
  }[];
  biasPatterns: {
    pattern: string;
    count: number;
    description: string;
    entries: string[];
  }[];
  domainBreakdowns: {
    domain: string;
    totalForecasts: number;
    resolvedCount: number;
    openCount: number;
    meanBrier: number | null;
    meanError: number | null;
  }[];
  revisionAnalysis: {
    caseId: string;
    strategicQuestion: string;
    versionCount: number;
    firstForecast: number;
    finalForecast: number;
    outcome: number | null;
    resolutionStatus: string;
    movedCloser: boolean | null;
    confidenceChange: string | null;
    versions: {
      version: number;
      probability: number;
      date: string;
      rationale: string | null;
    }[];
  }[];
  referenceCaseLinkage: {
    totalReferenceCases: number;
    mostMatchedPatterns: { tag: string; count: number }[];
    missCorrelations: { pattern: string; total: number; missCount: number }[];
    recurringLessons: string[];
    informationalOnly: boolean;
  };
  resolvedEntries: {
    predictionId: string;
    caseId: string;
    strategicQuestion: string;
    forecastProbability: number;
    actualOutcome: number | null;
    brierScore: number | null;
    predictionError: number | null;
    calibrationBucket: string;
    decisionDomain: string | null;
    evidenceDiversityScore: number | null;
    posteriorFragilityScore: number | null;
    concentrationPenalty: number | null;
    confidenceCeilingApplied: number | null;
    forecastDate: string;
    resolutionStatus: string;
    updateVersion: number;
  }[];
  availableFilters: {
    domains: string[];
    statuses: string[];
    biasPatternTypes: string[];
  };
}

function pct(v: number | null | undefined): string {
  if (v == null) return "\u2014";
  return `${(v * 100).toFixed(1)}%`;
}

function brierLabel(v: number | null): string {
  if (v == null) return "\u2014";
  return v.toFixed(4);
}

function brierColor(v: number | null): string {
  if (v == null) return "text-slate-400";
  if (v < 0.1) return "text-emerald-400";
  if (v < 0.2) return "text-amber-400";
  return "text-red-400";
}

function patternLabel(id: string): string {
  const labels: Record<string, string> = {
    high_concentration_miss: "Concentration + Miss",
    low_diversity_miss: "Low Diversity + Miss",
    high_fragility_miss: "High Fragility + Miss",
    false_confidence: "False Confidence",
    false_low_confidence: "False Low Confidence",
    ceiling_constrained_success: "Ceiling-Constrained Success",
    overconfidence_general: "Overconfidence",
    underconfidence_general: "Underconfidence",
  };
  return labels[id] ?? id;
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    open: { bg: "bg-slate-500/20", text: "text-slate-300", label: "Open" },
    resolved_true: { bg: "bg-emerald-500/20", text: "text-emerald-400", label: "Resolved True" },
    resolved_false: { bg: "bg-red-500/20", text: "text-red-400", label: "Resolved False" },
    partially_resolved: { bg: "bg-amber-500/20", text: "text-amber-400", label: "Partial" },
    not_resolvable: { bg: "bg-slate-500/20", text: "text-slate-400", label: "Not Resolvable" },
  };
  const c = config[status] ?? config.open;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
}

export default function Calibration() {
  const [filters, setFilters] = useState<{
    domain: string;
    status: string;
    confidenceMin: string;
    confidenceMax: string;
    dateFrom: string;
    dateTo: string;
  }>({ domain: "", status: "", confidenceMin: "", confidenceMax: "", dateFrom: "", dateTo: "" });
  const [showFilters, setShowFilters] = useState(false);
  const [expandedRevision, setExpandedRevision] = useState<string | null>(null);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const p = new URLSearchParams();
    if (filters.domain) p.set("domain", filters.domain);
    if (filters.status) p.set("status", filters.status);
    if (filters.confidenceMin) p.set("confidenceMin", filters.confidenceMin);
    if (filters.confidenceMax) p.set("confidenceMax", filters.confidenceMax);
    if (filters.dateFrom) p.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) p.set("dateTo", filters.dateTo);
    return p.toString();
  }, [filters]);

  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ["/api/forecast-ledger/dashboard", queryParams],
    queryFn: () =>
      fetch(`${API}/api/forecast-ledger/dashboard${queryParams ? `?${queryParams}` : ""}`).then(r => r.json()),
    staleTime: 15_000,
  });

  const cm = data?.coreMetrics;

  const calibrationScatterData = useMemo(() => {
    if (!data?.resolvedEntries) return [];
    return data.resolvedEntries.map(e => ({
      x: Number((e.forecastProbability * 100).toFixed(1)),
      y: Number(((e.actualOutcome ?? 0) * 100).toFixed(1)),
      id: e.predictionId,
      question: e.strategicQuestion?.slice(0, 60),
      brier: e.brierScore?.toFixed(4) ?? "\u2014",
    }));
  }, [data]);

  const calibrationCurveData = useMemo(() => {
    if (!data?.calibrationBuckets) return [];
    return data.calibrationBuckets.map(b => {
      const midPredicted = b.meanPredicted * 100;
      const midActual = b.meanActual * 100;
      return {
        bucket: b.bucket,
        predicted: Number(midPredicted.toFixed(1)),
        actual: Number(midActual.toFixed(1)),
        gap: Number((b.gap * 100).toFixed(1)),
        count: b.count,
        brier: b.meanBrier,
      };
    });
  }, [data]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#050e1f] text-white flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading performance data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050e1f] text-white">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">

        <header>
          <div className="flex items-center gap-2 mb-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-indigo-500/20 text-indigo-300 tracking-wider uppercase">Performance Monitor</span>
          </div>
          <h1 className="text-3xl font-bold">Calibration & Performance Dashboard</h1>
          <p className="text-slate-400 mt-1 max-w-3xl">
            System-level performance monitoring. Tracks forecast accuracy, calibration quality, structural bias patterns, and revision effectiveness using Forecast Ledger data. Reference cases are used for interpretation only and do not alter forecast calculations.
          </p>
        </header>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
          >
            <Filter className="w-4 h-4" />
            Filters
            <ChevronDown className={`w-3 h-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-300 hover:bg-white/[0.05] transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <Link href="/forecast-ledger" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-300 hover:bg-white/[0.05] transition-colors">
            Forecast Ledger
          </Link>
          <Link href="/reference-cases" className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/[0.02] text-sm text-slate-300 hover:bg-white/[0.05] transition-colors">
            Reference Cases
          </Link>
        </div>

        {showFilters && (
          <div className="rounded-xl border border-white/10 bg-[#0A1736] p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Decision Domain</label>
                <select
                  value={filters.domain}
                  onChange={e => setFilters(f => ({ ...f, domain: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="">All domains</option>
                  {data?.availableFilters.domains.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Resolution Status</label>
                <select
                  value={filters.status}
                  onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                >
                  <option value="">All statuses</option>
                  {data?.availableFilters.statuses.map(s => (
                    <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Min Probability</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="0.0"
                  value={filters.confidenceMin}
                  onChange={e => setFilters(f => ({ ...f, confidenceMin: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Max Probability</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="1"
                  placeholder="1.0"
                  value={filters.confidenceMax}
                  onChange={e => setFilters(f => ({ ...f, confidenceMax: e.target.value }))}
                  className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
                />
              </div>
            </div>
            {(filters.domain || filters.status || filters.confidenceMin || filters.confidenceMax || filters.dateFrom || filters.dateTo) && (
              <button
                onClick={() => setFilters({ domain: "", status: "", confidenceMin: "", confidenceMax: "", dateFrom: "", dateTo: "" })}
                className="mt-3 text-xs text-indigo-400 hover:text-indigo-300"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Total Forecasts" value={cm?.totalForecasts ?? 0} icon={<Layers className="w-4 h-4 text-indigo-400" />} />
          <MetricCard label="Resolved" value={cm?.resolvedForecasts ?? 0} icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />} subtext={cm?.totalForecasts ? `${((cm.resolvedForecasts / cm.totalForecasts) * 100).toFixed(0)}% resolved` : undefined} />
          <MetricCard label="Open" value={cm?.openForecasts ?? 0} icon={<Clock className="w-4 h-4 text-amber-400" />} />
          <MetricCard
            label="Mean Accuracy Score"
            value={brierLabel(cm?.meanBrierScore ?? null)}
            icon={<Target className="w-4 h-4 text-emerald-400" />}
            valueColor={brierColor(cm?.meanBrierScore ?? null)}
            subtext="0 = perfect"
          />
          <MetricCard
            label="Median Accuracy Score"
            value={brierLabel(cm?.medianBrierScore ?? null)}
            icon={<Activity className="w-4 h-4 text-blue-400" />}
            valueColor={brierColor(cm?.medianBrierScore ?? null)}
          />
          <MetricCard
            label="Mean Absolute Error"
            value={cm?.meanAbsoluteError != null ? `${(cm.meanAbsoluteError * 100).toFixed(1)}pp` : "\u2014"}
            icon={<AlertTriangle className="w-4 h-4 text-amber-400" />}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MetricCard
            label="Overconfidence Rate"
            value={pct(cm?.overconfidenceRate)}
            icon={<TrendingDown className="w-4 h-4 text-red-400" />}
            subtext="Predicted > actual by 5+pp"
          />
          <MetricCard
            label="Underconfidence Rate"
            value={pct(cm?.underconfidenceRate)}
            icon={<TrendingUp className="w-4 h-4 text-blue-400" />}
            subtext="Actual > predicted by 5+pp"
          />
          <MetricCard
            label="Forecast Revisions"
            value={cm?.forecastRevisionCount ?? 0}
            icon={<GitBranch className="w-4 h-4 text-purple-400" />}
          />
          <MetricCard
            label="Revision Improvement"
            value={cm?.revisionImprovementRate != null ? pct(cm.revisionImprovementRate) : "\u2014"}
            icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
            subtext="Revisions that moved closer to outcome"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Reliability Diagram</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Predicted vs. actual outcome for resolved forecasts. Points on the diagonal indicate perfect calibration.
            </p>
            {calibrationScatterData.length === 0 ? (
              <EmptyState icon={<Target className="w-8 h-8" />} message="No resolved forecasts yet" detail="Resolve forecasts to populate this chart." />
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis type="number" dataKey="x" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#94a3b8" }}>
                    <Label value="Predicted (%)" position="insideBottom" offset={-18} fontSize={11} fill="#64748b" />
                  </XAxis>
                  <YAxis type="number" dataKey="y" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: "#94a3b8" }}>
                    <Label value="Actual (%)" angle={-90} position="insideLeft" offset={18} fontSize={11} fill="#64748b" />
                  </YAxis>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0]?.payload;
                      return (
                        <div className="bg-[#0A1736] border border-white/10 rounded-lg p-2.5 text-xs shadow-lg">
                          <p className="font-mono font-semibold mb-1 text-white">{d?.id}</p>
                          <p className="text-slate-300">Predicted: <span className="text-white font-medium">{d?.x}%</span></p>
                          <p className="text-slate-300">Actual: <span className="text-white font-medium">{d?.y}%</span></p>
                          <p className="text-slate-400">Accuracy: {d?.brier}</p>
                        </div>
                      );
                    }}
                  />
                  <ReferenceLine
                    segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]}
                    stroke="rgba(255,255,255,0.2)"
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                  />
                  <Scatter data={calibrationScatterData} fill="#818cf8" fillOpacity={0.8} r={6} />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
            <div className="flex items-center gap-2 mb-1">
              <BarChart2 className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-semibold text-white">Calibration by Probability Bucket</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Predicted vs. realized frequency by bucket. Gap shows whether forecasts in that range behave as expected.
            </p>
            {calibrationCurveData.length === 0 ? (
              <EmptyState icon={<BarChart2 className="w-8 h-8" />} message="No calibration data yet" detail="Resolve forecasts to see bucket analysis." />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={calibrationCurveData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <YAxis tickFormatter={v => `${v}%`} tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="bg-[#0A1736] border border-white/10 rounded-lg p-2.5 text-xs shadow-lg">
                            <p className="font-semibold text-white mb-1">{d?.bucket}</p>
                            <p className="text-slate-300">Mean Predicted: <span className="text-white">{d?.predicted}%</span></p>
                            <p className="text-slate-300">Mean Actual: <span className="text-white">{d?.actual}%</span></p>
                            <p className="text-slate-300">Gap: <span className={d?.gap > 0 ? "text-amber-400" : "text-blue-400"}>{d?.gap > 0 ? "+" : ""}{d?.gap}pp</span></p>
                            <p className="text-slate-400">n = {d?.count}</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="predicted" name="Predicted" fill="#818cf8" fillOpacity={0.4} radius={[4, 4, 0, 0]} />
                    <Bar dataKey="actual" name="Actual" fill="#34d399" fillOpacity={0.7} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center justify-center gap-6 mt-2 text-xs text-slate-400">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-400/40" /> Predicted</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-400/70" /> Actual</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-white">Bias & Failure Pattern Analysis</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Structural patterns correlated with forecast errors. Tracks concentration, diversity, fragility, and confidence issues.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {data?.biasPatterns.map(p => (
              <div
                key={p.pattern}
                className={`rounded-lg border p-3 ${p.count > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-white/5 bg-white/[0.01]"}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-300">{patternLabel(p.pattern)}</span>
                  <span className={`text-lg font-bold ${p.count > 0 ? "text-amber-400" : "text-slate-600"}`}>{p.count}</span>
                </div>
                <p className="text-[10px] text-slate-500 leading-tight">{p.description}</p>
                {p.count > 0 && p.entries.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.entries.slice(0, 3).map(id => (
                      <span key={id} className="text-[9px] font-mono text-amber-400/60 bg-amber-500/10 px-1.5 py-0.5 rounded">{id.slice(0, 18)}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {data?.domainBreakdowns && data.domainBreakdowns.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-white">Performance by Domain</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Accuracy breakdown by decision domain. Identifies where the system is reliable and where it is weak.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs text-slate-400 font-medium pb-2 pr-4">Domain</th>
                    <th className="text-right text-xs text-slate-400 font-medium pb-2 px-3">Total</th>
                    <th className="text-right text-xs text-slate-400 font-medium pb-2 px-3">Resolved</th>
                    <th className="text-right text-xs text-slate-400 font-medium pb-2 px-3">Open</th>
                    <th className="text-right text-xs text-slate-400 font-medium pb-2 px-3">Mean Accuracy</th>
                    <th className="text-right text-xs text-slate-400 font-medium pb-2 pl-3">Mean Error</th>
                  </tr>
                </thead>
                <tbody>
                  {data.domainBreakdowns.map(d => (
                    <tr key={d.domain} className="border-b border-white/5 hover:bg-white/[0.02]">
                      <td className="py-2.5 pr-4 text-slate-200 font-medium">{d.domain}</td>
                      <td className="py-2.5 px-3 text-right text-slate-300">{d.totalForecasts}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-400">{d.resolvedCount}</td>
                      <td className="py-2.5 px-3 text-right text-amber-400">{d.openCount}</td>
                      <td className={`py-2.5 px-3 text-right font-mono ${brierColor(d.meanBrier)}`}>
                        {brierLabel(d.meanBrier)}
                      </td>
                      <td className="py-2.5 pl-3 text-right text-slate-300 font-mono">
                        {d.meanError != null ? `${(d.meanError * 100).toFixed(1)}pp` : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
          <div className="flex items-center gap-2 mb-1">
            <GitBranch className="w-4 h-4 text-purple-400" />
            <h3 className="text-sm font-semibold text-white">Forecast Revision Analysis</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Tracks whether updates improved calibration. For each multi-version forecast, shows whether revisions moved closer to reality.
          </p>
          {(!data?.revisionAnalysis || data.revisionAnalysis.length === 0) ? (
            <EmptyState icon={<GitBranch className="w-8 h-8" />} message="No multi-version forecasts" detail="Forecast revisions will appear here when cases are updated multiple times." />
          ) : (
            <div className="space-y-2">
              {data.revisionAnalysis.map(r => (
                <div key={r.caseId} className="rounded-lg border border-white/5 bg-white/[0.01]">
                  <button
                    onClick={() => setExpandedRevision(expandedRevision === r.caseId ? null : r.caseId)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${expandedRevision === r.caseId ? "rotate-90" : ""}`} />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">{r.strategicQuestion?.slice(0, 80) || r.caseId}</div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {r.versionCount} versions
                          {r.firstForecast !== r.finalForecast && (
                            <> &middot; {(r.firstForecast * 100).toFixed(0)}% &rarr; {(r.finalForecast * 100).toFixed(0)}%</>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                      {r.movedCloser != null && (
                        <span className={`text-xs font-medium ${r.movedCloser ? "text-emerald-400" : "text-red-400"}`}>
                          {r.movedCloser ? "Improved" : "Degraded"}
                        </span>
                      )}
                      <StatusBadge status={r.resolutionStatus} />
                    </div>
                  </button>
                  {expandedRevision === r.caseId && (
                    <div className="px-3 pb-3 border-t border-white/5 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                        <div className="text-xs">
                          <span className="text-slate-500">First Forecast</span>
                          <div className="text-slate-200 font-mono">{(r.firstForecast * 100).toFixed(1)}%</div>
                        </div>
                        <div className="text-xs">
                          <span className="text-slate-500">Final Forecast</span>
                          <div className="text-slate-200 font-mono">{(r.finalForecast * 100).toFixed(1)}%</div>
                        </div>
                        <div className="text-xs">
                          <span className="text-slate-500">Outcome</span>
                          <div className="text-slate-200 font-mono">{r.outcome != null ? `${(r.outcome * 100).toFixed(1)}%` : "\u2014"}</div>
                        </div>
                        <div className="text-xs">
                          <span className="text-slate-500">Confidence Change</span>
                          <div className={`font-medium ${
                            r.confidenceChange === "more_justified" ? "text-emerald-400" :
                            r.confidenceChange === "less_justified" ? "text-red-400" : "text-slate-400"
                          }`}>
                            {r.confidenceChange === "more_justified" ? "More justified" :
                             r.confidenceChange === "less_justified" ? "Less justified" :
                             r.confidenceChange === "unchanged" ? "Unchanged" : "\u2014"}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        {r.versions.map(v => (
                          <div key={v.version} className="flex items-center gap-3 text-xs">
                            <span className="text-slate-500 font-mono w-6">v{v.version}</span>
                            <span className="text-slate-300 font-mono w-12">{(v.probability * 100).toFixed(1)}%</span>
                            <span className="text-slate-500 w-24">{v.date ? new Date(v.date).toLocaleDateString() : ""}</span>
                            <span className="text-slate-400 truncate">{v.rationale ?? ""}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Reference Case Linkage</h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Info className="w-3 h-3 mr-1" />
              Informational Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Patterns and lessons from the Reference Case Library. These do not alter forecast calculations. They provide calibration context and structural interpretation.
          </p>

          {data?.referenceCaseLinkage && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <h4 className="text-xs font-medium text-slate-300 mb-2">Most Common Structural Tags ({data.referenceCaseLinkage.totalReferenceCases} cases)</h4>
                <div className="space-y-1.5">
                  {data.referenceCaseLinkage.mostMatchedPatterns.map(p => (
                    <div key={p.tag} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{p.tag}</span>
                      <span className="text-slate-300 font-mono">{p.count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-slate-300 mb-2">Bias Patterns Correlated with Misses</h4>
                <div className="space-y-1.5">
                  {data.referenceCaseLinkage.missCorrelations.map(m => (
                    <div key={m.pattern} className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">{m.pattern}</span>
                      <span className="text-slate-300">
                        <span className={m.missCount > 0 ? "text-amber-400" : "text-emerald-400"}>{m.missCount}</span>
                        <span className="text-slate-600"> / {m.total}</span>
                      </span>
                    </div>
                  ))}
                  {data.referenceCaseLinkage.missCorrelations.length === 0 && (
                    <p className="text-xs text-slate-500 italic">No bias patterns recorded</p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-xs font-medium text-slate-300 mb-2">Recurring Calibration Lessons</h4>
                <div className="space-y-2">
                  {data.referenceCaseLinkage.recurringLessons.slice(0, 4).map((lesson, i) => (
                    <p key={i} className="text-[11px] text-slate-400 leading-relaxed border-l-2 border-cyan-500/30 pl-2">
                      {lesson.slice(0, 140)}...
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {data?.resolvedEntries && data.resolvedEntries.length > 0 && (
          <div className="rounded-xl border border-white/10 bg-[#0A1736] p-5">
            <div className="flex items-center gap-2 mb-1">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Resolved Forecast Detail</h3>
            </div>
            <p className="text-xs text-slate-400 mb-4">
              Individual resolved forecasts with dependency metrics. Click to expand.
            </p>
            <div className="space-y-1.5">
              {data.resolvedEntries.map(e => (
                <div key={e.predictionId} className="rounded-lg border border-white/5 bg-white/[0.01]">
                  <button
                    onClick={() => setExpandedEntry(expandedEntry === e.predictionId ? null : e.predictionId)}
                    className="w-full flex items-center justify-between p-3 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform flex-shrink-0 ${expandedEntry === e.predictionId ? "rotate-90" : ""}`} />
                      <div className="min-w-0">
                        <div className="text-sm text-slate-200 truncate">{e.strategicQuestion?.slice(0, 70)}</div>
                        <div className="text-xs text-slate-500 mt-0.5 font-mono">{e.predictionId}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-3">
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Predicted</div>
                        <div className="text-sm text-slate-200 font-mono">{(e.forecastProbability * 100).toFixed(1)}%</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Actual</div>
                        <div className="text-sm text-slate-200 font-mono">{e.actualOutcome != null ? `${(e.actualOutcome * 100).toFixed(1)}%` : "\u2014"}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Accuracy</div>
                        <div className={`text-sm font-mono ${brierColor(e.brierScore)}`}>{brierLabel(e.brierScore)}</div>
                      </div>
                      <StatusBadge status={e.resolutionStatus} />
                    </div>
                  </button>
                  {expandedEntry === e.predictionId && (
                    <div className="px-3 pb-3 border-t border-white/5 pt-3">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                        <MiniMetric label="Domain" value={e.decisionDomain ?? "Unspecified"} />
                        <MiniMetric label="Prediction Error" value={e.predictionError != null ? `${(e.predictionError * 100).toFixed(1)}pp` : "\u2014"} />
                        <MiniMetric label="Evidence Diversity" value={e.evidenceDiversityScore != null ? e.evidenceDiversityScore.toFixed(2) : "\u2014"} />
                        <MiniMetric label="Fragility" value={e.posteriorFragilityScore != null ? e.posteriorFragilityScore.toFixed(2) : "\u2014"} />
                        <MiniMetric label="Concentration Penalty" value={e.concentrationPenalty != null ? e.concentrationPenalty.toFixed(3) : "\u2014"} />
                        <MiniMetric label="Confidence Ceiling" value={e.confidenceCeilingApplied != null ? `${(e.confidenceCeilingApplied * 100).toFixed(0)}%` : "None"} />
                        <MiniMetric label="Calibration Bucket" value={e.calibrationBucket} />
                        <MiniMetric label="Version" value={`v${e.updateVersion}`} />
                        <MiniMetric label="Forecast Date" value={e.forecastDate ? new Date(e.forecastDate).toLocaleDateString() : "\u2014"} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, subtext, valueColor }: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  subtext?: string;
  valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#0A1736] p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${valueColor ?? "text-white"}`}>{value}</div>
      {subtext && <div className="text-[10px] text-slate-500 mt-1">{subtext}</div>}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <span className="text-slate-500">{label}</span>
      <div className="text-slate-200 font-mono mt-0.5">{value}</div>
    </div>
  );
}

function EmptyState({ icon, message, detail }: { icon: React.ReactNode; message: string; detail: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 text-slate-500/40 gap-2">
      {icon}
      <p className="text-sm font-medium text-slate-400">{message}</p>
      <p className="text-xs text-center max-w-52 text-slate-500">{detail}</p>
    </div>
  );
}
