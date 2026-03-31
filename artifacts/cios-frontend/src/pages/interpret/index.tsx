import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import TopNav from "@/components/top-nav";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  GitBranch,
  ChevronDown,
  ChevronUp,
  Eye,
  ArrowUpDown,
  Pencil,
  Link2,
  GitMerge,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "";

const RELEVANCE_ORDER: Record<string, number> = { direct: 0, indirect: 1, tangential: 2, irrelevant: 3 };
const IMPACT_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2, negligible: 3 };
const CONFIDENCE_ORDER: Record<string, number> = { high: 0, moderate: 1, low: 2 };

const RELEVANCE_COLORS: Record<string, string> = {
  direct: "text-green-400",
  indirect: "text-blue-400",
  tangential: "text-slate-400",
  irrelevant: "text-red-400",
};

const DIRECTION_DISPLAY: Record<string, { icon: string; color: string }> = {
  positive: { icon: "↑", color: "text-green-400" },
  negative: { icon: "↓", color: "text-red-400" },
  neutral: { icon: "→", color: "text-slate-400" },
  ambiguous: { icon: "⇌", color: "text-amber-400" },
};

const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-300",
  moderate: "text-amber-300",
  low: "text-slate-400",
  negligible: "text-slate-600",
};

const INDEPENDENCE_LABELS: Record<string, string> = {
  independent: "Independent",
  partially_dependent: "Partial",
  dependent: "Dependent",
  redundant: "Redundant",
};

interface Interpretation {
  interpretationId: string;
  factIndex: number;
  factText: string;
  decisionRelevance: string;
  causalPathway: string | null;
  direction: string;
  impactEstimate: string;
  independenceClassification: string;
  dependsOn: number | null;
  rootEvidenceId: string | null;
  confidence: string;
  recommendedSignal: boolean;
  recommendationReason: string;
  rejectionReason: string | null;
  suggestedSignalType: string;
  suggestedStrength: number;
  suggestedReliability: number;
}

interface InterpretationResult {
  batchId: string;
  interpretations: Interpretation[];
  summary: {
    totalFacts: number;
    recommendedCount: number;
    rejectedCount: number;
    independentCount: number;
    dependentCount: number;
  };
  decisionContext: {
    primaryDecision: string;
    domain: string;
    decisionArchetype: string;
    questionText: string;
  };
}

type Phase = "interpreting" | "review" | "creating";
type SortField = "recommended" | "confidence" | "relevance" | "impact" | "direction" | "independence" | "type" | "strength" | "reliability";

function DotBar({ value, max = 5 }: { value: number; max?: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }, (_, i) => (
        <div key={i} className={`w-2 h-2 rounded-sm ${i < value ? "bg-blue-500/70" : "bg-slate-700/40"}`} />
      ))}
    </div>
  );
}

