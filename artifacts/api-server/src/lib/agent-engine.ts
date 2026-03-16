import {
  AGENT_ARCHETYPES,
  SIGNAL_AGENT_WEIGHTS,
  CROSS_AGENT_INFLUENCE,
  type AgentId,
  type SignalTypeKey,
} from "@workspace/db";
import type { AgentResult, AdoptionPhase } from "@workspace/db";

interface SignalInput {
  signalDescription: string;
  signalType: string;
  direction: string;
  likelihoodRatio: number;
  strengthScore: number;
  reliabilityScore: number;
}

function baseEffect(signal: SignalInput): number {
  const lr = signal.likelihoodRatio;
  if (signal.direction === "Positive") {
    return lr > 1 ? lr - 1 : -(1 / lr - 1);
  } else {
    return lr < 1 ? -(1 / lr - 1) : -(lr - 1);
  }
}

const POSITIVE_STANCES = new Set([
  "early_supporter",
  "supportive",
  "open_access",
  "favorable",
  "guideline_inclusion",
  "positive_mention",
  "high_engagement",
  "engaged",
]);

const NEGATIVE_STANCES = new Set([
  "cautious",
  "resistant",
  "restrictive",
  "blocking",
  "not_recommended",
  "insufficient_evidence",
  "low_engagement",
  "challenged",
]);

const ADVERSARIAL_POSITIVE = new Set(["active_opposition", "increased_pressure"]);

function mapStance(score: number, isAdversarial: boolean): AgentResult["stance"] {
  if (isAdversarial) {
    const threat = -score;
    if (threat > 1.2) return "active_opposition";
    if (threat > 0.4) return "increased_pressure";
    if (threat > -0.3) return "monitoring";
    return "complacent";
  }
  if (score > 1.5) return "early_supporter";
  if (score > 0.5) return "supportive";
  if (score > -0.3) return "neutral";
  if (score > -1.0) return "cautious";
  return "resistant";
}

function responsePhase(
  stance: AgentResult["stance"],
  responseSpeed: "fast" | "medium" | "slow"
): "early" | "mainstream" | "lagging" {
  const isPositive = POSITIVE_STANCES.has(stance as string);
  const isNeutral = stance === "neutral" || stance === "monitoring" || stance === "moderate_engagement";

  if (isPositive && responseSpeed === "fast") return "early";
  if (isPositive && responseSpeed === "medium") return "mainstream";
  if (isPositive && responseSpeed === "slow") return "mainstream";
  if (isNeutral) return "mainstream";
  return "lagging";
}

function buildReasoning(
  agentId: AgentId,
  score: number,
  stance: AgentResult["stance"],
  topSignals: AgentResult["topSignals"],
  isAdversarial: boolean
): string {
  const archetype = AGENT_ARCHETYPES.find((a) => a.id === agentId)!;

  if (topSignals.length === 0) {
    return `No active signals directly affect this stakeholder in the current signal mix. Stance is baseline neutral.`;
  }

  const topSig = topSignals[0];
  const positiveSignals = topSignals.filter((s) => s.contribution > 0);
  const negativeSignals = topSignals.filter((s) => s.contribution < 0);

  if (isAdversarial) {
    if (stance === "active_opposition") {
      return `Strong positive clinical and market signals are threatening. This competitor will mobilise counteraction rapidly. Key trigger: ${topSig.signalType} signal.`;
    }
    if (stance === "increased_pressure") {
      return `Market signals indicate growing product strength. Competitor will increase pricing pressure and messaging. Key trigger: ${topSig.signalType}.`;
    }
    return `Current signal environment does not pose immediate threat. Competitor is monitoring but not actively mobilising.`;
  }

  const stanceDescriptions: Record<AgentResult["stance"], string> = {
    early_supporter: "is positioned to be an early adopter and active advocate",
    supportive: "is leaning toward adoption with moderate-strong conviction",
    neutral: "is in a wait-and-see position — neither committed nor opposed",
    cautious: "has reservations that are slowing adoption decision",
    resistant: "is actively opposed or facing major adoption barriers",
    active_opposition: "is mobilising counter-measures",
    increased_pressure: "is increasing competitive pressure",
    monitoring: "is monitoring developments closely",
    complacent: "is not actively responding to market signals",
  };

  const desc = stanceDescriptions[stance] ?? "has a mixed reaction";
  let reasoning = `${archetype.label} ${desc}. `;

  if (positiveSignals.length > 0 && negativeSignals.length === 0) {
    reasoning += `Primarily driven by ${positiveSignals.map((s) => s.signalType).join(" and ")} signals. `;
  } else if (negativeSignals.length > 0 && positiveSignals.length === 0) {
    reasoning += `Inhibited by ${negativeSignals.map((s) => s.signalType).join(" and ")} signals. `;
  } else if (positiveSignals.length > 0 && negativeSignals.length > 0) {
    reasoning += `Mixed picture: ${positiveSignals.map((s) => s.signalType).join(" and ")} are pulling toward adoption while ${negativeSignals.map((s) => s.signalType).join(" and ")} are creating friction. `;
  }

  if (archetype.inertia > 0.6) {
    reasoning += `High institutional inertia means movement will be delayed even with strong signals.`;
  } else if (archetype.responseSpeed === "fast") {
    reasoning += `Fast response speed means this group will move quickly once stance is determined.`;
  }

  return reasoning;
}

