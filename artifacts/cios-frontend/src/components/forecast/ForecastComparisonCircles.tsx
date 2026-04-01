import { memo } from "react";
import { ArrowRight } from "lucide-react";
import { ProbabilityGauge } from "@/components/ui-components";

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type Confidence = "Low" | "Moderate" | "High";

const confidenceBadgeClass: Record<Confidence, string> = {
  Low: "bg-rose-500/15 text-rose-200 border border-rose-400/30",
  Moderate: "bg-blue-500/15 text-blue-200 border border-blue-400/30",
  High: "bg-emerald-500/15 text-emerald-200 border border-emerald-400/30",
};

interface ForecastComparisonCirclesProps {
  brandOutlookProb: number;
  finalForecastProb: number | null;
  priorProbability: number;
  delta: number;
  confidence: Confidence;
  outcomeThreshold?: string | null;
  distributionComputed?: boolean;
  consecutiveEqualityWarning?: string | null;
  thresholdSource?: string | null;
}

function deriveVerdictFromProbability(pct: number): { label: string; rule: string; color: string } {
  if (pct >= 60) return { label: "Likely", rule: "Displayed probability >= 60%", color: "text-emerald-400" };
  if (pct >= 40) return { label: "Uncertain", rule: "Displayed probability 40–59%", color: "text-amber-400" };
  return { label: "Unlikely", rule: "Displayed probability < 40%", color: "text-rose-400" };
}

export const ForecastComparisonCircles = memo(function ForecastComparisonCircles({
  brandOutlookProb,
  finalForecastProb,
  priorProbability,
  delta,
  confidence,
  outcomeThreshold,
  distributionComputed = true,
  consecutiveEqualityWarning,
  thresholdSource,
}: ForecastComparisonCirclesProps) {
  const thresholdAvailable = finalForecastProb != null && distributionComputed;
  const displayedPct = thresholdAvailable ? Math.round(finalForecastProb * 100) : null;
  const verdict = displayedPct != null ? deriveVerdictFromProbability(displayedPct) : null;
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Evidence Strength</div>
          <ProbabilityGauge value={brandOutlookProb} label="Before Barriers" size={180} />
          <div className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
            How strong the case looks based on all evidence collected so far
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>Started at: {(priorProbability * 100).toFixed(0)}%</span>
            <ArrowRight className="w-3 h-3" />
            <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(0)} pts
            </span>
          </div>
          <div className="text-[10px] text-slate-600 leading-snug max-w-[220px]">
            Evidence {delta >= 0 ? "added" : "removed"} {Math.abs(Math.round(delta * 100))} points from the starting estimate
          </div>
        </div>

        {thresholdAvailable && (
          <ExecutionGapIndicator
            brandPct={Math.round(brandOutlookProb * 100)}
            finalPct={Math.round(finalForecastProb * 100)}
          />
        )}

        <div className="flex flex-col items-center text-center space-y-2">
          <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Target Likelihood</div>
          {thresholdAvailable ? (
            <>
              <ProbabilityGauge value={finalForecastProb} label="After Barriers" size={180} />
              <div className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
                How likely the target will actually be reached once real-world barriers are factored in
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center w-[180px] h-[180px] rounded-full border-2 border-dashed border-slate-600">
              <div className="text-sm font-bold text-slate-500">Not available</div>
              <div className="text-[10px] text-slate-600 mt-1 px-4 text-center">Needs more data to calculate</div>
            </div>
          )}
          <div className={cn(
            "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
            confidenceBadgeClass[confidence]
          )}>
            Confidence: {confidence}
          </div>
          <div className="text-[10px] text-slate-600 leading-snug max-w-[220px]">
            {confidence === "High"
              ? "Strong, consistent evidence supports this number"
              : confidence === "Moderate"
              ? "Some signals are mixed or incomplete — more evidence would sharpen the forecast"
              : "Limited or conflicting evidence — treat this number as directional, not precise"}
          </div>
        </div>
      </div>

      {consecutiveEqualityWarning && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/8 px-4 py-3">
          <div className="text-[10px] text-amber-400 font-bold uppercase tracking-widest mb-1">Diagnostic Alert</div>
          <div className="text-xs text-amber-300 leading-relaxed">{consecutiveEqualityWarning}</div>
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mb-3">Summary</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">Evidence Strength</div>
            <div className="text-sm font-bold text-blue-300 mt-0.5">{Math.round(brandOutlookProb * 100)}%</div>
            <div className="text-[10px] text-blue-400/50 mt-0.5">How strong the case looks</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">Target Likelihood</div>
            <div className="text-sm font-bold text-white mt-0.5">{displayedPct != null ? `${displayedPct}%` : "Not available"}</div>
            <div className="text-[10px] text-emerald-400/50 mt-0.5">Will the target be reached</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">Target</div>
            <div className="text-sm font-bold text-white mt-0.5">{outcomeThreshold ?? "Not set"}</div>
            {thresholdSource && (
              <div className="text-[10px] text-slate-600 mt-0.5">{thresholdSource}</div>
            )}
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">Confidence</div>
            <div className={cn("text-sm font-bold mt-0.5", confidenceBadgeClass[confidence].split(" ").find(c => c.startsWith("text-")) || "text-white")}>{confidence}</div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wider">Verdict</div>
            {verdict ? (
              <>
                <div className={cn("text-sm font-bold mt-0.5", verdict.color)}>{verdict.label}</div>
              </>
            ) : (
              <div className="text-sm font-bold text-slate-500 mt-0.5">Pending</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

function ExecutionGapIndicator({ brandPct, finalPct }: { brandPct: number; finalPct: number }) {
  const gap = brandPct - finalPct;

  if (gap === 0) return null;

  const absGap = Math.abs(gap);
  const isNegative = gap < 0;

  let severity: "low" | "moderate" | "high" = "low";
  if (absGap >= 30) severity = "high";
  else if (absGap >= 15) severity = "moderate";

  const severityStyles = {
    low: "border-slate-500/30 bg-slate-500/5 text-slate-300",
    moderate: "border-amber-500/30 bg-amber-500/8 text-amber-300",
    high: "border-red-500/30 bg-red-500/8 text-red-300",
  };

  const arrowColor = {
    low: "text-slate-400",
    moderate: "text-amber-400",
    high: "text-red-400",
  };

  return (
    <div className="flex flex-col items-center justify-center px-4 py-3">
      <div className={`rounded-2xl border px-5 py-4 text-center space-y-2 min-w-[140px] ${severityStyles[severity]}`}>
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Barrier Impact</div>
        <div className={`text-2xl font-bold ${arrowColor[severity]}`}>
          {isNegative ? "+" : ""}{absGap}
          <span className="text-sm font-normal ml-1">pts</span>
        </div>
        <div className="flex items-center justify-center gap-1">
          <span className={`text-lg ${arrowColor[severity]}`}>
            {isNegative ? "▲" : "▼"}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 leading-snug max-w-[140px]">
          {isNegative
            ? "Conditions are better than expected — the forecast is higher than the evidence alone would suggest"
            : absGap >= 15
            ? `Real-world barriers are reducing the forecast by ${absGap} points — check the constraints below to understand why`
            : "Barriers are having a small effect on the forecast"
          }
        </div>
      </div>
    </div>
  );
}
