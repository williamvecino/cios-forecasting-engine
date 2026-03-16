import { Signal } from "@workspace/db";
import {
  ACTOR_NAMES,
  getPharmaMultiplier,
  type ActorIndex,
} from "./pharma-logic.js";

export interface ActorConfig {
  actorName: string;
  influenceWeight: number;
  positiveResponseFactor: number;
  negativeResponseFactor: number;
  outcomeOrientation: number;
  slotIndex: number;
}

export interface ActorReactionDetail {
  actor: string;
  rawReaction: number;
  weightedContribution: number;
  pharmaMultiplier: number;
}

export interface SignalForecastDetail {
  signalId: string;
  signalType: string;
  description: string;
  direction: string;
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  weightedActorReaction: number;
  actorReactions: Record<string, number>;
  absoluteImpact: number;
}

export interface ActorAggregation {
  actor: string;
  rawReactionSum: number;
  netActorEffect: number;
  interpretation: string;
  stance: string;
  expectedBehavior: string;
  influenceWeight: number;
}

export interface SensitivitySignal {
  signalId: string;
  description: string;
  direction: "Positive" | "Negative";
  absoluteImpact: number;
  likelihoodRatio: number;
  probabilityWithout: number;
  deltaIfRemoved: number;
}

export interface SwingFactor {
  type: "signal";
  signalId: string;
  description: string;
  direction: string;
  currentProbabilityIfReversed: number;
  probabilityDeltaIfReversed: number;
  interpretation: string;
}

export interface SensitivityAnalysis {
  upwardSignals: SensitivitySignal[];
  downwardSignals: SensitivitySignal[];
  swingFactor: SwingFactor | null;
  stabilityNote: string;
}

export interface AgentActorSummary {
  agentId: string;
  label: string;
  baseScore: number;
  finalScore: number;
  stance: string;
  influenceAnnotations: Array<{ fromLabel: string; label: string; delta: number }>;
  contributionToTranslation: number;
}

export interface ForecastOutput {
  caseId: string;
  priorProbability: number;
  priorOdds: number;
  signalLrProduct: number;
  bayesianActorFactor: number;
  agentActorFactor: number | null;
  actorAdjustmentFactor: number;
  actorSource: "agent-simulation" | "bayesian-static";
  agentActorSummary: AgentActorSummary[];
  posteriorOdds: number;
  currentProbability: number;
  confidenceLevel: string;
  netActorTranslation: number;
  topSupportiveActor: string | null;
  topConstrainingActor: string | null;
  actorAggregation: ActorAggregation[];
  signalDetails: SignalForecastDetail[];
  sensitivityAnalysis: SensitivityAnalysis;
  interpretation: {
    primaryStatement: string;
    topSupportiveActor: string | null;
    topConstrainingActor: string | null;
    highestImpactSignal: string | null;
    recommendedAction: string | null;
    miosRoutingCheck: string | null;
    ohosRoutingCheck: string | null;
    behavioralSummary: string | null;
  };
}

function interpretActorEffect(effect: number): string {
  if (effect > 0.25) return "Strong support";
  if (effect > 0.05) return "Moderate support";
  if (effect < -0.25) return "Strong constraint";
  if (effect < -0.05) return "Moderate constraint";
  return "Neutral / mixed";
}

function actorStance(effect: number): string {
  if (effect > 0.25) return "Strongly supportive";
  if (effect > 0.05) return "Supportive";
  if (effect < -0.25) return "Strongly resistive";
  if (effect < -0.05) return "Resistive";
  return "Neutral";
}

const ACTOR_BEHAVIOR_TEMPLATES: Record<
  string,
  { supportive: string; neutral: string; resistive: string }
