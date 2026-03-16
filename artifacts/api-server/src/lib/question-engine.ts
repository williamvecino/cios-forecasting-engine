import type { ForecastOutput } from "./forecast-engine.js";

export interface StrategicQuestion {
  type:
    | "reversal_risk"
    | "bottleneck_actor"
    | "threshold_movement"
    | "missing_signal"
    | "confidence_stress"
    | "analog_gap"
    | "access_barrier";
  question: string;
  why: string;
  urgency: "high" | "medium" | "low";
}

export interface QuestionSet {
  primaryQuestion: string;
  questions: StrategicQuestion[];
  generatedAt: string;
}

const SIGNAL_DOMAINS = [
  "Phase III clinical",
  "Guideline inclusion",
  "Regulatory / clinical",
  "KOL endorsement",
  "Access / commercial",
  "Operational friction",
  "Competitor counteraction",
  "Field intelligence",
];

const DOMAIN_LABELS: Record<string, string> = {
  "Phase III clinical":       "Phase III clinical evidence",
  "Guideline inclusion":      "guideline or society endorsement",
  "Regulatory / clinical":    "regulatory / label data",
  "KOL endorsement":          "KOL or thought-leader positioning",
  "Access / commercial":      "payer access and formulary data",
  "Operational friction":     "operational / REMS / PA friction",
  "Competitor counteraction": "competitive counteraction intelligence",
  "Field intelligence":       "real-world field intelligence",
};

