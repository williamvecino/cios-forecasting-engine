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
  Clock,
} from "lucide-react";
import type { Assumption } from "../hooks/use-assumptions";

interface AssumptionRegistryProps {
  assumptions: Assumption[];
  loading: boolean;
  error: string | null;
  lastExtracted: string | null;
  onExtract: (silent?: boolean) => void;
  onClose: () => void;
}

const CATEGORIES = [
  { key: "Clinical", color: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20" },
  { key: "Regulatory", color: "text-blue-400", bg: "bg-blue-400/10", border: "border-blue-400/20" },
  { key: "Market Access", color: "text-amber-400", bg: "bg-amber-400/10", border: "border-amber-400/20" },
  { key: "Competitive", color: "text-rose-400", bg: "bg-rose-400/10", border: "border-rose-400/20" },
  { key: "Behavioral", color: "text-violet-400", bg: "bg-violet-400/10", border: "border-violet-400/20" },
  { key: "Operational", color: "text-cyan-400", bg: "bg-cyan-400/10", border: "border-cyan-400/20" },
];

function getCategoryStyle(category: string) {
  return CATEGORIES.find(c => c.key === category) || CATEGORIES[5];
}

function statusIcon(status: string) {
  if (status === "active") return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === "challenged") return <AlertCircle className="w-3.5 h-3.5 text-amber-400" />;
  return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
}

function confidenceBadge(confidence: string) {
  const styles: Record<string, string> = {
    high: "text-emerald-400 bg-emerald-400/10 border-emerald-400/30",
    moderate: "text-amber-400 bg-amber-400/10 border-amber-400/30",
    low: "text-rose-400 bg-rose-400/10 border-rose-400/30",
  };
  return (
    <span className={`rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${styles[confidence] || styles.moderate}`}>
      {confidence}
    </span>
  );
}

function sourceLabel(step: string) {
  const labels: Record<string, string> = {
    forecast: "Judge",
    decide: "Decide",
    respond: "Respond",
  };
  return labels[step] || step;
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export default function AssumptionRegistry({
  assumptions,
  loading,
  error,
  lastExtracted,
  onExtract,
  onClose,
}: AssumptionRegistryProps) {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(CATEGORIES.map(c => c.key)));
  const [filterStatus, setFilterStatus] = useState<string | null>(null);

  const grouped = CATEGORIES.reduce<Record<string, Assumption[]>>((acc, cat) => {
    acc[cat.key] = assumptions.filter(a => a.category === cat.key && (!filterStatus || a.status === filterStatus));
    return acc;
  }, {});

  const nonEmptyCategories = CATEGORIES.filter(c => grouped[c.key].length > 0);

  const activeCount = assumptions.filter(a => a.status === "active").length;
  const challengedCount = assumptions.filter(a => a.status === "challenged").length;
  const invalidatedCount = assumptions.filter(a => a.status === "invalidated").length;

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
              <h2 className="text-sm font-bold text-foreground">Assumption Registry</h2>
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
              {loading ? "Updating..." : "Refresh"}
            </button>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {assumptions.length > 0 && (
          <div className="px-5 py-3 border-b border-border/50 flex items-center gap-3">
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
                <CheckCircle2 className="w-3 h-3" /> Active ({activeCount})
              </button>
            )}
            {challengedCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "challenged" ? null : "challenged")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "challenged" ? "bg-amber-400/10 text-amber-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                <AlertCircle className="w-3 h-3" /> Challenged ({challengedCount})
              </button>
            )}
            {invalidatedCount > 0 && (
              <button
                onClick={() => setFilterStatus(filterStatus === "invalidated" ? null : "invalidated")}
                className={`text-[11px] font-medium px-2 py-1 rounded-md transition flex items-center gap-1 ${filterStatus === "invalidated" ? "bg-rose-400/10 text-rose-400" : "text-muted-foreground hover:text-foreground"}`}
              >
                <XCircle className="w-3 h-3" /> Invalidated ({invalidatedCount})
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
              <p className="text-sm text-muted-foreground">Extracting assumptions...</p>
            </div>
          )}

          {!loading && assumptions.length === 0 && !error && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Shield className="w-8 h-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No assumptions extracted yet</p>
              <p className="text-xs text-muted-foreground/60 max-w-xs text-center">
                Assumptions are automatically extracted as you progress through the workflow. You can also click Refresh to extract them now.
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
                        <span className={`text-xs font-bold uppercase tracking-widest ${style.color}`}>{cat.key}</span>
                        <span className="text-[10px] text-muted-foreground/50">({items.length})</span>
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 pb-3 space-y-2">
                        {items.map(a => (
                          <div
                            key={a.id}
                            className={`rounded-lg border px-3 py-2.5 ${
                              a.status === "invalidated"
                                ? "border-rose-500/20 bg-rose-500/5 opacity-60"
                                : a.status === "challenged"
                                ? "border-amber-500/20 bg-amber-500/5"
                                : "border-border/30 bg-muted/5"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 shrink-0">{statusIcon(a.status)}</div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-[13px] leading-snug ${a.status === "invalidated" ? "text-muted-foreground line-through" : "text-foreground"}`}>
                                  {a.text}
                                </p>
                                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                  {confidenceBadge(a.confidence)}
                                  <span className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">
                                    from {sourceLabel(a.source_step)}
                                  </span>
                                  {a.linked_gates.length > 0 && (
                                    <span className="text-[9px] text-muted-foreground/40">
                                      → {a.linked_gates.slice(0, 2).join(", ")}
                                    </span>
                                  )}
                                  {a.version > 1 && (
                                    <span className="text-[9px] text-muted-foreground/40 flex items-center gap-0.5">
                                      <Clock className="w-2.5 h-2.5" /> v{a.version}
                                    </span>
                                  )}
                                </div>
                                {a.invalidation_reason && (
                                  <p className="text-[11px] text-amber-400/80 mt-1.5 italic">
                                    {a.invalidation_reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
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
  challengedCount,
  onClick,
}: {
  count: number;
  challengedCount: number;
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
      {challengedCount > 0 && (
        <span className="rounded-full bg-amber-400/10 text-amber-400 px-1.5 py-0.5 text-[10px] font-bold">
          {challengedCount}!
        </span>
      )}
    </button>
  );
}
