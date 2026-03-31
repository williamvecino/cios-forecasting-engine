import { useState, useEffect } from "react";
import TopNav from "@/components/top-nav";
import {
  Beaker,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

interface GoldSetCase {
  id: string;
  caseName: string;
  sourceType: string;
  sourceReference: string | null;
  expectedDecisionClassification: string | null;
  expectedPrimaryQuestion: string | null;
  expectedTopSignalFamilies: string[] | null;
  expectedStrongSignals: string[] | null;
  expectedDuplicateTraps: string[] | null;
  expectedNoiseSignals: string[] | null;
  expectedNotes: string | null;
}

interface RunResult {
  caseId: string;
  status: "pass" | "partial" | "fail" | "pending";
  details: string;
}

export default function GoldSetPage() {
  const [cases, setCases] = useState<GoldSetCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningId, setRunningId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/api/gold-set`)
      .then((r) => r.ok ? r.json() : [])
      .then((d) => setCases(Array.isArray(d) ? d : []))
      .catch(() => setCases([]))
      .finally(() => setLoading(false));
  }, []);

  const categories = [...new Set(cases.map((c) => c.expectedDecisionClassification || "Uncategorized"))];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-7xl px-6 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <Beaker className="w-6 h-6 text-cyan-400" />
            <h1 className="text-2xl font-bold text-foreground">Gold-Set Test Pack</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Internal benchmark — {cases.length} reference cases across {categories.length} categories. Compare expected vs. actual system outputs.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
        )}

        {!loading && cases.length === 0 && (
          <div className="rounded-2xl border border-border bg-card p-12 text-center space-y-3">
            <Beaker className="w-10 h-10 text-muted-foreground mx-auto" />
            <h2 className="text-lg font-semibold">No gold-set cases found</h2>
            <p className="text-sm text-muted-foreground">Seed the database with benchmark cases.</p>
          </div>
        )}

        {!loading && categories.map((cat) => {
          const catCases = cases.filter((c) => (c.expectedDecisionClassification || "Uncategorized") === cat);
          return (
            <div key={cat} className="space-y-3">
              <h2 className="text-sm font-bold uppercase tracking-widest text-cyan-400">{cat}</h2>
              <div className="space-y-2">
                {catCases.map((c) => {
                  const isExpanded = expandedId === c.id;
                  const result = results[c.id];
                  const isRunning = runningId === c.id;

                  return (
                    <div key={c.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : c.id)}
                        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-muted/5 transition"
                      >
                        <div className="flex items-center gap-3">
                          {result?.status === "pass" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                          {result?.status === "partial" && <AlertTriangle className="w-4 h-4 text-amber-400" />}
                          {result?.status === "fail" && <XCircle className="w-4 h-4 text-red-400" />}
                          {!result && <div className="w-4 h-4 rounded-full border border-slate-600" />}
                          <span className="text-sm font-medium text-foreground">{c.caseName}</span>
                          <span className="text-[10px] text-muted-foreground ml-2">{c.id}</span>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </button>

                      {isExpanded && (
                        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
                          {c.expectedPrimaryQuestion && (
                            <div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Expected Primary Question</div>
                              <p className="text-sm text-foreground/80">{c.expectedPrimaryQuestion}</p>
                            </div>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {c.expectedTopSignalFamilies && c.expectedTopSignalFamilies.length > 0 && (
                              <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-cyan-400 mb-2">Expected Top Families</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {c.expectedTopSignalFamilies.map((f, i) => (
                                    <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{f}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {c.expectedStrongSignals && c.expectedStrongSignals.length > 0 && (
                              <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-green-400 mb-2">Expected Strong Signals</div>
                                {c.expectedStrongSignals.map((s, i) => (
                                  <p key={i} className="text-[10px] text-foreground/70 mb-1">• {s}</p>
                                ))}
                              </div>
                            )}

                            {c.expectedDuplicateTraps && c.expectedDuplicateTraps.length > 0 && (
                              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400 mb-2">Duplicate Traps</div>
                                {c.expectedDuplicateTraps.map((s, i) => (
                                  <p key={i} className="text-[10px] text-foreground/70 mb-1">• {s}</p>
                                ))}
                              </div>
                            )}

                            {c.expectedNoiseSignals && c.expectedNoiseSignals.length > 0 && (
                              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-red-400 mb-2">Expected Noise (Should Reject)</div>
                                {c.expectedNoiseSignals.map((s, i) => (
                                  <p key={i} className="text-[10px] text-foreground/70 mb-1">• {s}</p>
                                ))}
                              </div>
                            )}
                          </div>

                          {c.expectedNotes && (
                            <div className="rounded-lg border border-border bg-muted/5 p-3">
                              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Notes</div>
                              <p className="text-xs text-foreground/60">{c.expectedNotes}</p>
                            </div>
                          )}

                          {result && (
                            <div className={`rounded-lg border p-3 ${result.status === "pass" ? "border-green-500/20 bg-green-500/5" : result.status === "partial" ? "border-amber-500/20 bg-amber-500/5" : "border-red-500/20 bg-red-500/5"}`}>
                              <div className="text-[10px] font-bold uppercase tracking-widest mb-1 text-muted-foreground">Run Result</div>
                              <p className="text-xs text-foreground/70">{result.details}</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {!loading && cases.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground">
                {Object.values(results).filter((r) => r.status === "pass").length} passed / {Object.values(results).length} run / {cases.length} total
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