export function generateStrategicQuestions(
  forecast: ForecastOutput,
  caseStrategicQuestion: string,
  signals: Array<{ signalType: string | null; direction: string | null; signalDescription?: string | null }>,
  bucketMeanError?: number
): QuestionSet {
  const questions: StrategicQuestion[] = [];
  const p = forecast.currentProbability;
  const presentTypes = new Set(signals.map((s) => s.signalType).filter(Boolean) as string[]);

  // ── Q1: Reversal risk — built from swing factor ───────────────────────────
  const swing = forecast.sensitivityAnalysis?.swingFactor;
  if (swing && Math.abs(swing.probabilityDeltaIfReversed) >= 0.06) {
    const delta = swing.probabilityDeltaIfReversed;
    const reversedP = Math.max(0, Math.min(1, p + delta));
    const key = swing.direction === "Positive" ? "weaken or reverse" : "improve";
    questions.push({
      type: "reversal_risk",
      question: `If the "${swing.description.slice(0, 80)}" signal were to ${key}, the forecast would move to ${(reversedP * 100).toFixed(0)}%. What is the realistic probability of that reversal occurring, and what monitoring mechanism exists?`,
      why: `This is the single highest-impact signal in the model. A ${(Math.abs(delta) * 100).toFixed(0)}pp shift from one signal reversal makes it the primary fragility point in the current forecast.`,
      urgency: Math.abs(delta) >= 0.15 ? "high" : "medium",
    });
  }

  // ── Q2: Bottleneck actor — constraining actor with high influence ──────────
  const constraining = forecast.actorAggregation
    ?.filter((a) => a.netActorEffect < -0.10)
    .sort((a, b) => a.netActorEffect - b.netActorEffect)[0];
  if (constraining) {
    questions.push({
      type: "bottleneck_actor",
      question: `${constraining.actor} is the primary adoption constraint (effect: ${(constraining.netActorEffect).toFixed(2)}). What specific intervention — formulary change, clinical champion, guideline citation — would be most likely to shift them from "${constraining.stance}" to supportive?`,
      why: `Actor constraints that go unresolved become adoption ceilings. ${constraining.actor} currently exerts the strongest downward pressure on adoption probability; it is the real bottleneck, not evidence quality.`,
      urgency: constraining.netActorEffect < -0.30 ? "high" : "medium",
    });
  } else {
    // Ask about the most neutral high-weight actor instead
    const neutral = forecast.actorAggregation
      ?.filter((a) => Math.abs(a.netActorEffect) < 0.05 && a.influenceWeight >= 0.15)
      .sort((a, b) => b.influenceWeight - a.influenceWeight)[0];
    if (neutral) {
      questions.push({
        type: "bottleneck_actor",
        question: `${neutral.actor} is currently neutral despite high influence weight. What evidence or engagement activity would most reliably convert their stance to actively supportive?`,
        why: `Neutral high-influence actors represent latent upside. Converting one to active support often produces a larger probability shift than adding incremental clinical evidence.`,
        urgency: "medium",
      });
    }
  }

  // ── Q3: Threshold movement ────────────────────────────────────────────────
  const thresholds = [0.50, 0.65, 0.75, 0.85];
  const nextThreshold = thresholds.find((t) => t > p + 0.02);
  const prevThreshold = [...thresholds].reverse().find((t) => t < p - 0.02);

  if (nextThreshold && (nextThreshold - p) <= 0.20) {
    const gap = nextThreshold - p;
    questions.push({
      type: "threshold_movement",
      question: `The forecast is ${(p * 100).toFixed(0)}%, ${(gap * 100).toFixed(0)}pp below the ${(nextThreshold * 100).toFixed(0)}% threshold. What combination of signal additions or actor conversions would most plausibly close that gap, and which is most achievable in the current timeline?`,
      why: `${(nextThreshold * 100).toFixed(0)}% is a meaningful decision threshold. At ${(gap * 100).toFixed(0)}pp below it, understanding the shortest path there directly informs where to focus resources.`,
      urgency: gap <= 0.08 ? "high" : "medium",
    });
  } else if (prevThreshold && (p - prevThreshold) <= 0.10) {
    const risk = p - prevThreshold;
    questions.push({
      type: "threshold_movement",
      question: `The forecast is ${(p * 100).toFixed(0)}%, only ${(risk * 100).toFixed(0)}pp above the ${(prevThreshold * 100).toFixed(0)}% threshold. What conditions would push this below that level, and how should strategy be adjusted to hedge against that scenario?`,
      why: `Being close to a decision threshold on the downside is as strategically important as being close on the upside. The hedge strategy differs materially depending on which direction the forecast could move.`,
      urgency: risk <= 0.05 ? "high" : "medium",
    });
  }

  // ── Q4: Missing signal domain ─────────────────────────────────────────────
  const missingDomains = SIGNAL_DOMAINS.filter((d) => !presentTypes.has(d));
  const priorityMissing = [
    "Access / commercial",
    "Competitor counteraction",
    "Guideline inclusion",
    "Field intelligence",
  ].find((d) => missingDomains.includes(d));

  if (priorityMissing) {
    questions.push({
      type: "missing_signal",
      question: `No ${DOMAIN_LABELS[priorityMissing]} signals are currently captured. How would that information — positive or negative — most likely change the current forecast direction?`,
      why: `The model is operating without ${DOMAIN_LABELS[priorityMissing]} input. If that domain would materially move the forecast, its absence creates a blind spot in the confidence level, not genuine certainty.`,
      urgency: priorityMissing === "Access / commercial" || priorityMissing === "Competitor counteraction" ? "high" : "medium",
    });
  }

  // ── Q5: High-confidence stress test (if bucket history shows over-prediction) ──
  if (p >= 0.75 && bucketMeanError !== undefined && bucketMeanError < -0.08) {
    const historicalShortfall = Math.abs(bucketMeanError * 100).toFixed(0);
    questions.push({
      type: "confidence_stress",
      question: `This forecast is in the high-confidence range (${(p * 100).toFixed(0)}%), but comparable cases at this level have historically over-predicted by ~${historicalShortfall}pp. Which specific assumptions in this case differentiate it from those historical misses?`,
      why: `High-confidence forecasts carry structural over-prediction risk from cumulative positive signal stacking. The question is not whether the direction is right but whether the magnitude is justified.`,
      urgency: "high",
    });
  } else if (p >= 0.85) {
    questions.push({
      type: "confidence_stress",
      question: `The forecast is ${(p * 100).toFixed(0)}%, in the highest confidence tier. What is the single most important assumption that, if wrong, would most dramatically reduce adoption — and what early indicator would signal that assumption is breaking down?`,
      why: `Very high forecasts can mask model overconfidence from compounding positive signals. Identifying the load-bearing assumption builds disciplined scenario monitoring.`,
      urgency: "medium",
    });
  }

  // Trim to 5 max, sort by urgency
  const urgencyOrder = { high: 0, medium: 1, low: 2 };
  const sorted = questions
    .sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency])
    .slice(0, 5);

  return {
    primaryQuestion: caseStrategicQuestion,
    questions: sorted,
    generatedAt: new Date().toISOString(),
  };
}
