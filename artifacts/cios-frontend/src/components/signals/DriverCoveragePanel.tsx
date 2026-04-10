import { useMemo } from "react";
import { AlertTriangle, Check, Search } from "lucide-react";

const DRIVER_CATEGORIES: Record<string, { label: string; keywords: string[] }> = {
  economic: { label: "Economic driver", keywords: ["price", "cost", "revenue", "margin", "reimbursement", "formulary", "copay", "economic", "financial", "budget", "payer", "payment", "rebate", "discount", "spend"] },
  structural: { label: "Structural defense", keywords: ["patent", "exclusivity", "regulatory", "fda", "ema", "approval", "label", "indication", "guideline", "formulary position", "lock", "barrier", "protection", "ip", "litigation"] },
  competitive: { label: "Competitive pressure", keywords: ["competitor", "biosimilar", "generic", "market share", "launch", "entrant", "rivalry", "competing", "alternative", "switch", "displacement", "threat"] },
  execution: { label: "Execution capacity", keywords: ["supply", "manufacturing", "distribution", "sales force", "launch readiness", "field", "commercial", "capacity", "infrastructure", "training", "operational", "execution"] },
};

interface DriverCoverageSignal {
  id: string;
  text: string;
  accepted: boolean;
  countTowardPosterior?: boolean;
}

interface AdoptionMechanismCoverage {
  family_id: string;
  family_label: string;
  covered: boolean;
  has_candidates?: boolean;
  signal_count: number;
}

export default function DriverCoveragePanel({
  signals,
  onSearchMissing,
  adoptionCoverage,
  searchLoading,
}: {
  signals: DriverCoverageSignal[];
  onSearchMissing?: (missingLabels: string[]) => void;
  onAddSignal?: (text: string) => void;
  adoptionCoverage?: {
    mechanism_coverage: AdoptionMechanismCoverage[];
    missing_families: string[];
  } | null;
  searchLoading?: boolean;
}) {
  if (adoptionCoverage && adoptionCoverage.mechanism_coverage.length > 0) {
    const missingMechanisms = adoptionCoverage.mechanism_coverage.filter((mc) => !mc.covered);
    const allCovered = missingMechanisms.length === 0;

    if (signals.length === 0) return null;

    return (
      <div className={`rounded-2xl border ${allCovered ? "border-emerald-500/20" : "border-amber-500/30"} bg-card p-5 space-y-4`}>
        <div className="flex items-center gap-2">
          {allCovered ? (
            <>
              <Check className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground">Mechanism Coverage Complete</h2>
            </>
          ) : (
            <>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-bold text-foreground">Mechanism Coverage Incomplete</h2>
              <span className="text-xs text-amber-400">{missingMechanisms.length} missing</span>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {adoptionCoverage.mechanism_coverage.map((mc) => {
            const status = mc.covered ? "covered" : mc.has_candidates ? "pending" : "missing";
            return (
              <div
                key={mc.family_id}
                className={`rounded-lg border px-3 py-2 ${
                  status === "covered"
                    ? "border-emerald-500/20 bg-emerald-500/5"
                    : "border-amber-500/20 bg-amber-500/5"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  {status === "covered" ? (
                    <Check className="w-3 h-3 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-amber-400" />
                  )}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${status === "covered" ? "text-emerald-400" : "text-amber-400"}`}>
                    {mc.family_label}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {status === "covered" && `${mc.signal_count} signal${mc.signal_count > 1 ? "s" : ""}`}
                  {status === "pending" && "Pending validation"}
                  {status === "missing" && "Not covered"}
                </div>
              </div>
            );
          })}
        </div>

        {missingMechanisms.length > 0 && onSearchMissing && (
          <button
            type="button"
            onClick={() => onSearchMissing(missingMechanisms.map((mc) => mc.family_label))}
            disabled={searchLoading}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300 hover:bg-amber-500/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {searchLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-400 border-t-transparent" />
                Searching for missing signals...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search for missing signals
              </>
            )}
          </button>
        )}
      </div>
    );
  }

  const coverage = useMemo(() => {
    const result: Record<string, { covered: boolean; has_candidates: boolean; count: number }> = {};
    const validated = signals.filter((s) => s.accepted && s.countTowardPosterior === true);
    const candidatesOnly = signals.filter((s) => s.accepted && s.countTowardPosterior !== true);
    for (const [key, { keywords }] of Object.entries(DRIVER_CATEGORIES)) {
      const matchValidated = validated.filter((s) =>
        keywords.some((kw) => s.text.toLowerCase().includes(kw))
      );
      const matchCandidates = candidatesOnly.filter((s) =>
        keywords.some((kw) => s.text.toLowerCase().includes(kw))
      );
      result[key] = { covered: matchValidated.length > 0, has_candidates: matchCandidates.length > 0, count: matchValidated.length };
    }
    return result;
  }, [signals]);

  const missingCategories = useMemo(
    () => Object.entries(coverage).filter(([, v]) => !v.covered).map(([k]) => k),
    [coverage]
  );

  const allCovered = missingCategories.length === 0;

  if (signals.length === 0) return null;

  return (
    <div className={`rounded-2xl border ${allCovered ? "border-emerald-500/20" : "border-amber-500/30"} bg-card p-5 space-y-4`}>
      <div className="flex items-center gap-2">
        {allCovered ? (
          <>
            <Check className="w-4 h-4 text-emerald-400" />
            <h2 className="text-sm font-bold text-foreground">Driver Coverage Complete</h2>
          </>
        ) : (
          <>
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-foreground">Driver Coverage Incomplete</h2>
            <span className="text-xs text-amber-400">{missingCategories.length} missing</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Object.entries(DRIVER_CATEGORIES).map(([key, { label }]) => {
          const cat = coverage[key];
          const status = cat?.covered ? "covered" : cat?.has_candidates ? "pending" : "missing";
          return (
            <div
              key={key}
              className={`rounded-lg border px-3 py-2 ${
                status === "covered"
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {status === "covered" ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${status === "covered" ? "text-emerald-400" : "text-amber-400"}`}>
                  {label}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {status === "covered" && `${cat.count} signal${cat.count > 1 ? "s" : ""}`}
                {status === "pending" && "Pending validation"}
                {status === "missing" && "Not covered"}
              </div>
            </div>
          );
        })}
      </div>

      {missingCategories.length > 0 && onSearchMissing && (
        <button
          type="button"
          onClick={() => onSearchMissing(missingCategories.map((k) => DRIVER_CATEGORIES[k]?.label || k))}
          disabled={searchLoading}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-300 hover:bg-amber-500/15 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {searchLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-amber-400 border-t-transparent" />
              Searching for missing signals...
            </>
          ) : (
            <>
              <Search className="w-4 h-4" />
              Search for missing signals
            </>
          )}
        </button>
      )}
    </div>
  );
}
