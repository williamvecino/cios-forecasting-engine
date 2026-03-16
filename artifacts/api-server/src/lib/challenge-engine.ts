import type { ForecastOutput } from "./forecast-engine.js";

export interface ChallengeArgument {
  claim: string;
  evidence: string[];
}

export interface MissingEvidence {
  domain: string;
  reason: string;
  estimatedImpact: string;
}

export interface MissingAnalog {
  therapyArea: string;
  reason: string;
}

export interface FragileAssumption {
  assumption: string;
  breakingCondition: string;
  probabilityShiftIfBroken: string;
}

export interface ChallengeOutput {
  forecastProbability: number;
  tooOptimistic: ChallengeArgument;
  tooPessimistic: ChallengeArgument;
  missingEvidence: MissingEvidence[];
  missingAnalog: MissingAnalog | null;
  fragileAssumption: FragileAssumption;
  generatedAt: string;
}

const SIGNAL_DOMAIN_LABELS: Record<string, string> = {
  "Phase III clinical":       "Phase III clinical evidence",
  "Guideline inclusion":      "guideline or society body endorsement",
  "Regulatory / clinical":    "regulatory or label data",
  "KOL endorsement":          "KOL or thought-leader support",
  "Access / commercial":      "payer access and formulary conditions",
  "Operational friction":     "operational or REMS friction",
  "Competitor counteraction": "competitor response or counteraction",
  "Field intelligence":       "field intelligence or rep-level adoption signals",
};

const ALL_SIGNAL_DOMAINS = Object.keys(SIGNAL_DOMAIN_LABELS);