export interface SimulationOutput {
  agentResults: AgentResult[];
  adoptionSequence: AdoptionPhase[];
  overallReadiness: string;
  agentDerivedActorTranslation: number;
}

export function simulateAgents(signals: SignalInput[]): SimulationOutput {
  // ── First pass: signal-driven base scores ──────────────────────────────────
  const firstPass: AgentResult[] = AGENT_ARCHETYPES.map((archetype) => {
    const signalContributions: Array<{
      description: string;
      signalType: string;
      contribution: number;
    }> = [];

    for (const signal of signals) {
      const typeKey = signal.signalType as SignalTypeKey;
      const weightMap = SIGNAL_AGENT_WEIGHTS[typeKey];
      if (!weightMap) continue;

      const weight = weightMap[archetype.id] ?? 0;
      if (weight === 0) continue;

      const effect = baseEffect(signal);
      const contribution = effect * weight * (1 - archetype.inertia * 0.5);

      signalContributions.push({
        description: signal.signalDescription,
        signalType: signal.signalType,
        contribution: Number(contribution.toFixed(3)),
      });
    }

    const reactionScore = signalContributions.reduce((sum, s) => sum + s.contribution, 0);
    const effectiveScore = archetype.isAdversarial ? -reactionScore : reactionScore;
    const stance = mapStance(effectiveScore, archetype.isAdversarial);

    const topSignals = [...signalContributions]
      .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))
      .slice(0, 3);

    const phase = responsePhase(stance, archetype.responseSpeed);
    const reasoning = buildReasoning(archetype.id, reactionScore, stance, topSignals, archetype.isAdversarial);

    return {
      agentId: archetype.id,
      label: archetype.label,
      role: archetype.role,
      stance,
      reactionScore: Number(reactionScore.toFixed(3)),
      baseReactionScore: Number(reactionScore.toFixed(3)),
      topSignals,
      reasoning,
      responsePhase: phase,
    };
  });

  // ── Second pass: cross-agent influence adjustment ──────────────────────────
  const agentResults: AgentResult[] = firstPass.map((result) => {
    const archetype = AGENT_ARCHETYPES.find((a) => a.id === result.agentId)!;
    const influenceAnnotations: AgentResult["influenceAnnotations"] = [];
    let influenceAdjustment = 0;

    for (const rule of CROSS_AGENT_INFLUENCE) {
      if (rule.to !== result.agentId) continue;

      const influencer = firstPass.find((r) => r.agentId === rule.from);
      if (!influencer) continue;

      const influencerArchetype = AGENT_ARCHETYPES.find((a) => a.id === rule.from)!;

      // Determine if the condition is met
      const influencerStance = influencer.stance as string;
      const isPositive = POSITIVE_STANCES.has(influencerStance)
        || (influencerArchetype.isAdversarial && ADVERSARIAL_POSITIVE.has(influencerStance));
      const isNegative = NEGATIVE_STANCES.has(influencerStance);

      let conditionMet = false;
      if (rule.condition === "positive" && isPositive) conditionMet = true;
      if (rule.condition === "negative" && isNegative) conditionMet = true;
      if (rule.condition === "any") conditionMet = true;

      if (!conditionMet) continue;

      // Magnitude is scaled by the influencer's absolute reaction score
      const magnitude = Math.abs(influencer.reactionScore) * rule.strength;
      const delta = rule.direction === "amplify" ? magnitude : -magnitude;

      influenceAdjustment += delta;
      influenceAnnotations.push({
        fromLabel: influencer.label,
        label: rule.label,
        delta: Number(delta.toFixed(3)),
      });
    }

    const adjustedScore = result.reactionScore + influenceAdjustment;
    const effectiveScore = archetype.isAdversarial ? -adjustedScore : adjustedScore;
    const newStance = mapStance(effectiveScore, archetype.isAdversarial);
    const newPhase = responsePhase(newStance, archetype.responseSpeed);

    return {
      ...result,
      reactionScore: Number(adjustedScore.toFixed(3)),
      stance: newStance,
      responsePhase: newPhase,
      influenceAnnotations,
    };
  });

  // ── Adoption sequence ──────────────────────────────────────────────────────
  const earlyAgents = agentResults.filter(
    (a) => a.responsePhase === "early" && !AGENT_ARCHETYPES.find((ar) => ar.id === a.agentId)?.isAdversarial
  );
  const mainstreamAgents = agentResults.filter(
    (a) => a.responsePhase === "mainstream" && !AGENT_ARCHETYPES.find((ar) => ar.id === a.agentId)?.isAdversarial
  );
  const laggingAgents = agentResults.filter(
    (a) => a.responsePhase === "lagging" && !AGENT_ARCHETYPES.find((ar) => ar.id === a.agentId)?.isAdversarial
  );

  const adoptionSequence: AdoptionPhase[] = [
    { phase: "early", label: "Early movers", timeframe: "0 – 6 months", agents: earlyAgents.map((a) => a.label) },
    { phase: "mainstream", label: "Mainstream", timeframe: "6 – 18 months", agents: mainstreamAgents.map((a) => a.label) },
    { phase: "lagging", label: "Lagging", timeframe: "18 – 36 months", agents: laggingAgents.map((a) => a.label) },
  ];

  // ── Overall readiness from second-pass prescriber scores ──────────────────
  const prescribers = agentResults.filter((a) =>
    ["academic_specialist", "community_specialist", "inpatient_prescriber"].includes(a.agentId)
  );
  const avgScore = prescribers.reduce((s, a) => s + a.reactionScore, 0) / (prescribers.length || 1);

  let overallReadiness: string;
  if (avgScore > 1.0) overallReadiness = "Strong — multiple key prescriber groups are supportive and likely to move early";
  else if (avgScore > 0.3) overallReadiness = "Moderate — prescriber sentiment is positive but not uniform; expect staged uptake";
  else if (avgScore > -0.3) overallReadiness = "Mixed — early adoption likely concentrated in specialist centres; community lag expected";
  else overallReadiness = "Challenging — significant barriers exist across prescriber groups; access and evidence gaps must be addressed first";

  // ── Agent-derived actor translation factor ─────────────────────────────────
  // Weighted prescriber net score → exp(netScore / 4) mirrors the Bayesian engine's actor formula
  const prescriberIds = ["academic_specialist", "community_specialist", "inpatient_prescriber"] as AgentId[];
  let weightedNetScore = 0;
  let totalInfluenceWeight = 0;
  for (const id of prescriberIds) {
    const result = agentResults.find((r) => r.agentId === id);
    const archetype = AGENT_ARCHETYPES.find((a) => a.id === id);
    if (result && archetype) {
      weightedNetScore += result.reactionScore * archetype.influenceScore;
      totalInfluenceWeight += archetype.influenceScore;
    }
  }
  const normalizedNetScore = totalInfluenceWeight > 0 ? weightedNetScore / totalInfluenceWeight : 0;
  const agentDerivedActorTranslation = Math.exp(normalizedNetScore / 4);

  return { agentResults, adoptionSequence, overallReadiness, agentDerivedActorTranslation };
}
