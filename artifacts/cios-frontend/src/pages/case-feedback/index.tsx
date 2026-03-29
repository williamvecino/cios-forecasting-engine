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
  PieChart,
  Pie,
} from "recharts";
import {
  MessageSquarePlus,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Filter,
  Download,
  Layers,
  Bug,
  Lightbulb,
  Trash2,
  Edit3,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL ?? "";

interface FeedbackEntry {
  id: string;
  caseId: string;
  step: string;
  observedBehavior: string;
  expectedBehavior: string;
  impact: string;
  category: string;
  reproducible: string;
  status: string;
  screenshotRef: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

interface CaseOption {
  caseId: string;
  assetName: string;
  primaryBrand: string;
  strategicQuestion: string;
}

const STEPS = ["Define", "Add Information", "Judge", "Decide", "Respond", "Simulate", "Resolve", "General"];
const IMPACTS = ["Critical", "High", "Medium", "Low"];
const CATEGORIES = [
  "Driver selection", "Dependency control", "Confidence logic", "UI rendering",
  "Workflow logic", "Reaction weighting", "Translation strength", "Case typing",
  "Data pipeline", "Other",
];
const REPRODUCIBLE_OPTS = ["Yes", "No", "Unknown"];
const STATUSES = ["Open", "Triaged", "Fixed", "Retest needed"];

const IMPACT_COLORS: Record<string, string> = {
  Critical: "#f87171",
  High: "#fb923c",
  Medium: "#fbbf24",
  Low: "#94a3b8",
};

const STATUS_COLORS: Record<string, string> = {
  Open: "#f87171",
  Triaged: "#fbbf24",
  Fixed: "#34d399",
  "Retest needed": "#818cf8",
};

function impactIcon(impact: string) {
  switch (impact) {
    case "Critical": return <AlertTriangle className="w-3.5 h-3.5 text-red-400" />;
    case "High": return <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />;
    case "Medium": return <Clock className="w-3.5 h-3.5 text-amber-400" />;
    default: return <Lightbulb className="w-3.5 h-3.5 text-slate-400" />;
  }
}

function statusBg(status: string): string {
  switch (status) {
    case "Open": return "bg-red-500/20 border-red-500/30 text-red-300";
    case "Triaged": return "bg-amber-500/20 border-amber-500/30 text-amber-300";
    case "Fixed": return "bg-emerald-500/20 border-emerald-500/30 text-emerald-300";
    case "Retest needed": return "bg-indigo-500/20 border-indigo-500/30 text-indigo-300";
    default: return "bg-slate-500/20 border-slate-500/30 text-slate-300";
  }
}

export default function CaseFeedbackPage() {
  const queryClient = useQueryClient();
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stepFilter, setStepFilter] = useState("all");
  const [impactFilter, setImpactFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingStatus, setEditingStatus] = useState<string | null>(null);

  const [formStep, setFormStep] = useState("General");
  const [formObserved, setFormObserved] = useState("");
  const [formExpected, setFormExpected] = useState("");
  const [formImpact, setFormImpact] = useState("Medium");
  const [formCategory, setFormCategory] = useState("Other");
  const [formReproducible, setFormReproducible] = useState("Unknown");
  const [formNotes, setFormNotes] = useState("");
  const [formScreenshot, setFormScreenshot] = useState("");

  const { data: cases = [] } = useQuery<CaseOption[]>({
    queryKey: ["cases-list"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/cases`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const activeCaseId = selectedCaseId || (cases.length > 0 ? cases[0].caseId : "");

  const { data: entries = [], isLoading } = useQuery<FeedbackEntry[]>({
    queryKey: ["case-feedback", activeCaseId],
    queryFn: async () => {
      if (!activeCaseId) return [];
      const r = await fetch(`${API}/api/cases/${activeCaseId}/feedback`);
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!activeCaseId,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: formStep,
          observedBehavior: formObserved,
          expectedBehavior: formExpected,
          impact: formImpact,
          category: formCategory,
          reproducible: formReproducible,
          notes: formNotes || undefined,
          screenshotRef: formScreenshot || undefined,
        }),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ error: "Failed" }));
        throw new Error(err.error || "Failed to create feedback");
      }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-feedback", activeCaseId] });
      setShowForm(false);
      setFormObserved("");
      setFormExpected("");
      setFormNotes("");
      setFormScreenshot("");
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ feedbackId, status }: { feedbackId: string; status: string }) => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/feedback/${feedbackId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-feedback", activeCaseId] });
      setEditingStatus(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (feedbackId: string) => {
      const r = await fetch(`${API}/api/cases/${activeCaseId}/feedback/${feedbackId}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Failed to delete");
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-feedback", activeCaseId] });
    },
  });

  const filtered = useMemo(() => {
    let list = entries;
    if (stepFilter !== "all") list = list.filter(e => e.step === stepFilter);
    if (impactFilter !== "all") list = list.filter(e => e.impact === impactFilter);
    if (statusFilter !== "all") list = list.filter(e => e.status === statusFilter);
    return list;
  }, [entries, stepFilter, impactFilter, statusFilter]);

  const stepDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of entries) counts[e.step] = (counts[e.step] || 0) + 1;
    return Object.entries(counts)
      .map(([step, count]) => ({ step, count }))
      .sort((a, b) => b.count - a.count);
  }, [entries]);

  const openCritical = entries.filter(e => e.impact === "Critical" && e.status === "Open").length;
  const openHigh = entries.filter(e => e.impact === "High" && e.status === "Open").length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a12] via-[#10101c] to-[#0c0c18] text-slate-100 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/forecast" className="text-slate-400 hover:text-slate-200">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <Bug className="w-6 h-6 text-amber-400" />
          <h1 className="text-2xl font-bold tracking-tight">Case Feedback</h1>
        </div>
        <p className="text-slate-400 text-sm -mt-2 ml-11">
          Capture and track test learnings per case. Feedback does not alter calculations — it clusters patterns for systematic improvement.
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
            onClick={() => setShowForm(true)}
            disabled={!activeCaseId}
            className="flex items-center gap-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <MessageSquarePlus className="w-4 h-4" />
            Add Feedback
          </button>

          {entries.length > 0 && (
            <a
              href={`${API}/api/feedback/export`}
              className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-lg text-sm text-slate-300 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export All
            </a>
          )}
        </div>

        {entries.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Total Entries</div>
              <div className="text-2xl font-bold text-slate-100 mt-1">{entries.length}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Open Critical</div>
              <div className="text-2xl font-bold text-red-400 mt-1">{openCritical}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Open High</div>
              <div className="text-2xl font-bold text-orange-400 mt-1">{openHigh}</div>
            </div>
            <div className="bg-white/[0.03] border border-white/10 rounded-xl p-4">
              <div className="text-xs text-slate-500">Fixed</div>
              <div className="text-2xl font-bold text-emerald-400 mt-1">{entries.filter(e => e.status === "Fixed").length}</div>
            </div>
          </div>
        )}

        {stepDistribution.length > 0 && (
          <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-5">
            <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
              <Layers className="w-4 h-4 text-amber-400" />
              Feedback by Step
            </h2>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={stepDistribution} margin={{ left: 4, right: 16, top: 4, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                <XAxis dataKey="step" tick={{ fill: "#cbd5e1", fontSize: 11 }} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "#1e1e2e", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex items-center gap-3 flex-wrap">
            <select value={stepFilter} onChange={e => setStepFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="all" className="bg-slate-900">All Steps</option>
              {STEPS.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
            </select>
            <select value={impactFilter} onChange={e => setImpactFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="all" className="bg-slate-900">All Impacts</option>
              {IMPACTS.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
            </select>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
              <option value="all" className="bg-slate-900">All Statuses</option>
              {STATUSES.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
            </select>
          </div>
        )}

        {showForm && (
          <div className="bg-white/[0.04] border border-amber-500/30 rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-amber-300">New Feedback Entry</h2>
              <button onClick={() => setShowForm(false)} className="text-slate-500 hover:text-slate-300"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Step *</label>
                <select value={formStep} onChange={e => setFormStep(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {STEPS.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Impact *</label>
                <select value={formImpact} onChange={e => setFormImpact(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {IMPACTS.map(i => <option key={i} value={i} className="bg-slate-900">{i}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category *</label>
                <select value={formCategory} onChange={e => setFormCategory(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {CATEGORIES.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Observed Behavior *</label>
              <textarea
                value={formObserved}
                onChange={e => setFormObserved(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                placeholder="What the system did..."
              />
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Expected Behavior *</label>
              <textarea
                value={formExpected}
                onChange={e => setFormExpected(e.target.value)}
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 resize-none"
                placeholder="What should have happened..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Reproducible</label>
                <select value={formReproducible} onChange={e => setFormReproducible(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200">
                  {REPRODUCIBLE_OPTS.map(r => <option key={r} value={r} className="bg-slate-900">{r}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Screenshot Reference</label>
                <input
                  type="text"
                  value={formScreenshot}
                  onChange={e => setFormScreenshot(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                  placeholder="Optional URL or filename"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Notes</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200"
                  placeholder="Additional context"
                />
              </div>
            </div>

            {createMutation.isError && (
              <div className="text-sm text-red-400">{(createMutation.error as Error).message}</div>
            )}

            <button
              onClick={() => createMutation.mutate()}
              disabled={!formObserved.trim() || !formExpected.trim() || createMutation.isPending}
              className="bg-amber-600 hover:bg-amber-500 disabled:opacity-40 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {createMutation.isPending ? "Saving…" : "Save Feedback"}
            </button>
          </div>
        )}

        {isLoading && <div className="text-center py-16 text-slate-500">Loading feedback…</div>}

        {!isLoading && entries.length === 0 && activeCaseId && (
          <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl">
            <Bug className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-slate-400 text-sm">No feedback entries for this case yet.</div>
            <div className="text-slate-500 text-xs mt-1">Click "Add Feedback" to capture test observations and learnings.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <div
                  key={entry.id}
                  className={`border rounded-2xl transition-all ${isExpanded ? "bg-white/[0.04] border-amber-500/30" : "bg-white/[0.02] border-white/10 hover:border-white/20"}`}
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                    className="w-full text-left px-5 py-4 flex items-center gap-4"
                  >
                    <div className="flex-shrink-0">
                      {impactIcon(entry.impact)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-slate-300">{entry.step}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${IMPACT_COLORS[entry.impact]}20`, color: IMPACT_COLORS[entry.impact] }}>{entry.impact}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${statusBg(entry.status)}`}>{entry.status}</span>
                        <span className="text-xs text-slate-600 bg-white/[0.02] px-2 py-0.5 rounded-full">{entry.category}</span>
                      </div>
                      <div className="text-sm text-slate-300 mt-1 truncate">{entry.observedBehavior.slice(0, 120)}</div>
                    </div>
                    <div className="text-xs text-slate-600 flex-shrink-0">
                      {entry.createdAt ? new Date(entry.createdAt).toLocaleDateString() : ""}
                    </div>
                    {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  </button>

                  {isExpanded && (
                    <div className="px-5 pb-5 space-y-4 border-t border-white/5 pt-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
                          <div className="text-xs font-medium text-red-300 mb-1">Observed Behavior</div>
                          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.observedBehavior}</div>
                        </div>
                        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
                          <div className="text-xs font-medium text-emerald-300 mb-1">Expected Behavior</div>
                          <div className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{entry.expectedBehavior}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Category</div>
                          <div className="text-sm font-medium text-slate-200 mt-1">{entry.category}</div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Reproducible</div>
                          <div className="text-sm font-medium text-slate-200 mt-1">{entry.reproducible}</div>
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Status</div>
                          {editingStatus === entry.id ? (
                            <select
                              defaultValue={entry.status}
                              onChange={e => updateStatusMutation.mutate({ feedbackId: entry.id, status: e.target.value })}
                              className="mt-1 bg-white/5 border border-white/10 rounded px-2 py-1 text-sm text-slate-200"
                            >
                              {STATUSES.map(s => <option key={s} value={s} className="bg-slate-900">{s}</option>)}
                            </select>
                          ) : (
                            <div
                              className="text-sm font-medium text-slate-200 mt-1 cursor-pointer hover:text-amber-300 flex items-center gap-1"
                              onClick={(e) => { e.stopPropagation(); setEditingStatus(entry.id); }}
                            >
                              {entry.status} <Edit3 className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                        <div className="bg-white/[0.03] rounded-lg p-3">
                          <div className="text-xs text-slate-500">Created</div>
                          <div className="text-sm font-medium text-slate-200 mt-1">
                            {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                          </div>
                        </div>
                      </div>

                      {entry.notes && (
                        <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                          <div className="text-xs font-medium text-slate-400 mb-1">Notes</div>
                          <div className="text-sm text-slate-300">{entry.notes}</div>
                        </div>
                      )}

                      {entry.screenshotRef && (
                        <div className="text-xs text-slate-500">Screenshot: <span className="text-slate-300">{entry.screenshotRef}</span></div>
                      )}

                      <div className="flex justify-end">
                        <button
                          onClick={() => { if (confirm("Delete this feedback entry?")) deleteMutation.mutate(entry.id); }}
                          className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Delete
                        </button>
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
