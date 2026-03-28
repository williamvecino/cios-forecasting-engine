import { useState } from "react";
import {
  Shield,
  X,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  XCircle,
  HelpCircle,
  Clock,
  Zap,
} from "lucide-react";
import type { Assumption } from "../hooks/use-assumptions";

interface AssumptionRegistryProps {
  assumptions: Assumption[];
  loading: boolean;
  error: string | null;
  lastExtracted: string | null;
  recalculationTriggered: boolean;
  onExtract: (silent?: boolean) => void;
  onUpdateStatus: (id: string, status: string, reason?: string) => void;
  onClose: () => void;
}

const CATEGORIES = [
  { key: "clinical", label: "Clinical", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  { key: "regulatory", label: "Regulatory", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  { key: "payer", label: "Payer", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  { key: "competitive", label: "Competitive", color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
  { key: "supply", label: "Supply", color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20" },
  { key: "workflow", label: "Workflow", color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20" },
  { key: "operational", label: "Operational", color: "text-orange-400", bg: "bg-orange-400/10", border: "border-orange-400/20" },
  { key: "timeline", label: "Timeline", color: "text-pink-400", bg: "bg-pink-400/10", border: "border-pink-400/20" },
];

function getCategoryStyle(category: string) {
  return CATEGORIES.find(c => c.key === category) || CATEGORIES[6];
}

function statusIcon(status: string) {
  if (status === "active") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "validated") return <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />;
  if (status === "invalidated") return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
  return <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />;
}

function impactBadge(impact: string) {
  const styles: Record<string, string> = {
    high: "text-rose-400 bg-rose-400/10 border-rose-400/30",
    moderate: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    low: "text-slate-400 bg-slate-400/10 border-slate-400/30",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${styles[impact] || styles.moderate}`}>
      {impact} impact
    </span>
  );
}

function confidenceBadge(confidence: string) {
  const styles: Record<string, string> = {
    high: "text-emerald-400",
    moderate: "text-amber-400",
    low: "text-rose-400",
  };
  return (
    <span className={`text-[9px] font-medium uppercase tracking-wider ${styles[confidence] || styles.moderate}`}>
      {confidence} conf.
    </span>
  );
}

function sourceLabel(type: string) {
  const labels: Record<string, string> = {
    signal: "Signal",
    inference: "Inference",
    external_data: "External",
    user_input: "User Input",
    historical_pattern: "Historical",
  };
  return labels[type] || type;
}

function formatTime(iso: string | null) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function parseLinkedGates(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function AssumptionRegistry({
  assumptions,
  loading,
  error,
  lastExtracted,
  recalculationTriggered,
  onExtract,
  onUpdateStatus,
  onClose,
}: AssumptionRegistryProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORIES.map(c => c.key)));
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const grouped = CATEGORIES.reduce<Record<string, Assumption[]>>((acc, cat) => {
    acc[cat.key] = assumptions.filter(a =>
      a.assumptionCategory === cat.key &&
      (!filterStatus || a.assumptionStatus === filterStatus)
    );
    return acc;
  }, {});

  const nonEmptyCategories = CATEGORIES.filter(c => grouped[c.key].length > 0);

  const activeCount = assumptions.filter(a => a.assumptionStatus === "active").length;
  const validatedCount = assumptions.filter(a => a.assumptionStatus === "validated").length;
  const invalidatedCount = assumptions.filter(a => a.assumptionStatus === "invalidated").length;
  const unknownCount = assumptions.filter(a => a.assumptionStatus === "unknown").length;

  function toggleCategory(key: string) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-card border-l border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-card">
          <div className="flex items-center gap-2.5">
            <Shield className="w-4.5 h-4.5 text-primary" />
            <div>
              <h2 className="text-sm font-bold text-foreground">Assumptions Behind This Decision</h2>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                What must be true for this decision to hold
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onExtract(false)}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition disabled:opacity-50"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              {loading ? "Extracting..." : "Refresh"}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {recalculationTriggered && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-[11px] text-amber-400 font-medium">
              Assumption status changed — forecast recalculation recommended
            </p>
          </div>
        )}

        {assumptions.length > 0 && (
          <div className="px-5 py-3 border-b border-border/50 flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFilterStatus(null)}
              className={`text-[11px] font-medium px-2 py-1 rounded-md transition ${!filterStatus ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              All ({assumptions.length})
            </button>
            {activeCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "active" ? null : "active")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "active" ? "bg-emerald-400/10 text-emerald-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                Active ({activeCount})
              </button>
            )}
            {validatedCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "validated" ? null : "validated")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "validated" ? "bg-blue-400/10 text-blue-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                Validated ({validatedCount})
              </button>
            )}
            {invalidatedCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "invalidated" ? null : "invalidated")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "invalidated" ? "bg-rose-400/10 text-rose-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                Invalidated ({invalidatedCount})
              </button>
            )}
            {unknownCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "unknown" ? null : "unknown")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "unknown" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Unknown ({unknownCount})
              </button>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 flex items-start gap-2 mb-4">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <p className="text-xs text-rose-400">{error}</p>
            </div>
          )}

          {loading && assumptions.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="w-6 h-6 text-primary animate-spin" />
              <p className="text-sm text-muted-foreground">Extracting assumptions from case data...</p>
            </div>
          )}

          {!loading && assumptions.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Shield className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No assumptions recorded yet</p>
              <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
                Assumptions are automatically extracted as you progress through the workflow.
              </p>
              <button
                onClick={() => onExtract(false)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 transition"
              >
                Extract Now
              </button>
            </div>
          )}

          {nonEmptyCategories.length > 0 && (
            <div className="space-y-3">
              {nonEmptyCategories.map(cat => {
                const style = getCategoryStyle(cat.key);
                const items = grouped[cat.key];
                const expanded = expandedCategories.has(cat.key);

                return (
                  <div key={cat.key} className="rounded-xl border border-border/50 overflow-hidden">
                    <button
                      onClick={() => toggleCategory(cat.key)}
                      className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/10 transition"
                    >
                      <div className="flex items-center gap-2">
                        {expanded
                          ? <ChevronDown className={`w-3.5 h-3.5 ${style.color}`} />
                          : <ChevronRight className={`w-3.5 h-3.5 ${style.color}`} />
                        }
                        <span className={`text-xs font-bold uppercase tracking-widest ${style.color}`}>{cat.label}</span>
                        <span className="text-[10px] text-muted-foreground/50">({items.length})</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 space-y-2">
                        {items.map(a => {
                          const gates = parseLinkedGates(a.linkedGates);
                          return (
                            <div
                              key={a.assumptionId}
                              className={`rounded-lg border px-3 py-2.5 ${
                                a.assumptionStatus === "invalidated"
                                  ? "border-rose-500/20 bg-rose-500/5 opacity-60"
                                  : a.assumptionStatus === "validated"
                                  ? "border-blue-500/20 bg-blue-500/5"
                                  : a.assumptionStatus === "unknown"
                                  ? "border-muted bg-muted/5"
                                  : "border-border/30 bg-muted/5"
                              }`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="mt-0.5 shrink-0">{statusIcon(a.assumptionStatus)}</div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-[13px] leading-snug ${a.assumptionStatus === "invalidated" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                    {a.assumptionStatement}
                                  </p>
                                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                    {impactBadge(a.impactLevel)}
                                    {confidenceBadge(a.confidenceLevel)}
                                    <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                                      {sourceLabel(a.sourceType)}
                                    </span>
                                    {gates.length > 0 && (
                                      <span className="text-[9px] text-muted-foreground/40">
                                        → {gates.slice(0, 2).join(", ")}
                                      </span>
                                    )}
                                  </div>
                                  {a.invalidationReason && (
                                    <p className="text-[11px] text-amber-400/80 mt-1.5 italic">
                                      {a.invalidationReason}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-1.5 mt-2">
                                    {a.assumptionStatus !== "validated" && (
                                      <button
                                        onClick={() => onUpdateStatus(a.assumptionId, "validated")}
                                        className="text-[10px] font-medium text-blue-400 hover:text-blue-300 px-1.5 py-0.5 rounded border border-blue-400/20 hover:bg-blue-400/10 transition"
                                      >
                                        Validate
                                      </button>
                                    )}
                                    {a.assumptionStatus !== "invalidated" && (
                                      <button
                                        onClick={() => {
                                          const reason = window.prompt("Why is this assumption no longer valid?");
                                          if (reason) onUpdateStatus(a.assumptionId, "invalidated", reason);
                                        }}
                                        className="text-[10px] font-medium text-rose-400 hover:text-rose-300 px-1.5 py-0.5 rounded border border-rose-400/20 hover:bg-rose-400/10 transition"
                                      >
                                        Invalidate
                                      </button>
                                    )}
                                    {a.assumptionStatus !== "active" && (
                                      <button
                                        onClick={() => onUpdateStatus(a.assumptionId, "active")}
                                        className="text-[10px] font-medium text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border/30 hover:bg-muted/10 transition"
                                      >
                                        Reset
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {lastExtracted && (
          <div className="px-5 py-2.5 border-t border-border/50 bg-card">
            <p className="text-[10px] text-muted-foreground/50">
              Last updated: {formatTime(lastExtracted)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export function AssumptionTriggerButton({
  count,
  hasInvalidated,
  onClick,
}: {
  count: number;
  hasInvalidated: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/20 transition"
    >
      <Shield className="w-3.5 h-3.5" />
      View Assumptions
      {count > 0 && (
        <span className="rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-bold">
          {count}
        </span>
      )}
      {hasInvalidated && (
        <span className="rounded-full bg-rose-400/10 text-rose-400 px-1.5 py-0.5 text-[10px] font-bold">
          !
        </span>
      )}
    </button>
  );
}