export default function InterpretPage() {
  const [, navigate] = useLocation();
  const [phase, setPhase] = useState<Phase>("interpreting");
  const [result, setResult] = useState<InterpretationResult | null>(null);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [sortField, setSortField] = useState<SortField>("recommended");
  const [sortAsc, setSortAsc] = useState(false);
  const [editingRow, setEditingRow] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Partial<Interpretation>>({});
  const [linkingRow, setLinkingRow] = useState<number | null>(null);
  const [linkValue, setLinkValue] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem("cios.interpretationPayload");
    if (!stored) { navigate("/ingest"); return; }
    let payload: any;
    try { payload = JSON.parse(stored); } catch { navigate("/ingest"); return; }
    if (!payload.facts || !payload.decisionContext) { navigate("/ingest"); return; }
    runInterpretation(payload);
  }, []);

  const runInterpretation = async (payload: any) => {
    setPhase("interpreting");
    setError(null);
    try {
      const res = await fetch(`${API}/api/agents/signal-interpretation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Interpretation failed");
      }
      const data = await res.json();
      setResult(data);
      const initial: Record<number, boolean> = {};
      data.interpretations.forEach((interp: Interpretation) => { initial[interp.factIndex] = interp.recommendedSignal; });
      setOverrides(initial);
      setPhase("review");
    } catch (err: any) {
      setError(err.message || "Interpretation failed");
      setPhase("review");
    }
  };

  const toggleOverride = useCallback((factIndex: number) => {
    setOverrides((prev) => ({ ...prev, [factIndex]: !prev[factIndex] }));
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setSortField((prev) => {
      if (prev === field) { setSortAsc((a) => !a); return field; }
      setSortAsc(false);
      return field;
    });
  }, []);

  const sortedInterpretations = useMemo(() => {
    if (!result) return [];
    const items = [...result.interpretations];
    const dir = sortAsc ? 1 : -1;
    const DIRECTION_ORDER: Record<string, number> = { positive: 0, negative: 1, neutral: 2, ambiguous: 3 };
    const INDEPENDENCE_ORDER: Record<string, number> = { independent: 0, partially_dependent: 1, dependent: 2, redundant: 3 };

    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "recommended":
          cmp = (b.recommendedSignal ? 1 : 0) - (a.recommendedSignal ? 1 : 0);
          if (cmp === 0) cmp = (CONFIDENCE_ORDER[a.confidence] ?? 9) - (CONFIDENCE_ORDER[b.confidence] ?? 9);
          if (cmp === 0) cmp = (RELEVANCE_ORDER[a.decisionRelevance] ?? 9) - (RELEVANCE_ORDER[b.decisionRelevance] ?? 9);
          if (cmp === 0) cmp = (IMPACT_ORDER[a.impactEstimate] ?? 9) - (IMPACT_ORDER[b.impactEstimate] ?? 9);
          return cmp * dir;
        case "confidence": cmp = (CONFIDENCE_ORDER[a.confidence] ?? 9) - (CONFIDENCE_ORDER[b.confidence] ?? 9); break;
        case "relevance": cmp = (RELEVANCE_ORDER[a.decisionRelevance] ?? 9) - (RELEVANCE_ORDER[b.decisionRelevance] ?? 9); break;
        case "impact": cmp = (IMPACT_ORDER[a.impactEstimate] ?? 9) - (IMPACT_ORDER[b.impactEstimate] ?? 9); break;
        case "direction": cmp = (DIRECTION_ORDER[a.direction] ?? 9) - (DIRECTION_ORDER[b.direction] ?? 9); break;
        case "independence": cmp = (INDEPENDENCE_ORDER[a.independenceClassification] ?? 9) - (INDEPENDENCE_ORDER[b.independenceClassification] ?? 9); break;
        case "type": cmp = (a.suggestedSignalType || "").localeCompare(b.suggestedSignalType || ""); break;
        case "strength": cmp = b.suggestedStrength - a.suggestedStrength; break;
        case "reliability": cmp = b.suggestedReliability - a.suggestedReliability; break;
        default: cmp = a.factIndex - b.factIndex;
      }
      return cmp * dir;
    });
    return items;
  }, [result, sortField, sortAsc]);

  const recommendedCount = Object.values(overrides).filter(Boolean).length;
  const totalCount = result?.interpretations.length || 0;

  const handleCreateSignals = useCallback(async () => {
    if (!result) return;
    setCreating(true);
    setError(null);
    try {
      const storedRaw = localStorage.getItem("cios.interpretationPayload");
      if (!storedRaw) throw new Error("Session data lost");
      const stored = JSON.parse(storedRaw);
      const caseId = stored.caseId;
      if (!caseId) throw new Error("No case ID found");

      const accepted = result.interpretations.filter((interp) => overrides[interp.factIndex]);
      const failures: string[] = [];

      for (const interp of accepted) {
        const signalDirection = interp.direction === "positive" ? "Positive" : interp.direction === "negative" ? "Negative" : "Neutral";

        const signalRes = await fetch(`${API}/api/cases/${caseId}/signals`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            signalDescription: interp.factText,
            direction: signalDirection,
            strengthScore: interp.suggestedStrength,
            reliabilityScore: interp.suggestedReliability,
            signalType: interp.suggestedSignalType,
            source: "ingestion_interpretation",
            sourceLabel: "Document Ingestion",
            rootEvidenceId: interp.rootEvidenceId,
            interpretationId: interp.interpretationId,
          }),
        });

        if (!signalRes.ok) {
          failures.push(`Fact ${interp.factIndex}: ${interp.factText.slice(0, 60)}...`);
          continue;
        }

        const signalData = await signalRes.json().catch(() => null);
        const linkedSignalId = signalData?.id || signalData?.signalId || null;

        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerStatus: "Accepted",
            linkedSignalId,
            status: "accepted",
          }),
        });
      }

      const rejected = result.interpretations.filter((interp) => !overrides[interp.factIndex]);
      for (const interp of rejected) {
        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reviewerStatus: "Rejected",
            status: "rejected",
          }),
        });
      }

      if (failures.length > 0 && failures.length === accepted.length) {
        throw new Error("All signal creations failed. Check the signals endpoint.");
      }
      if (failures.length > 0) {
        setError(`${failures.length} signal(s) failed to create but ${accepted.length - failures.length} succeeded.`);
      }

      localStorage.removeItem("cios.interpretationPayload");
      navigate("/signals");
    } catch (err: any) {
      setError(err.message || "Failed to create signals");
    } finally {
      setCreating(false);
    }
  }, [result, overrides, navigate]);

  const handleSkipAll = useCallback(async () => {
    if (result) {
      for (const interp of result.interpretations) {
        await fetch(`${API}/api/signal-interpretations/${interp.interpretationId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reviewerStatus: "Rejected", status: "skipped" }),
        }).catch(() => {});
      }
    }
    localStorage.removeItem("cios.interpretationPayload");
    navigate("/signals");
  }, [result, navigate]);

  const handleSaveEdit = useCallback((factIndex: number) => {
    if (!result || !editValues) return;
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        interpretations: prev.interpretations.map((interp) =>
          interp.factIndex === factIndex ? { ...interp, ...editValues } : interp
        ),
      };
    });
    setEditingRow(null);
    setEditValues({});
  }, [result, editValues]);

  const handleLinkRoot = useCallback((factIndex: number) => {
    if (!result || !linkValue.trim()) return;
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        interpretations: prev.interpretations.map((interp) =>
          interp.factIndex === factIndex ? { ...interp, rootEvidenceId: linkValue.trim() } : interp
        ),
      };
    });
    setLinkingRow(null);
    setLinkValue("");
  }, [result, linkValue]);

  const handleMergeRoot = useCallback((factIndex: number) => {
    if (!result) return;
    const current = result.interpretations.find((i) => i.factIndex === factIndex);
    if (!current?.rootEvidenceId) return;

    const rootId = current.rootEvidenceId;
    setResult((prev) => {
      if (!prev) return prev;
      const matchingIndices = prev.interpretations
        .filter((i) => i.rootEvidenceId === rootId && i.factIndex !== factIndex)
        .map((i) => i.factIndex);

      if (matchingIndices.length === 0) return prev;

      const newOverrides = { ...overrides };
      matchingIndices.forEach((idx) => { newOverrides[idx] = false; });
      setOverrides(newOverrides);

      return {
        ...prev,
        interpretations: prev.interpretations.map((interp) =>
          matchingIndices.includes(interp.factIndex)
            ? { ...interp, independenceClassification: "redundant", recommendedSignal: false }
            : interp
        ),
      };
    });
  }, [result, overrides]);

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button type="button" onClick={() => handleSort(field)} className={`flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold whitespace-nowrap ${active ? "text-blue-400" : "text-muted-foreground hover:text-foreground"} transition`}>
        {label}
        <ArrowUpDown className={`w-3 h-3 ${active ? "text-blue-400" : "text-slate-600"}`} />
      </button>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <TopNav />
      <div className="mx-auto max-w-[1400px] px-6 py-10 space-y-8">
        <div className="flex items-center gap-3">
          <GitBranch className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Candidate Signal Review</h1>
          <span className="ml-auto text-xs text-muted-foreground uppercase tracking-wider">
            {phase === "interpreting" ? "Analyzing Facts..." : phase === "creating" ? "Creating Signals..." : `${recommendedCount} of ${totalCount} facts accepted`}
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {phase === "interpreting" && (
          <div className="rounded-2xl border border-border bg-card p-12 flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">Interpreting extracted facts against the decision context...</p>
            <p className="text-xs text-slate-500">Evaluating relevance, causal pathways, independence, and impact for each fact</p>
          </div>
        )}

        {phase === "review" && !result && (
          <div className="rounded-2xl border border-red-500/20 bg-card p-8 flex flex-col items-center gap-4">
            <AlertTriangle className="w-8 h-8 text-red-400" />
            <p className="text-sm text-foreground font-medium">Interpretation could not be completed</p>
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => { const s = localStorage.getItem("cios.interpretationPayload"); if (s) { try { runInterpretation(JSON.parse(s)); } catch { navigate("/ingest"); } } else { navigate("/ingest"); } }} className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition">
                <Loader2 className="w-4 h-4" /> Retry
              </button>
              <button type="button" onClick={() => navigate("/ingest")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
            </div>
          </div>
        )}

        {phase === "review" && result && (
          <div className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Decision Context</div>
              <div className="text-sm font-medium text-foreground">{result.decisionContext.questionText}</div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Domain: <span className="text-foreground">{result.decisionContext.domain}</span></span>
                <span>Decision: <span className="text-foreground">{result.decisionContext.primaryDecision}</span></span>
              </div>
            </div>

            <div className="grid grid-cols-5 gap-3">
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.totalFacts}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Total Facts</div>
              </div>
              <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{recommendedCount}</div>
                <div className="text-[10px] text-green-400/60 uppercase tracking-wider mt-1">Will Create</div>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                <div className="text-2xl font-bold text-red-400">{totalCount - recommendedCount}</div>
                <div className="text-[10px] text-red-400/60 uppercase tracking-wider mt-1">Filtered Out</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.independentCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Independent</div>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 text-center">
                <div className="text-2xl font-bold">{result.summary.dependentCount}</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">Dependent</div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-slate-900/50">
                      <th className="px-3 py-3 text-left w-8"></th>
                      <th className="px-3 py-3 text-left min-w-[200px]">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Fact</span>
                      </th>
                      <th className="px-3 py-3 text-left"><SortHeader field="relevance" label="Relevance" /></th>
                      <th className="px-3 py-3 text-left min-w-[140px]">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Causal Pathway</span>
                      </th>
                      <th className="px-3 py-3 text-left"><SortHeader field="direction" label="Dir" /></th>
                      <th className="px-3 py-3 text-left"><SortHeader field="impact" label="Impact" /></th>
                      <th className="px-3 py-3 text-left"><SortHeader field="independence" label="Indep." /></th>
                      <th className="px-3 py-3 text-left"><SortHeader field="confidence" label="Conf." /></th>
                      <th className="px-3 py-3 text-left"><SortHeader field="recommended" label="Rec." /></th>
                      <th className="px-3 py-3 text-left"><SortHeader field="type" label="Signal Type" /></th>
                      <th className="px-3 py-3 text-center"><SortHeader field="strength" label="Str" /></th>
                      <th className="px-3 py-3 text-center"><SortHeader field="reliability" label="Rel" /></th>
                      <th className="px-3 py-3 text-left">
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Action</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedInterpretations.map((interp) => {
                      const isActive = overrides[interp.factIndex] ?? false;
                      const expanded = expandedRow === interp.factIndex;
                      const dir = DIRECTION_DISPLAY[interp.direction] || DIRECTION_DISPLAY.neutral;
                      const isEditing = editingRow === interp.factIndex;
                      const isLinking = linkingRow === interp.factIndex;

                      return (
                        <tr key={interp.factIndex} className={`border-b border-border/50 transition hover:bg-slate-800/30 ${isActive ? "bg-green-500/[0.03]" : ""}`}>
                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => toggleOverride(interp.factIndex)} className={`w-5 h-5 rounded border flex items-center justify-center transition ${isActive ? "border-green-500/40 bg-green-500/20 text-green-400" : "border-border bg-background text-muted-foreground hover:border-green-500/30"}`}>
                              {isActive ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            </button>
                          </td>

                          <td className="px-3 py-2.5">
                            <button type="button" onClick={() => setExpandedRow(expanded ? null : interp.factIndex)} className="text-left group">
                              <span className="text-xs text-foreground leading-tight line-clamp-2 group-hover:text-blue-300 transition">{interp.factText}</span>
                              {interp.rootEvidenceId && (
                                <span className="inline-block ml-1 text-[9px] text-cyan-400 font-mono">[{interp.rootEvidenceId}]</span>
                              )}
                            </button>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-semibold capitalize ${RELEVANCE_COLORS[interp.decisionRelevance] || "text-slate-400"}`}>
                              {interp.decisionRelevance}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="text-[11px] text-slate-400 line-clamp-2">{interp.causalPathway || "—"}</span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-bold ${dir.color}`}>{dir.icon}</span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-semibold capitalize ${IMPACT_COLORS[interp.impactEstimate] || "text-slate-400"}`}>
                              {interp.impactEstimate}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="text-xs text-slate-400">
                              {INDEPENDENCE_LABELS[interp.independenceClassification] || interp.independenceClassification}
                              {interp.dependsOn != null && <span className="text-amber-400 ml-0.5">#{interp.dependsOn}</span>}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`text-xs capitalize ${interp.confidence === "high" ? "text-green-400" : interp.confidence === "moderate" ? "text-amber-400" : "text-red-400"}`}>
                              {interp.confidence}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-bold ${interp.recommendedSignal ? "text-green-400" : "text-red-400"}`}>
                              {interp.recommendedSignal ? "Yes" : "No"}
                            </span>
                          </td>

                          <td className="px-3 py-2.5">
                            <span className="text-[11px] text-slate-300">{interp.suggestedSignalType}</span>
                          </td>

                          <td className="px-3 py-2.5 text-center"><DotBar value={interp.suggestedStrength} /></td>
                          <td className="px-3 py-2.5 text-center"><DotBar value={interp.suggestedReliability} /></td>

                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1">
                              <button type="button" onClick={() => toggleOverride(interp.factIndex)} title={isActive ? "Reject" : "Accept as signal"} className={`p-1 rounded transition ${isActive ? "text-red-400 hover:bg-red-500/10" : "text-green-400 hover:bg-green-500/10"}`}>
                                {isActive ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                              </button>
                              <button type="button" onClick={() => { setEditingRow(isEditing ? null : interp.factIndex); setEditValues(isEditing ? {} : { suggestedStrength: interp.suggestedStrength, suggestedReliability: interp.suggestedReliability, suggestedSignalType: interp.suggestedSignalType }); }} title="Edit interpretation" className="p-1 rounded text-slate-400 hover:text-foreground hover:bg-slate-700/50 transition">
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button type="button" onClick={() => { setLinkingRow(isLinking ? null : interp.factIndex); setLinkValue(interp.rootEvidenceId || ""); }} title="Link to root evidence" className="p-1 rounded text-slate-400 hover:text-foreground hover:bg-slate-700/50 transition">
                                <Link2 className="w-3.5 h-3.5" />
                              </button>
                              {interp.rootEvidenceId && (
                                <button type="button" onClick={() => handleMergeRoot(interp.factIndex)} title="Merge with existing root (deduplicate)" className="p-1 rounded text-slate-400 hover:text-foreground hover:bg-slate-700/50 transition">
                                  <GitMerge className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            {isEditing && (
                              <div className="mt-2 p-2 rounded-lg bg-slate-800/50 border border-border space-y-2">
                                <div>
                                  <label className="text-[9px] text-muted-foreground uppercase">Strength</label>
                                  <input type="number" min={1} max={5} value={editValues.suggestedStrength ?? interp.suggestedStrength} onChange={(e) => setEditValues((v) => ({ ...v, suggestedStrength: Number(e.target.value) }))} className="w-full mt-0.5 px-2 py-1 rounded bg-background border border-border text-xs text-foreground" />
                                </div>
                                <div>
                                  <label className="text-[9px] text-muted-foreground uppercase">Reliability</label>
                                  <input type="number" min={1} max={5} value={editValues.suggestedReliability ?? interp.suggestedReliability} onChange={(e) => setEditValues((v) => ({ ...v, suggestedReliability: Number(e.target.value) }))} className="w-full mt-0.5 px-2 py-1 rounded bg-background border border-border text-xs text-foreground" />
                                </div>
                                <div className="flex gap-1 pt-1">
                                  <button type="button" onClick={() => handleSaveEdit(interp.factIndex)} className="flex-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500">Save</button>
                                  <button type="button" onClick={() => { setEditingRow(null); setEditValues({}); }} className="flex-1 rounded bg-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600">Cancel</button>
                                </div>
                              </div>
                            )}

                            {isLinking && (
                              <div className="mt-2 p-2 rounded-lg bg-slate-800/50 border border-border space-y-2">
                                <label className="text-[9px] text-muted-foreground uppercase">Root Evidence ID</label>
                                <input type="text" value={linkValue} onChange={(e) => setLinkValue(e.target.value)} placeholder="e.g. NCT03003780" className="w-full px-2 py-1 rounded bg-background border border-border text-xs text-foreground" />
                                <div className="flex gap-1">
                                  <button type="button" onClick={() => handleLinkRoot(interp.factIndex)} className="flex-1 rounded bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-500">Link</button>
                                  <button type="button" onClick={() => { setLinkingRow(null); setLinkValue(""); }} className="flex-1 rounded bg-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-600">Cancel</button>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {expandedRow !== null && (() => {
                const interp = result.interpretations.find((i) => i.factIndex === expandedRow);
                if (!interp) return null;
                return (
                  <div className="border-t border-border bg-slate-900/30 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Detail: Fact {interp.factIndex}</span>
                      <button type="button" onClick={() => setExpandedRow(null)} className="text-muted-foreground hover:text-foreground"><ChevronUp className="w-4 h-4" /></button>
                    </div>
                    <div className="text-sm text-foreground">{interp.factText}</div>
                    {interp.causalPathway && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-muted-foreground uppercase tracking-wider">Causal Pathway</div>
                        <div className="text-xs text-slate-300 bg-slate-800/50 rounded-lg px-3 py-2 font-mono">{interp.causalPathway}</div>
                      </div>
                    )}
                    <div className="space-y-1">
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">{interp.recommendedSignal ? "Recommendation Reason" : "Rejection Reason"}</div>
                      <div className={`text-xs rounded-lg px-3 py-2 border ${interp.recommendedSignal ? "text-green-300 bg-green-500/5 border-green-500/10" : "text-red-300 bg-red-500/5 border-red-500/10"}`}>
                        {interp.recommendationReason || interp.rejectionReason || "No reason provided"}
                      </div>
                    </div>
                    <div className="flex items-center gap-6 text-xs text-muted-foreground">
                      <span>ID: <span className="font-mono text-slate-400">{interp.interpretationId}</span></span>
                      {interp.rootEvidenceId && <span>Root: <span className="font-mono text-cyan-400">{interp.rootEvidenceId}</span></span>}
                      {interp.dependsOn != null && <span>Depends on: <span className="text-amber-400">Fact {interp.dependsOn}</span></span>}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-border">
              <div className="flex items-center gap-4">
                <button type="button" onClick={() => navigate("/ingest")} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to Ingestion
                </button>
                <button type="button" onClick={handleSkipAll} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-300 transition">
                  Skip All
                </button>
              </div>
              <div className="flex items-center gap-3">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{recommendedCount} signal{recommendedCount !== 1 ? "s" : ""} will be created</span>
                <button type="button" disabled={creating || recommendedCount === 0} onClick={handleCreateSignals} className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-6 py-3 text-sm font-semibold text-white hover:bg-green-500 disabled:opacity-40 disabled:cursor-not-allowed transition">
                  {creating ? (<><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>) : (<>Create {recommendedCount} Signal{recommendedCount !== 1 ? "s" : ""} <ArrowRight className="w-4 h-4" /></>)}
                </button>
              </div>
            </div>

            {result.batchId && (
              <div className="rounded-xl bg-slate-800/30 border border-border px-4 py-3">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Interpretation Batch</div>
                <div className="text-xs text-slate-400 font-mono">{result.batchId}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