export function generateForecastChallenge(
  forecast: ForecastOutput,
  caseStrategicQuestion: string,
  signals: Array<{
    signalType: string | null;
    direction: string | null;
    signalDescription?: string | null;
    likelihoodRatio?: number | null;
  }>,
  topAnalogTherapyAreas: string[],
  caseTherapyArea: string
): ChallengeOutput {
  const p = forecast.currentProbability;
  const presentTypes = new Set(signals.map((s) => s.signalType).filter(Boolean) as string[]);

  const positiveSignals = signals.filter((s) => s.direction === "Positive");
  const negativeSignals = signals.filter((s) => s.direction === "Negative");

  const topUpward = forecast.sensitivityAnalysis?.upwardSignals?.[0];
  const topDownward = forecast.sensitivityAnalysis?.downwardSignals?.[0];
  const swing = forecast.sensitivityAnalysis?.swingFactor;

  const constrainingActors = forecast.actorAggregation
    ?.filter((a) => a.netActorEffect < -0.08)
    .sort((a, b) => a.netActorEffect - b.netActorEffect) ?? [];
  const supportingActors = forecast.actorAggregation
    ?.filter((a) => a.netActorEffect > 0.08)
    .sort((a, b) => b.netActorEffect - a.netActorEffect) ?? [];

  // ── Too Optimistic ────────────────────────────────────────────────────────
  const optimisticEvidence: string[] = [];

  if (constrainingActors.length > 0) {
    const top = constrainingActors[0];
    optimisticEvidence.push(
      `${top.actor} stance is "${top.stance}" (effect ${(top.netActorEffect).toFixed(2)}). HCP adoption forecasts consistently underestimate actor inertia at launch.`
    );
  }

  if (negativeSignals.length === 0 && positiveSignals.length >= 3) {
    optimisticEvidence.push(
      `No negative signals are present. A forecast built entirely on positive evidence has no downside scenario modeled and may reflect recency or confirmation bias in signal selection.`
    );
  }

  if (!presentTypes.has("Access / commercial") && !presentTypes.has("Operational friction")) {
    optimisticEvidence.push(
      `Neither payer access nor operational friction signals are captured. Real-world adoption at launch consistently falls short of clinical trial-based expectations when access barriers emerge post-approval.`
    );
  }

  if (p >= 0.80 && positiveSignals.length >= 2) {
    optimisticEvidence.push(
      `Compounding of ${positiveSignals.length} positive signals drives the LR product high. Individual signal LRs are computed independently; real-world signals are often correlated — their joint effect is smaller than the product implies.`
    );
  }

  if (topUpward) {
    optimisticEvidence.push(
      `The highest-impact upward signal ("${topUpward.description.slice(0, 80)}") contributes ${(Math.abs(topUpward.absoluteImpact) * 100).toFixed(1)}pp to probability. A positive signal from an initial study does not guarantee persistence at full-population launch.`
    );
  }

  const optimisticClaim =
    p >= 0.80
      ? `The forecast of ${(p * 100).toFixed(0)}% may be over-stated. Signal stacking in high-confidence cases systematically over-predicts because the Bayesian model treats evidence as independent when clinical and commercial signals are often correlated, and because actor adoption inertia is structurally underweighted at launch.`
      : `Even at ${(p * 100).toFixed(0)}%, the forecast may be over-estimating adoption speed. High-quality evidence does not guarantee rapid HCP behavior change — access barriers and actor inertia are frequently the binding constraints, not evidence quality.`;

  // ── Too Pessimistic ───────────────────────────────────────────────────────
  const pessimisticEvidence: string[] = [];

  if (supportingActors.length > 0) {
    const top = supportingActors[0];
    pessimisticEvidence.push(
      `${top.actor} is "${top.stance}" (effect +${(top.netActorEffect).toFixed(2)}). When a high-influence actor group is strongly committed, adoption timelines compress materially — this is not fully captured in the probability estimate.`
    );
  }

  if (presentTypes.has("Phase III clinical")) {
    const ph3 = signals.find((s) => s.signalType === "Phase III clinical" && s.direction === "Positive");
    if (ph3) {
      pessimisticEvidence.push(
        `Strong Phase III data ("${(ph3.signalDescription ?? "").slice(0, 80)}") has historically driven faster adoption than prior analogues predict, particularly in therapy areas with high unmet need and structured KOL networks.`
      );
    }
  }

  if (negativeSignals.length >= 2 && p < 0.75) {
    pessimisticEvidence.push(
      `Two or more negative signals are present, but they may reflect early-launch conditions (prior auth backlogs, REMS ramp-up) that resolve within 6–12 months. The forecast may weight these as persistent when they are temporally bounded.`
    );
  }

  if (!presentTypes.has("Field intelligence") && !presentTypes.has("KOL endorsement")) {
    pessimisticEvidence.push(
      `No field intelligence or KOL endorsement signals are present. When those signals exist and are positive, they consistently drive adoption faster than the prior alone implies.`
    );
  }

  const pessimisticClaim =
    p <= 0.55
      ? `The forecast of ${(p * 100).toFixed(0)}% may be under-estimating adoption. Without field intelligence and with high reliance on prior probability, the model defaults conservatively and may not capture the full momentum implied by the available positive signals.`
      : `The forecast could be understating adoption upside. The model captures evidence quality but not adoption acceleration from network effects, practice momentum, or early-adopter cascade — all of which compress timelines beyond what signal LRs imply.`;

  // ── Missing Evidence ──────────────────────────────────────────────────────
  const missingEvidence: MissingEvidence[] = [];
  const priority = [
    "Access / commercial",
    "Competitor counteraction",
    "Field intelligence",
    "Guideline inclusion",
    "Operational friction",
  ];

  for (const domain of priority) {
    if (!presentTypes.has(domain) && missingEvidence.length < 3) {
      let reason = "";
      let impact = "";
      if (domain === "Access / commercial") {
        reason = "No payer access or formulary data captured. Access conditions are the primary driver of real-world adoption vs trial-based expectations.";
        impact = "Could move forecast ±10–18pp depending on formulary tier and prior authorization burden.";
      } else if (domain === "Competitor counteraction") {
        reason = "No competitor response intelligence captured. Incumbent defense strategies (rebating, step-through requirements, detail campaigns) frequently delay market entry beyond clinical forecasts.";
        impact = "Absence of counter-positioning data creates downside blind spot in the current estimate.";
      } else if (domain === "Field intelligence") {
        reason = "No real-world field intelligence from reps or medical science liaisons. Early field signals are the fastest-updating source of HCP sentiment.";
        impact = "Positive field signals would add +5–12pp; negative field signals are a leading indicator of adoption problems.";
      } else if (domain === "Guideline inclusion") {
        reason = "No guideline or society body signal captured. Community physician adoption is largely gated on guideline status.";
        impact = "Guideline inclusion is the primary unlock for community-level adoption, typically adding +10–20pp when present.";
      } else if (domain === "Operational friction") {
        reason = "No operational friction signals. REMS requirements, specialty pharmacy constraints, and prior auth burdens are not modeled.";
        impact = "Unmodeled operational barriers routinely reduce adoption by 8–15pp in the first 12 months.";
      }
      missingEvidence.push({ domain: SIGNAL_DOMAIN_LABELS[domain], reason, estimatedImpact: impact });
    }
  }

  // ── Missing Analog ────────────────────────────────────────────────────────
  let missingAnalog: MissingAnalog | null = null;
  const analogAreas = new Set(topAnalogTherapyAreas);
  const usefulAreas = [caseTherapyArea, "Oncology", "Cardiovascular", "CNS / Psychiatry", "Immunology / Dermatology"];
  const missingArea = usefulAreas.find((a) => !analogAreas.has(a) && a !== caseTherapyArea);
  if (missingArea) {
    missingAnalog = {
      therapyArea: missingArea,
      reason: `No calibrated analog from ${missingArea} is available in the library for this case type. ${missingArea} cases often reveal access and actor dynamics not visible in same-area comparisons.`,
    };
  }

  // ── Fragile Assumption ────────────────────────────────────────────────────
  let fragileAssumption: FragileAssumption;
  if (swing) {
    const reversedP = Math.max(0, Math.min(1, p + swing.probabilityDeltaIfReversed));
    fragileAssumption = {
      assumption: `"${swing.description.slice(0, 100)}" maintains its current direction (${swing.direction}).`,
      breakingCondition:
        swing.direction === "Positive"
          ? "A safety signal emerges post-approval, enrollment in real-world studies reveals unexpected side-effect burden, or regulatory label update narrows indication."
          : "The constraint resolves — formulary tier improves, REMS program simplified, or competitor withdraws from market.",
      probabilityShiftIfBroken: `Forecast moves from ${(p * 100).toFixed(0)}% to approximately ${(reversedP * 100).toFixed(0)}% (${swing.probabilityDeltaIfReversed >= 0 ? "+" : ""}${(swing.probabilityDeltaIfReversed * 100).toFixed(0)}pp).`,
    };
  } else if (topUpward) {
    fragileAssumption = {
      assumption: `KOL and clinical support for "${topUpward.description.slice(0, 80)}" remains stable through the forecast horizon.`,
      breakingCondition:
        "A competing mechanism or head-to-head trial produces unexpected results, or a major KOL publicly revises their position.",
      probabilityShiftIfBroken: `Removing this signal would reduce the forecast by approximately ${(Math.abs(topUpward.absoluteImpact) * 100).toFixed(1)}pp.`,
    };
  } else {
    fragileAssumption = {
      assumption: `Prior probability of ${(forecast.priorProbability * 100).toFixed(0)}% accurately reflects baseline adoption potential for this asset class and disease setting.`,
      breakingCondition:
        "The prior was set before late-stage data readout or competitive entry that structurally changed the landscape.",
      probabilityShiftIfBroken:
        "If the effective prior should be 10–15pp lower, the posterior probability would compress accordingly across all scenarios.",
    };
  }

  return {
    forecastProbability: p,
    tooOptimistic: { claim: optimisticClaim, evidence: optimisticEvidence.slice(0, 4) },
    tooPessimistic: { claim: pessimisticClaim, evidence: pessimisticEvidence.slice(0, 4) },
    missingEvidence: missingEvidence.slice(0, 3),
    missingAnalog,
    fragileAssumption,
    generatedAt: new Date().toISOString(),
  };
}
