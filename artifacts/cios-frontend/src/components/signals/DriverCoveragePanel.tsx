import { useMemo } from "react";
import { AlertTriangle, Check, Lightbulb } from "lucide-react";

const DRIVER_CATEGORIES: Record<string, { label: string; keywords: string[] }> = {
  economic: { label: "Economic driver", keywords: ["price", "cost", "revenue", "margin", "reimbursement", "formulary", "copay", "economic", "financial", "budget", "payer", "payment", "rebate", "discount", "spend"] },
  structural: { label: "Structural defense", keywords: ["patent", "exclusivity", "regulatory", "fda", "ema", "approval", "label", "indication", "guideline", "formulary position", "lock", "barrier", "protection", "ip", "litigation"] },
  competitive: { label: "Competitive pressure", keywords: ["competitor", "biosimilar", "generic", "market share", "launch", "entrant", "rivalry", "competing", "alternative", "switch", "displacement", "threat"] },
  execution: { label: "Execution capacity", keywords: ["supply", "manufacturing", "distribution", "sales force", "launch readiness", "field", "commercial", "capacity", "infrastructure", "training", "operational", "execution"] },
};

const SUGGESTED_SIGNALS: Record<string, string[]> = {
  economic: [
    "Payer reimbursement rate change expected within forecast window",
    "New formulary exclusion or step-edit requirement signaled",
    "Gross-to-net spread widening due to contracting pressure",
  ],
  structural: [
    "Key patent expiry or challenge filing within forecast period",
    "Regulatory decision (FDA/EMA) pending for label expansion or restriction",
    "New clinical guideline recommendation affecting prescribing hierarchy",
  ],
  competitive: [
    "Competitor product launch or approval anticipated in forecast window",
    "Biosimilar/generic entry expected to erode market share",
    "Competitive clinical data readout that may shift prescriber preference",
  ],
  execution: [
    "Supply chain constraint or manufacturing scale-up risk",
    "Sales force expansion or contraction planned",
    "Market access team capacity to handle formulary negotiations",
  ],
};

interface DriverCoverageSignal {
  id: string;
  text: string;
  accepted: boolean;
}

export default function DriverCoveragePanel({
  signals,
  onAddSignal,
}: {
  signals: DriverCoverageSignal[];
  onAddSignal?: (text: string) => void;
}) {
  const coverage = useMemo(() => {
    const result: Record<string, { covered: boolean; count: number }> = {};
    const accepted = signals.filter((s) => s.accepted);
    for (const [key, { keywords }] of Object.entries(DRIVER_CATEGORIES)) {
      const matching = accepted.filter((s) =>
        keywords.some((kw) => s.text.toLowerCase().includes(kw))
      );
      result[key] = { covered: matching.length > 0, count: matching.length };
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
          return (
            <div
              key={key}
              className={`rounded-lg border px-3 py-2 ${
                cat?.covered
                  ? "border-emerald-500/20 bg-emerald-500/5"
                  : "border-amber-500/20 bg-amber-500/5"
              }`}
            >
              <div className="flex items-center gap-1.5">
                {cat?.covered ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                )}
                <span className={`text-[10px] font-semibold uppercase tracking-wider ${cat?.covered ? "text-emerald-400" : "text-amber-400"}`}>
                  {label}
                </span>
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">
                {cat?.covered ? `${cat.count} signal${cat.count > 1 ? "s" : ""}` : "Not covered"}
              </div>
            </div>
          );
        })}
      </div>

      {missingCategories.length > 0 && onAddSignal && (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-medium">Suggested missing signals</span>
          </div>
          <div className="space-y-2">
            {missingCategories.map((cat) => (
              <div key={cat} className="space-y-1.5">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  {DRIVER_CATEGORIES[cat]?.label}
                </div>
                {SUGGESTED_SIGNALS[cat]?.map((suggestion, i) => (
                  <div key={i} className="flex items-center gap-2 group">
                    <div className="flex-1 text-[11px] text-foreground/70">{suggestion}</div>
                    <button
                      type="button"
                      onClick={() => onAddSignal(suggestion)}
                      className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2 py-0.5 text-[9px] font-semibold text-primary opacity-0 group-hover:opacity-100 transition"
                    >
                      + Add
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