> = {
  "Academic KOLs": {
    supportive:
      "Expected to present data at major congresses, author supportive publications, and anchor prescriber confidence through peer influence.",
    neutral:
      "Observing evidence with cautious interest — likely to await larger datasets or real-world outcomes before publicly endorsing.",
    resistive:
      "May raise questions about comparative evidence or highlight unmet durability concerns in peer forums, slowing early adoption.",
  },
  "Community Physicians": {
    supportive:
      "Broadly receptive to prescribing given clear guideline clarity and accessible access; real-world uptake volume likely to scale.",
    neutral:
      "Waiting for experience from early adopters and payer access confirmation before routinely incorporating into practice.",
    resistive:
      "Habitual patterns and reimbursement friction are dampening trial initiation; significant educational investment required.",
  },
  "Specialty Extenders / PCPs": {
    supportive:
      "Actively referring or co-managing patients; will amplify reach beyond specialist-only population.",
    neutral:
      "Limited familiarity with the indication — prescribing will follow specialist leadership rather than independent initiation.",
    resistive:
      "Minimal engagement anticipated; adoption will remain confined to specialist-initiated pathways.",
  },
  "Payers / Access": {
    supportive:
      "Favorable coverage positioning reduces patient-level friction; broad formulary placement expected to unlock volume.",
    neutral:
      "Step-edit or PA requirements in place — access is conditional and will require case-by-case justification.",
    resistive:
      "Restrictive formulary tiers or non-coverage rulings are creating material access barriers that will suppress uptake.",
  },
  "Guideline / Society Bodies": {
    supportive:
      "Inclusion in treatment algorithms or preferred therapy designation gives prescribers explicit clinical license to adopt broadly.",
    neutral:
      "Under review or pending data — prescribers are waiting for guideline clarity before committing at scale.",
    resistive:
      "Current guidelines favor alternative approaches; off-guideline use creates clinical-liability hesitancy among cautious prescribers.",
  },
  "Competitor Counteraction": {
    supportive:
      "Competitive noise is low or misdirected — minimal disruption to messaging and account access.",
    neutral:
      "Established competitors are maintaining formulary position but not actively counter-detailing; status quo access protected.",
    resistive:
      "Aggressive counter-detailing, rebate defense, and formulary-tier competition are eroding differentiation at the point of prescribing.",
  },
};

function getExpectedBehavior(actorName: string, effect: number): string {
  const templates = ACTOR_BEHAVIOR_TEMPLATES[actorName];
  if (!templates) {
    if (effect > 0.05)
      return "This stakeholder group is responding favorably and is expected to support adoption through their sphere of influence.";
    if (effect < -0.05)
      return "This stakeholder group is exhibiting resistance behaviors that will require targeted mitigation efforts.";
    return "This stakeholder group is observing from a neutral position — engagement strategy should monitor for inflection.";
  }
  if (effect > 0.05) return templates.supportive;
  if (effect < -0.05) return templates.resistive;
  return templates.neutral;
}

function interpretProbability(prob: number): string {
  if (prob >= 0.75) return "Strong favorable case";
  if (prob >= 0.6) return "Moderately favorable case requiring monitoring";
  if (prob >= 0.45) return "Balanced case — outcome uncertain";
  if (prob >= 0.3) return "Moderately unfavorable case";
  return "Low probability — significant barriers remain";
}

function oddsToProb(odds: number): number {
  return odds / (1 + odds);
}

