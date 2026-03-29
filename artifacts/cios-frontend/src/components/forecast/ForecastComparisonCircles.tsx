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
  finalForecastProb: number;
  priorProbability: number;
  delta: number;
  confidence: Confidence;
}

export const ForecastComparisonCircles = memo(function ForecastComparisonCircles({
  brandOutlookProb,
  finalForecastProb,
  priorProbability,
  delta,
  confidence,
}: ForecastComparisonCirclesProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0A1736] p-6">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-4 items-center">
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="text-[10px] text-blue-400 font-semibold uppercase tracking-wider">Brand Outlook</div>
          <ProbabilityGauge value={brandOutlookProb} label="Brand Strength" size={180} />
          <div className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
            How strong the therapy looks based on all signals — clinical evidence, competitive position, and market readiness combined
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span title="Where the probability started before any evidence was added">Prior: {(priorProbability * 100).toFixed(0)}%</span>
            <ArrowRight className="w-3 h-3" />
            <span className={delta >= 0 ? "text-emerald-400" : "text-rose-400"} title={delta >= 0 ? "Positive signals pushed the probability up by this amount" : "Negative signals pulled the probability down by this amount"}>
              {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(0)} pts
            </span>
          </div>
          <div className="text-[10px] text-slate-600 leading-snug max-w-[220px]">
            Started at {(priorProbability * 100).toFixed(0)}%, then {Math.abs(Math.round(delta * 100))} points were {delta >= 0 ? "added" : "removed"} based on the evidence you accepted
          </div>
        </div>

        <ExecutionGapIndicator
          brandPct={Math.round(brandOutlookProb * 100)}
          finalPct={Math.round(finalForecastProb * 100)}
        />

        <div className="flex flex-col items-center text-center space-y-2">
          <div className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider">Final Forecast</div>
          <ProbabilityGauge value={finalForecastProb} label="Gate-Constrained" size={180} />
          <div className="text-xs text-slate-400 leading-relaxed max-w-[220px]">
            {finalForecastProb < brandOutlookProb
              ? "The final number after real-world barriers (regulatory, access, competition) are applied — these can limit what the brand can actually achieve"
              : "The probability of achieving the defined outcome after all factors are considered"}
          </div>
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

      <div className="mt-3 text-center text-[10px] text-slate-600">Engine v1 · Signal + Gate Constraint</div>
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
        <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">Execution Gap</div>
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
            ? "The final forecast is higher than the brand outlook — favorable conditions are boosting the expected outcome"
            : absGap >= 15
            ? `Real-world barriers are reducing the achievable outcome by ${absGap} points — look at the event gates below to see what is causing this`
            : "Minor gap between potential and constrained outcome — barriers are having a small effect"
          }
        </div>
      </div>
    </div>
  );
}
