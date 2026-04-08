import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout";
import { Card, Badge } from "@/components/ui-components";
import {
  BookOpen, Clock, Target, CheckCircle2, XCircle, AlertCircle,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, Shield,
  GitBranch, BarChart3, FileText, RefreshCw, ArrowRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface LedgerEntry {
  id: string;
  predictionId: string;
  caseId: string;
  strategicQuestion: string;
  decisionDomain: string | null;
  comparisonGroups: string | null;
  forecastProbability: number;
  forecastDate: string;
  timeHorizon: string;
  forecastHorizonMonths: number | null;
  expectedResolutionDate: string | null;
  priorProbability: number | null;
  confidenceLevel: string | null;
  confidenceCeilingApplied: number | null;
  confidenceCeilingReason: string | null;
  evidenceDiversityScore: number | null;
  posteriorFragilityScore: number | null;
  concentrationPenalty: number | null;
  independentEvidenceFamilyCount: number | null;
  rawSignalCount: number | null;
  compressedSignalCount: number | null;
  keyDriversSummary: string | null;
  topLineageClusters: string | null;
  counterSignalsSummary: string | null;
  environmentAdjustments: string | null;
  updateVersion: number;
  updateRationale: string | null;
  previousPredictionId: string | null;
  resolutionStatus: string | null;
  resolutionDate: string | null;
  resolvedOutcome: number | null;
  actualOutcome: number | null;
  brierScore: number | null;
  calibrationBucket: string | null;
  predictionError: number | null;
  snapshotJson: string | null;
}

interface CalibrationSummary {
  totalResolved: number;
  meanBrierScore: number | null;
  calibrationBuckets: { bucket: string; count: number; meanBrierScore: number; meanPredicted: number; meanActual: number }[];
}

function statusBadge(status: string | null) {
  switch (status) {
    case "resolved_true": return { label: "Resolved True", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" };
    case "resolved_false": return { label: "Resolved False", color: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    case "partially_resolved": return { label: "Partial", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    case "not_resolvable": return { label: "Not Resolvable", color: "bg-slate-500/15 text-slate-400 border-slate-500/30" };
    default: return { label: "Open", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" };
  }
}

function metricColor(value: number, invert = false): string {
  const v = invert ? 1 - value : value;
  if (v >= 0.7) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

function brierQuality(score: number): { label: string; color: string } {
  if (score <= 0.1) return { label: "Excellent", color: "text-emerald-400" };
  if (score <= 0.2) return { label: "Good", color: "text-blue-400" };
  if (score <= 0.3) return { label: "Fair", color: "text-amber-400" };
  return { label: "Poor", color: "text-rose-400" };
}

function safeParseJson(json: string | null): any[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function EntryDetail({ entry, allEntries }: { entry: LedgerEntry; allEntries: LedgerEntry[] }) {
  const drivers = safeParseJson(entry.keyDriversSummary);
  const counterSignals = safeParseJson(entry.counterSignalsSummary);
  const clusters = safeParseJson(entry.topLineageClusters);
  const prevEntry = allEntries.find(e => e.predictionId === entry.previousPredictionId);

  return (
    <div className="space-y-4 px-4 pb-4 pt-2">
      {prevEntry && (
        <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70 mb-2">Version Movement</div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-sm font-bold text-slate-400">v{prevEntry.updateVersion}</div>
              <div className="text-lg font-bold text-slate-300">{Math.round(prevEntry.forecastProbability * 100)}%</div>
            </div>
            <ArrowRight className="w-4 h-4 text-indigo-400" />
            <div className="text-center">
              <div className="text-sm font-bold text-indigo-400">v{entry.updateVersion}</div>
              <div className="text-lg font-bold text-white">{Math.round(entry.forecastProbability * 100)}%</div>
            </div>
            <div className="text-sm font-semibold ml-2">
              {entry.forecastProbability > prevEntry.forecastProbability ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-3.5 h-3.5" />
                  +{Math.round((entry.forecastProbability - prevEntry.forecastProbability) * 100)} pts
                </span>
              ) : entry.forecastProbability < prevEntry.forecastProbability ? (
                <span className="text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-3.5 h-3.5" />
                  {Math.round((entry.forecastProbability - prevEntry.forecastProbability) * 100)} pts
                </span>
              ) : (
                <span className="text-slate-500">No change</span>
              )}
            </div>
          </div>
        </div>
      )}

      {entry.updateRationale && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Update Rationale</div>
          <div className="text-xs text-slate-300 leading-relaxed">{entry.updateRationale}</div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Prior</div>
          <div className="text-sm font-bold text-white">{entry.priorProbability != null ? `${Math.round(entry.priorProbability * 100)}%` : "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Posterior</div>
          <div className="text-sm font-bold text-white">{Math.round(entry.forecastProbability * 100)}%</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Confidence</div>
          <div className="text-sm font-bold text-white">{entry.confidenceLevel ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Signals</div>
          <div className="text-sm font-bold text-white">{entry.rawSignalCount ?? "—"} raw / {entry.compressedSignalCount ?? "—"} compressed</div>
        </div>
      </div>

      {(entry.confidenceCeilingApplied != null || entry.evidenceDiversityScore != null) && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70">Dependency Control Metrics</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {entry.evidenceDiversityScore != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className={cn("text-sm font-bold", metricColor(entry.evidenceDiversityScore))}>
                  {Math.round(entry.evidenceDiversityScore * 100)}%
                </div>
                <div className="text-[10px] text-slate-500">Diversity</div>
              </div>
            )}
            {entry.posteriorFragilityScore != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className={cn("text-sm font-bold", metricColor(entry.posteriorFragilityScore, true))}>
                  {Math.round(entry.posteriorFragilityScore * 100)}%
                </div>
                <div className="text-[10px] text-slate-500">Fragility</div>
              </div>
            )}
            {entry.independentEvidenceFamilyCount != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className="text-sm font-bold text-white">{entry.independentEvidenceFamilyCount}</div>
                <div className="text-[10px] text-slate-500">Indep. Families</div>
              </div>
            )}
            {entry.confidenceCeilingApplied != null && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
                <div className="text-sm font-bold text-amber-400">{Math.round(entry.confidenceCeilingApplied * 100)}%</div>
                <div className="text-[10px] text-slate-500">Ceiling Applied</div>
              </div>
            )}
          </div>
        </div>
      )}

      {clusters.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70">Top Lineage Clusters</div>
          <div className="space-y-1">
            {clusters.map((cl: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                <GitBranch className="w-3 h-3 text-indigo-400/60 shrink-0" />
                <span className="text-slate-300 truncate flex-1">{cl.rootDesc}</span>
                <span className="text-slate-600 shrink-0">{cl.cluster}</span>
                <span className="text-slate-600 shrink-0">{cl.count} signals</span>
                {cl.echoes > 0 && <span className="text-slate-600 shrink-0">{cl.echoes}e</span>}
                {cl.translations > 0 && <span className="text-blue-400/60 shrink-0">{cl.translations}t</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {drivers.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Key Positive Drivers</div>
          <div className="space-y-1">
            {drivers.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded border border-emerald-500/10 bg-emerald-500/5">
                <TrendingUp className="w-3 h-3 text-emerald-400/60 shrink-0" />
                <span className="text-slate-300 truncate flex-1">{d.desc}</span>
                <span className="text-emerald-400/60 font-mono shrink-0">LR {d.lr?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {counterSignals.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">Counter-Signals</div>
          <div className="space-y-1">
            {counterSignals.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded border border-rose-500/10 bg-rose-500/5">
                <TrendingDown className="w-3 h-3 text-rose-400/60 shrink-0" />
                <span className="text-slate-300 truncate flex-1">{d.desc}</span>
                <span className="text-rose-400/60 font-mono shrink-0">LR {d.lr?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {entry.brierScore != null && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">Resolution & Scoring</div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <div className={cn("text-sm font-bold", brierQuality(entry.brierScore).color)}>
                {entry.brierScore.toFixed(4)}
              </div>
              <div className="text-[10px] text-slate-500">Brier Score ({brierQuality(entry.brierScore).label})</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white">{entry.predictionError != null ? (entry.predictionError * 100).toFixed(1) + " pts" : "—"}</div>
              <div className="text-[10px] text-slate-500">Prediction Error</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-bold text-white">{entry.calibrationBucket ?? "—"}</div>
              <div className="text-[10px] text-slate-500">Calibration Bucket</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ResolveModal({ entry, onClose, onResolved }: { entry: LedgerEntry; onClose: () => void; onResolved: () => void }) {
  const [status, setStatus] = useState("resolved_true");
  const [partialOutcome, setPartialOutcome] = useState("0.5");
  const [saving, setSaving] = useState(false);

  const [error, setError] = useState<string | null>(null);

  const handleResolve = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: any = { resolutionStatus: status };
      if (status === "partially_resolved") {
        const val = parseFloat(partialOutcome);
        if (!Number.isFinite(val) || val < 0 || val > 1) {
          setError("Outcome must be a number between 0 and 1");
          setSaving(false);
          return;
        }
        body.resolvedOutcome = val;
      }
      const res = await fetch(`${API_BASE}/forecast-ledger/${entry.predictionId}/resolve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setError(errData.error || `Failed to resolve (${res.status})`);
        setSaving(false);
        return;
      }
      onResolved();
    } catch (e: any) {
      setError(e.message ?? "Failed to resolve");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-white">Resolve Forecast</h3>
        <p className="text-[10px] text-slate-400 truncate">{entry.strategicQuestion}</p>
        <p className="text-xs text-slate-400">Forecast: {Math.round(entry.forecastProbability * 100)}%</p>

        <div className="space-y-2">
          {[
            { value: "resolved_true", label: "Resolved True (outcome = 1)" },
            { value: "resolved_false", label: "Resolved False (outcome = 0)" },
            { value: "partially_resolved", label: "Partially Resolved" },
            { value: "not_resolvable", label: "Not Resolvable" },
          ].map(opt => (
            <label key={opt.value} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="radio"
                name="resolution"
                value={opt.value}
                checked={status === opt.value}
                onChange={() => setStatus(opt.value)}
                className="accent-indigo-400"
              />
              {opt.label}
            </label>
          ))}
        </div>

        {status === "partially_resolved" && (
          <div className="space-y-1">
            <label className="text-[10px] text-slate-500">Outcome value (0–1)</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={partialOutcome}
              onChange={e => setPartialOutcome(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs text-white"
            />
          </div>
        )}

        {error && (
          <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</div>
        )}

        <div className="flex gap-2 justify-end pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white cursor-pointer">Cancel</button>
          <button
            onClick={handleResolve}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 text-xs font-medium text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving..." : "Resolve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ForecastLedger() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [calibration, setCalibration] = useState<CalibrationSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [resolvingEntry, setResolvingEntry] = useState<LedgerEntry | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ledgerRes, calRes] = await Promise.all([
        fetch(`${API_BASE}/forecast-ledger`),
        fetch(`${API_BASE}/forecast-ledger/calibration/summary`),
      ]);
      const ledgerData = await ledgerRes.json();
      const calData = await calRes.json();
      setEntries(Array.isArray(ledgerData) ? ledgerData : []);
      setCalibration(calData);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const resolved = entries.filter(e => e.resolutionStatus && e.resolutionStatus !== "open");
  const pending = entries.filter(e => !e.resolutionStatus || e.resolutionStatus === "open");
  const uniqueCases = new Set(entries.map(e => e.caseId)).size;

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Calibration Memory
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">Forecast Ledger</h1>
          <p className="text-sm text-slate-400 mt-1">
            Every forecast is a tracked, versioned, resolvable decision record with full inference state.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <Target className="w-4 h-4 text-indigo-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{entries.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">Total Forecasts</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <FileText className="w-4 h-4 text-blue-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-400">{uniqueCases}</div>
            <div className="text-[10px] text-slate-500 mt-1">Unique Cases</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <Clock className="w-4 h-4 text-amber-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-400">{pending.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">In Progress</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-emerald-400">{resolved.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">Resolved</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <BarChart3 className="w-4 h-4 text-violet-400 mx-auto mb-2" />
            <div className={cn("text-2xl font-bold", calibration?.meanBrierScore != null ? brierQuality(calibration.meanBrierScore).color : "text-slate-500")}>
              {calibration?.meanBrierScore != null ? calibration.meanBrierScore.toFixed(3) : "—"}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Mean Brier Score</div>
          </div>
        </div>

        {calibration && calibration.calibrationBuckets.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-3">Calibration Buckets</div>
            <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
              {calibration.calibrationBuckets.map((b) => (
                <div key={b.bucket} className="text-center rounded-lg border border-white/5 bg-white/[0.02] p-2">
                  <div className="text-[10px] text-slate-500">{b.bucket}</div>
                  <div className="text-xs font-bold text-white">{b.count}</div>
                  <div className="text-[10px] text-slate-600">Brier {b.meanBrierScore.toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-[#0A1736] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Forecast History</h3>
            <button
              onClick={fetchData}
              className="flex items-center gap-1 text-[10px] text-indigo-400 hover:text-indigo-300 cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Refresh
            </button>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-slate-500">Loading ledger...</div>
          ) : entries.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <BookOpen className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No forecasts recorded yet.</p>
              <p className="text-[10px] text-slate-600 mt-1">
                Forecasts are automatically saved to the ledger when the engine runs on any case.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map((entry) => {
                const isExpanded = expandedId === entry.id;
                const sb = statusBadge(entry.resolutionStatus);
                return (
                  <div key={entry.id}>
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition"
                      onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    >
                      <div className="w-7 text-center shrink-0">
                        <span className="text-[10px] font-mono text-indigo-400">v{entry.updateVersion}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-medium truncate">{entry.strategicQuestion}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {entry.decisionDomain && <span className="mr-2">{entry.decisionDomain}</span>}
                          {new Date(entry.forecastDate).toLocaleDateString()} · {entry.timeHorizon}
                          {entry.caseId && <span className="ml-2 text-slate-700">#{entry.caseId.slice(0, 8)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-16">
                        <div className="text-sm font-bold font-mono text-white">{Math.round(entry.forecastProbability * 100)}%</div>
                        <div className="text-[10px] text-slate-600">{entry.calibrationBucket}</div>
                      </div>
                      <div className="shrink-0 w-24 text-center">
                        <span className={cn("inline-block text-[10px] px-2 py-0.5 rounded border", sb.color)}>{sb.label}</span>
                      </div>
                      <div className="shrink-0 w-16 text-right">
                        {entry.brierScore != null ? (
                          <span className={cn("text-xs font-mono", brierQuality(entry.brierScore).color)}>
                            {entry.brierScore.toFixed(3)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-700">—</span>
                        )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        {entry.resolutionStatus === "open" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setResolvingEntry(entry); }}
                            className="text-[10px] text-indigo-400 hover:text-indigo-300 px-2 py-1 rounded border border-indigo-500/20 cursor-pointer"
                          >
                            Resolve
                          </button>
                        )}
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </div>
                    {isExpanded && <EntryDetail entry={entry} allEntries={entries} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-600 leading-snug px-1">
          The Forecast Ledger is the calibration memory of CIOS. Every forecast is versioned, preserving the reasoning state that produced it. Resolution and Brier scoring enable continuous improvement of forecast accuracy.
        </div>
      </div>

      {resolvingEntry && (
        <ResolveModal
          entry={resolvingEntry}
          onClose={() => setResolvingEntry(null)}
          onResolved={() => { setResolvingEntry(null); fetchData(); }}
        />
      )}
    </AppLayout>
  );
}