export function runForecastEngine(
  caseId: string,
  priorProbability: number,
  signals: Signal[],
  actors: ActorConfig[],
  specialtyProfile: string,
  _payerEnvironment: string,
  _guidelineLeverage: string,
  _competitorProfile: string,
  agentSimulationResult?: {
    agentDerivedActorTranslation: number;
    agentResults: Array<{
      agentId: string;
      label: string;
      reactionScore: number;
      baseReactionScore?: number;
      stance: string;
      influenceAnnotations?: Array<{ fromLabel: string; label: string; delta: number }>;
      influenceScore?: number;
    }>;
  }
): ForecastOutput {
  const activeSignals = signals.filter(
    (s) => s.signalId && s.signalDescription && s.likelihoodRatio !== null
  );

  const priorOdds = priorProbability / (1 - priorProbability);

  const signalLrProduct = activeSignals.reduce(
    (product, s) => product * (s.likelihoodRatio ?? 1),
    1
  );

  const sortedActors = [...actors].sort((a, b) => a.slotIndex - b.slotIndex);

  const rawReactionSums: number[] = sortedActors.map(() => 0);

  const signalDetails: SignalForecastDetail[] = activeSignals.map((signal) => {
    const directionSign = signal.direction === "Positive" ? 1 : -1;
    const strengthReliabilityNorm =
      ((signal.strengthScore ?? 0) + (signal.reliabilityScore ?? 0)) / 10;

    const actorReactions: Record<string, number> = {};
    let weightedActorReaction = 0;

    sortedActors.forEach((actor, idx) => {
      const pharmaMultiplier = getPharmaMultiplier(
        signal.signalType ?? "",
        signal.targetPopulation ?? "",
        signal.brand ?? "",
        idx as ActorIndex
      );

      const responseFactor =
        signal.direction === "Positive"
          ? actor.positiveResponseFactor
          : actor.negativeResponseFactor;

      const rawReaction =
        directionSign *
        strengthReliabilityNorm *
        responseFactor *
        actor.outcomeOrientation *
        pharmaMultiplier;

      actorReactions[actor.actorName] = rawReaction;
      rawReactionSums[idx] += rawReaction;
      weightedActorReaction += rawReaction * actor.influenceWeight;
    });

    return {
      signalId: signal.signalId,
      signalType: signal.signalType ?? "Unknown",
      description: signal.signalDescription,
      direction: signal.direction,
      strengthScore: signal.strengthScore ?? 0,
      reliabilityScore: signal.reliabilityScore ?? 0,
      likelihoodRatio: signal.likelihoodRatio ?? 1,
      weightedActorReaction,
      actorReactions,
      absoluteImpact: Math.abs(weightedActorReaction),
    };
  });

  const actorAggregation: ActorAggregation[] = sortedActors.map((actor, idx) => {
    const netActorEffect = rawReactionSums[idx] * actor.influenceWeight;
    const effect = netActorEffect;
    return {
      actor: actor.actorName,
      rawReactionSum: rawReactionSums[idx],
      netActorEffect,
      interpretation: interpretActorEffect(effect),
      stance: actorStance(effect),
      expectedBehavior: getExpectedBehavior(actor.actorName, effect),
      influenceWeight: actor.influenceWeight,
    };
  });

  const netActorTranslation = actorAggregation.reduce(
    (sum, a) => sum + a.netActorEffect,
    0
  );

  const bayesianActorFactor = Math.exp(netActorTranslation / 4);

  // Use agent-derived translation when simulation is available (signals exist and were simulated)
  const agentActorFactor = agentSimulationResult?.agentDerivedActorTranslation ?? null;
  const actorAdjustmentFactor = agentActorFactor ?? bayesianActorFactor;
  const actorSource: "agent-simulation" | "bayesian-static" = agentActorFactor !== null ? "agent-simulation" : "bayesian-static";

  // Build per-agent summary for UI decomposition
  const PRESCRIBER_IDS = ["academic_specialist", "community_specialist", "inpatient_prescriber"];
  const agentActorSummary: AgentActorSummary[] = (agentSimulationResult?.agentResults ?? [])
    .filter((r) => PRESCRIBER_IDS.includes(r.agentId))
    .map((r) => {
      const base = r.baseReactionScore ?? r.reactionScore;
      const final = r.reactionScore;
      const weight = r.influenceScore ?? 1;
      return {
        agentId: r.agentId,
        label: r.label,
        baseScore: Number(base.toFixed(3)),
        finalScore: Number(final.toFixed(3)),
        stance: r.stance,
        influenceAnnotations: r.influenceAnnotations ?? [],
        contributionToTranslation: Number((final * weight).toFixed(3)),
      };
    });

  const posteriorOdds = priorOdds * signalLrProduct * actorAdjustmentFactor;
  const currentProbability = posteriorOdds / (1 + posteriorOdds);

  // Sensitivity analysis
  const upwardSignals: SensitivitySignal[] = [];
  const downwardSignals: SensitivitySignal[] = [];
  let bestSwing = 0;
  let swingFactor: SwingFactor | null = null;

  for (const sig of signalDetails) {
    const lr = sig.likelihoodRatio;
    const lrWithout = lr !== 0 ? signalLrProduct / lr : signalLrProduct;
    const oddsWithout = priorOdds * lrWithout * actorAdjustmentFactor;
    const probWithout = oddsToProb(oddsWithout);
    const deltaIfRemoved = Math.abs(currentProbability - probWithout);

    // "What if this signal were reversed?" — flip LR across 1: reversed LR = 1/lr
    const reversedLr = lr !== 0 ? 1 / lr : 1;
    const lrReversed = (signalLrProduct / lr) * reversedLr;
    const oddsReversed = priorOdds * lrReversed * actorAdjustmentFactor;
    const probReversed = oddsToProb(oddsReversed);
    const deltaIfReversed = Math.abs(currentProbability - probReversed);

    const entry: SensitivitySignal = {
      signalId: sig.signalId,
      description: sig.description,
      direction: sig.direction as "Positive" | "Negative",
      absoluteImpact: sig.absoluteImpact,
      likelihoodRatio: lr,
      probabilityWithout: probWithout,
      deltaIfRemoved,
    };

    if (sig.direction === "Positive") {
      upwardSignals.push(entry);
    } else {
      downwardSignals.push(entry);
    }

    if (deltaIfReversed > bestSwing) {
      bestSwing = deltaIfReversed;
      const isPositive = sig.direction === "Positive";
      swingFactor = {
        type: "signal",
        signalId: sig.signalId,
        description: sig.description,
        direction: sig.direction,
        currentProbabilityIfReversed: probReversed,
        probabilityDeltaIfReversed: probReversed - currentProbability,
        interpretation: isPositive
          ? `If this ${sig.direction.toLowerCase()} signal were reversed to negative, the forecast would shift by ${(deltaIfReversed * 100).toFixed(1)} percentage points — the single largest lever in the current model.`
          : `If this headwind were converted to a tailwind, the forecast could improve by ${(deltaIfReversed * 100).toFixed(1)} percentage points — the highest-value intervention available.`,
      };
    }
  }

  upwardSignals.sort((a, b) => b.absoluteImpact - a.absoluteImpact);
  downwardSignals.sort((a, b) => b.absoluteImpact - a.absoluteImpact);

  let stabilityNote: string;
  if (activeSignals.length === 0) {
    stabilityNote = "No signals are registered. Forecast reflects prior belief only.";
  } else if (swingFactor && Math.abs(swingFactor.probabilityDeltaIfReversed) > 0.15) {
    stabilityNote = `Forecast is sensitive to a single dominant signal. Address or monitor: "${swingFactor.description}".`;
  } else if (upwardSignals.length > 0 && downwardSignals.length > 0) {
    stabilityNote = "Forecast reflects a balanced signal environment. No single signal dominates.";
  } else if (upwardSignals.length > 0) {
    stabilityNote = "Signal portfolio is uniformly positive. Downside risk is low but monitor for emerging headwinds.";
  } else {
    stabilityNote = "Signal portfolio is uniformly negative. Identify which headwind is most addressable.";
  }

  const sensitivityAnalysis: SensitivityAnalysis = {
    upwardSignals,
    downwardSignals,
    swingFactor,
    stabilityNote,
  };

  let confidenceLevel: string;
  if (activeSignals.length === 0) confidenceLevel = "Low";
  else if (activeSignals.length < 3) confidenceLevel = "Developing";
  else if (Math.abs(netActorTranslation) < 0.15) confidenceLevel = "Moderate";
  else confidenceLevel = "High";

  const topSupportive = actorAggregation.reduce((best, a) =>
    a.netActorEffect > best.netActorEffect ? a : best
  );
  const topConstraining = actorAggregation.reduce((worst, a) =>
    a.netActorEffect < worst.netActorEffect ? a : worst
  );

  const topSupportiveActor =
    topSupportive.netActorEffect > 0 ? topSupportive.actor : null;
  const topConstrainingActor =
    topConstraining.netActorEffect < 0 ? topConstraining.actor : null;

  const sortedSignals = [...signalDetails].sort(
    (a, b) => b.absoluteImpact - a.absoluteImpact
  );
  const highestImpactSignal = sortedSignals[0]?.description ?? null;

  const hasMios = activeSignals.some((s) => s.miosFlag === "Yes");
  const hasOhos = activeSignals.some((s) => s.ohosFlag === "Yes");

  let recommendedAction: string;
  if (topSupportiveActor && topConstrainingActor) {
    recommendedAction = `Target supportive actors and close remaining objections`;
  } else if (topSupportiveActor) {
    recommendedAction = `Leverage ${topSupportiveActor} to amplify adoption momentum`;
  } else {
    recommendedAction = `Address barriers before broader deployment`;
  }

  const behavioralSummary = `Active actor set: ${specialtyProfile}. ${
    netActorTranslation > 0.3
      ? "Actor ecosystem is broadly supportive."
      : netActorTranslation < -0.1
        ? "Significant actor-level resistance detected."
        : "Mixed actor signals — selective engagement recommended."
  }`;

  return {
    caseId,
    priorProbability,
    priorOdds,
    signalLrProduct,
    bayesianActorFactor,
    agentActorFactor,
    actorAdjustmentFactor,
    actorSource,
    agentActorSummary,
    posteriorOdds,
    currentProbability,
    confidenceLevel,
    netActorTranslation,
    topSupportiveActor,
    topConstrainingActor,
    actorAggregation,
    signalDetails: sortedSignals,
    sensitivityAnalysis,
    interpretation: {
      primaryStatement: interpretProbability(currentProbability),
      topSupportiveActor,
      topConstrainingActor,
      highestImpactSignal,
      recommendedAction,
      miosRoutingCheck: hasMios ? "Yes" : "No",
      ohosRoutingCheck: hasOhos ? "Yes" : "No",
      behavioralSummary,
    },
  };
}
