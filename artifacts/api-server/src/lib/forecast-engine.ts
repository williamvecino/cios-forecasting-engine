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
}

export interface ForecastOutput {
  caseId: string;
  priorProbability: number;
  priorOdds: number;
  signalLrProduct: number;
  actorAdjustmentFactor: number;
  posteriorOdds: number;
  currentProbability: number;
  confidenceLevel: string;
  netActorTranslation: number;
  topSupportiveActor: string | null;
  topConstrainingActor: string | null;
  actorAggregation: ActorAggregation[];
  signalDetails: SignalForecastDetail[];
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

function interpretProbability(prob: number): string {
  if (prob >= 0.75) return "Strong favorable case";
  if (prob >= 0.6) return "Moderately favorable case requiring monitoring";
  if (prob >= 0.45) return "Balanced case — outcome uncertain";
  if (prob >= 0.3) return "Moderately unfavorable case";
  return "Low probability — significant barriers remain";
}

export function runForecastEngine(
  caseId: string,
  priorProbability: number,
  signals: Signal[],
  actors: ActorConfig[],
  specialtyProfile: string,
  _payerEnvironment: string,
  _guidelineLeverage: string,
  _competitorProfile: string
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
    return {
      actor: actor.actorName,
      rawReactionSum: rawReactionSums[idx],
      netActorEffect,
      interpretation: interpretActorEffect(netActorEffect),
    };
  });

  const netActorTranslation = actorAggregation.reduce(
    (sum, a) => sum + a.netActorEffect,
    0
  );

  const actorAdjustmentFactor = Math.exp(netActorTranslation / 2);
  const posteriorOdds = priorOdds * signalLrProduct * actorAdjustmentFactor;
  const currentProbability = posteriorOdds / (1 + posteriorOdds);

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
    actorAdjustmentFactor,
    posteriorOdds,
    currentProbability,
    confidenceLevel,
    netActorTranslation,
    topSupportiveActor,
    topConstrainingActor,
    actorAggregation,
    signalDetails: sortedSignals,
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
