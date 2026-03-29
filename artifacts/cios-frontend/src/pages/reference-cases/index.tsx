import { useEffect, useState, useCallback } from "react";
import { AppLayout } from "@/components/layout";
import { Card } from "@/components/ui-components";
import {
  BookMarked, Tag, Target, TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  GitBranch, Shield, BarChart3, AlertTriangle, CheckCircle2, XCircle, Search
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = import.meta.env.VITE_API_URL || "/api";

interface ReferenceCase {
  id: string;
  referenceCaseId: string;
  caseName: string;
  decisionDomain: string | null;
  questionText: string;
  comparisonGroups: string | null;
  forecastHorizon: string | null;
  initialForecast: number | null;
  finalForecast: number | null;
  confidenceLevel: string | null;
  evidenceDiversityScore: number | null;
  posteriorFragilityScore: number | null;
  concentrationPenalty: number | null;
  independentEvidenceFamilyCount: number | null;
  keyDrivers: string | null;
  keyConstraints: string | null;
  majorLineageClusters: string | null;
  outcome: string | null;
  resolutionType: string | null;
  brierScore: number | null;
  calibrationLesson: string | null;
  biasPattern: string | null;
  structuralTags: string | null;
  caseSummary: string | null;
}

function safeParseJson(json: string | null): any[] {
  if (!json) return [];
  try { return JSON.parse(json); } catch { return []; }
}

function resolutionBadge(type: string | null) {
  switch (type) {
    case "resolved_true": return { label: "Resolved True", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 };
    case "resolved_false": return { label: "Resolved False", color: "bg-rose-500/15 text-rose-400 border-rose-500/30", icon: XCircle };
    case "partially_resolved": return { label: "Partial", color: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: AlertTriangle };
    default: return { label: type || "Unknown", color: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: Target };
  }
}

function brierQuality(score: number): { label: string; color: string } {
  if (score <= 0.1) return { label: "Excellent", color: "text-emerald-400" };
  if (score <= 0.2) return { label: "Good", color: "text-blue-400" };
  if (score <= 0.3) return { label: "Fair", color: "text-amber-400" };
  return { label: "Poor", color: "text-rose-400" };
}

function metricColor(value: number, invert = false): string {
  const v = invert ? 1 - value : value;
  if (v >= 0.7) return "text-emerald-400";
  if (v >= 0.4) return "text-amber-400";
  return "text-rose-400";
}

function CaseDetail({ c }: { c: ReferenceCase }) {
  const drivers = safeParseJson(c.keyDrivers);
  const constraints = safeParseJson(c.keyConstraints);
  const clusters = safeParseJson(c.majorLineageClusters);
  const groups = safeParseJson(c.comparisonGroups);

  return (
    <div className="space-y-4 px-4 pb-4 pt-2">
      {c.caseSummary && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Case Summary</div>
          <div className="text-xs text-slate-300 leading-relaxed">{c.caseSummary}</div>
        </div>
      )}

      <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70 mb-1">Question</div>
        <div className="text-xs text-slate-200 leading-relaxed">{c.questionText}</div>
        {groups.length > 0 && (
          <div className="flex gap-2 mt-2">
            {groups.map((g: string, i: number) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-300">
                {String.fromCharCode(65 + i)}: {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Initial Forecast</div>
          <div className="text-sm font-bold text-white">{c.initialForecast != null ? `${Math.round(c.initialForecast * 100)}%` : "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Final Forecast</div>
          <div className="text-sm font-bold text-white">{c.finalForecast != null ? `${Math.round(c.finalForecast * 100)}%` : "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Confidence</div>
          <div className="text-sm font-bold text-white">{c.confidenceLevel ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-center">
          <div className="text-xs text-slate-500">Brier Score</div>
          <div className={cn("text-sm font-bold", c.brierScore != null ? brierQuality(c.brierScore).color : "text-slate-500")}>
            {c.brierScore != null ? c.brierScore.toFixed(4) : "—"}
          </div>
        </div>
      </div>

      {(c.evidenceDiversityScore != null || c.posteriorFragilityScore != null) && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70">Dependency Control Pattern</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {c.evidenceDiversityScore != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className={cn("text-sm font-bold", metricColor(c.evidenceDiversityScore))}>
                  {Math.round(c.evidenceDiversityScore * 100)}%
                </div>
                <div className="text-[10px] text-slate-500">Diversity</div>
              </div>
            )}
            {c.posteriorFragilityScore != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className={cn("text-sm font-bold", metricColor(c.posteriorFragilityScore, true))}>
                  {Math.round(c.posteriorFragilityScore * 100)}%
                </div>
                <div className="text-[10px] text-slate-500">Fragility</div>
              </div>
            )}
            {c.independentEvidenceFamilyCount != null && (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
                <div className="text-sm font-bold text-white">{c.independentEvidenceFamilyCount}</div>
                <div className="text-[10px] text-slate-500">Indep. Families</div>
              </div>
            )}
            {c.concentrationPenalty != null && c.concentrationPenalty > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-2.5 text-center">
                <div className="text-sm font-bold text-amber-400">{Math.round(c.concentrationPenalty * 100)}%</div>
                <div className="text-[10px] text-slate-500">Concentration</div>
              </div>
            )}
          </div>
        </div>
      )}

      {clusters.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400/70">Major Lineage Clusters</div>
          <div className="space-y-1">
            {clusters.map((cl: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-3 py-2 rounded-lg border border-white/5 bg-white/[0.02]">
                <GitBranch className="w-3 h-3 text-indigo-400/60 shrink-0" />
                <span className="text-slate-300 flex-1">{cl.cluster}</span>
                <span className="text-slate-600">{cl.count} signals</span>
                {cl.echoes > 0 && <span className="text-slate-600">{cl.echoes}e</span>}
                {cl.translations > 0 && <span className="text-blue-400/60">{cl.translations}t</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {drivers.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70">Key Drivers</div>
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

      {constraints.length > 0 && (
        <div className="space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-rose-400/70">Key Constraints</div>
          <div className="space-y-1">
            {constraints.map((d: any, i: number) => (
              <div key={i} className="flex items-center gap-2 text-[10px] px-3 py-1.5 rounded border border-rose-500/10 bg-rose-500/5">
                <TrendingDown className="w-3 h-3 text-rose-400/60 shrink-0" />
                <span className="text-slate-300 truncate flex-1">{d.desc}</span>
                <span className="text-rose-400/60 font-mono shrink-0">LR {d.lr?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {c.calibrationLesson && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 mb-1">Calibration Lesson</div>
          <div className="text-xs text-slate-200 leading-relaxed italic">{c.calibrationLesson}</div>
        </div>
      )}

      {c.biasPattern && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Bias Pattern</div>
          <div className="text-xs text-slate-300">{c.biasPattern}</div>
        </div>
      )}

      {c.outcome && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">Outcome</div>
          <div className="text-xs text-slate-300">{c.outcome}</div>
        </div>
      )}
    </div>
  );
}

export default function ReferenceCasesPage() {
  const [cases, setCases] = useState<ReferenceCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/reference-cases`);
      const data = await res.json();
      setCases(Array.isArray(data) ? data : []);
    } catch {
      setCases([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const allTags = Array.from(new Set(
    cases.flatMap(c => {
      try { return JSON.parse(c.structuralTags || "[]"); } catch { return []; }
    })
  )).sort();

  const filtered = cases.filter(c => {
    if (filterTag) {
      const tags: string[] = safeParseJson(c.structuralTags);
      if (!tags.includes(filterTag)) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        c.caseName.toLowerCase().includes(q) ||
        c.questionText.toLowerCase().includes(q) ||
        (c.calibrationLesson?.toLowerCase().includes(q) ?? false) ||
        (c.biasPattern?.toLowerCase().includes(q) ?? false) ||
        (c.decisionDomain?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  return (
    <AppLayout>
      <div className="space-y-6">
        <header>
          <div className="flex items-center gap-2 mb-2">
            <BookMarked className="w-5 h-5 text-indigo-400" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Calibration Reference
            </span>
          </div>
          <h1 className="text-3xl font-bold text-white">Reference Case Library</h1>
          <p className="text-sm text-slate-400 mt-1">
            Benchmark cases for calibration, structural comparison, and bias detection. These cases inform interpretation — they do not alter forecast calculations.
          </p>
        </header>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search cases, lessons, patterns..."
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-white/10 bg-white/[0.02] text-xs text-white placeholder-slate-600 focus:border-indigo-500/40 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setFilterTag(null)}
              className={cn(
                "text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition",
                !filterTag ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-500 hover:text-slate-300"
              )}
            >
              All
            </button>
            {allTags.map(tag => (
              <button
                key={tag}
                onClick={() => setFilterTag(filterTag === tag ? null : tag)}
                className={cn(
                  "text-[10px] px-2.5 py-1 rounded-lg border cursor-pointer transition",
                  filterTag === tag ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-300" : "border-white/10 text-slate-500 hover:text-slate-300"
                )}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <BookMarked className="w-4 h-4 text-indigo-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-white">{cases.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">Reference Cases</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <Tag className="w-4 h-4 text-blue-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-blue-400">{allTags.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">Structural Tags</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <BarChart3 className="w-4 h-4 text-violet-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-violet-400">
              {cases.filter(c => c.brierScore != null).length > 0
                ? (cases.filter(c => c.brierScore != null).reduce((s, c) => s + (c.brierScore ?? 0), 0) / cases.filter(c => c.brierScore != null).length).toFixed(3)
                : "—"}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Mean Brier Score</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0A1736] p-4 text-center">
            <Shield className="w-4 h-4 text-amber-400 mx-auto mb-2" />
            <div className="text-2xl font-bold text-amber-400">
              {new Set(cases.map(c => c.biasPattern).filter(Boolean)).size}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Bias Patterns</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0A1736] overflow-hidden">
          <div className="px-4 py-3 border-b border-white/5">
            <h3 className="text-sm font-semibold text-white">Reference Cases</h3>
          </div>

          {loading ? (
            <div className="px-4 py-12 text-center text-slate-500">Loading reference cases...</div>
          ) : filtered.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <BookMarked className="w-8 h-8 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No reference cases found.</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((c) => {
                const isExpanded = expandedId === c.id;
                const rb = resolutionBadge(c.resolutionType);
                const Icon = rb.icon;
                const tags: string[] = safeParseJson(c.structuralTags);

                return (
                  <div key={c.id}>
                    <div
                      className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition"
                      onClick={() => setExpandedId(isExpanded ? null : c.id)}
                    >
                      <div className="shrink-0 mt-1">
                        <Icon className={cn("w-4 h-4", rb.color.includes("emerald") ? "text-emerald-400" : rb.color.includes("rose") ? "text-rose-400" : "text-amber-400")} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-white font-medium">{c.caseName}</div>
                        <div className="text-[10px] text-slate-600 mt-0.5">
                          {c.decisionDomain && <span className="mr-2">{c.decisionDomain}</span>}
                          {c.forecastHorizon && <span className="mr-2">· {c.forecastHorizon}</span>}
                          <span className="text-slate-700">#{c.referenceCaseId}</span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {tags.slice(0, 4).map((tag, i) => (
                            <span key={i} className="text-[9px] px-1.5 py-0.5 rounded border border-white/5 bg-white/[0.02] text-slate-500">
                              {tag}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="text-[9px] text-slate-600">+{tags.length - 4}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 w-20">
                        <div className="text-sm font-bold font-mono text-white">
                          {c.finalForecast != null ? `${Math.round(c.finalForecast * 100)}%` : "—"}
                        </div>
                        <div className={cn("text-[10px]", c.brierScore != null ? brierQuality(c.brierScore).color : "text-slate-600")}>
                          {c.brierScore != null ? `Brier ${c.brierScore.toFixed(3)}` : "—"}
                        </div>
                      </div>
                      <div className="shrink-0 w-24 text-center mt-0.5">
                        <span className={cn("inline-block text-[10px] px-2 py-0.5 rounded border", rb.color)}>{rb.label}</span>
                      </div>
                      <div className="shrink-0">
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                      </div>
                    </div>
                    {isExpanded && <CaseDetail c={c} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="text-[10px] text-slate-600 leading-snug px-1">
          Reference cases are calibration anchors and diagnostic benchmarks. They help interpret forecast performance and detect structural bias patterns.
          They do not alter posterior calculations or modify live inference.
        </div>
      </div>
    </AppLayout>
  );
}
