import { clamp, round4 } from "./stability";

export type SpecialtyActorProfile =
  | "general"
  | "early_adopter_specialty"
  | "conservative_specialty"
  | "cost_sensitive_specialty"
  | "procedural_specialty";

export type PayerEnvironment =
  | "favorable"
  | "balanced"
  | "restrictive";

export type GuidelineLeverage =
  | "low"
  | "medium"
  | "high";

export type CompetitiveLandscape =
  | "open_market"
  | "moderate_competition"
  | "entrenched_standard_of_care";

export type AdoptionPhase =
  | "pre_launch"
  | "early_adoption"
  | "growth"
  | "plateau"
  | "decline";

export type ForecastHorizonMonths = 6 | 12 | 24 | 36;

export interface ActorEnvironmentConfig {
  specialtyActorProfile: SpecialtyActorProfile;
  payerEnvironment: PayerEnvironment;
  guidelineLeverage: GuidelineLeverage;
  competitiveLandscape: CompetitiveLandscape;
  accessFrictionIndex?: number;
  adoptionPhase?: AdoptionPhase;
  forecastHorizonMonths?: ForecastHorizonMonths;
}

export interface EnvironmentAdjustmentResult {
  priorMultiplier: number;
  posteriorMultiplier: number;
  explanation: string[];
  normalizedConfig: Required<ActorEnvironmentConfig>;
}

const VALID_SPECIALTY: SpecialtyActorProfile[] = ["general", "early_adopter_specialty", "conservative_specialty", "cost_sensitive_specialty", "procedural_specialty"];
const VALID_PAYER: PayerEnvironment[] = ["favorable", "balanced", "restrictive"];
const VALID_GUIDELINE: GuidelineLeverage[] = ["low", "medium", "high"];
const VALID_LANDSCAPE: CompetitiveLandscape[] = ["open_market", "moderate_competition", "entrenched_standard_of_care"];
const VALID_PHASE: AdoptionPhase[] = ["pre_launch", "early_adoption", "growth", "plateau", "decline"];
const VALID_HORIZON: ForecastHorizonMonths[] = [6, 12, 24, 36];

function validOrDefault<T>(value: unknown, validSet: T[], fallback: T): T {
  return validSet.includes(value as T) ? (value as T) : fallback;
}

export function normalizeActorEnvironment(
  config: ActorEnvironmentConfig
): Required<ActorEnvironmentConfig> {
  return {
    specialtyActorProfile: validOrDefault(config.specialtyActorProfile, VALID_SPECIALTY, "general"),
    payerEnvironment: validOrDefault(config.payerEnvironment, VALID_PAYER, "balanced"),
    guidelineLeverage: validOrDefault(config.guidelineLeverage, VALID_GUIDELINE, "medium"),
    competitiveLandscape: validOrDefault(config.competitiveLandscape, VALID_LANDSCAPE, "entrenched_standard_of_care"),
    accessFrictionIndex: clamp(config.accessFrictionIndex ?? 0.5, 0, 1),
    adoptionPhase: validOrDefault(config.adoptionPhase, VALID_PHASE, "early_adoption"),
    forecastHorizonMonths: validOrDefault(config.forecastHorizonMonths, VALID_HORIZON, 12),
  };
}

export function computeEnvironmentAdjustments(
  rawConfig: ActorEnvironmentConfig
): EnvironmentAdjustmentResult {
  const config = normalizeActorEnvironment(rawConfig);
  const notes: string[] = [];

  let priorMultiplier = 1.0;
  let posteriorMultiplier = 1.0;

  const specialtyPriorMap: Record<SpecialtyActorProfile, number> = {
    general: 1.0,
    early_adopter_specialty: 1.08,
    conservative_specialty: 0.93,
    cost_sensitive_specialty: 0.95,
    procedural_specialty: 1.03,
  };
  priorMultiplier *= specialtyPriorMap[config.specialtyActorProfile];
  notes.push(
    `Specialty profile '${config.specialtyActorProfile}' adjusted prior by ${specialtyPriorMap[config.specialtyActorProfile].toFixed(2)}`
  );

  const payerPosteriorMap: Record<PayerEnvironment, number> = {
    favorable: 1.06,
    balanced: 1.0,
    restrictive: 0.92,
  };
  posteriorMultiplier *= payerPosteriorMap[config.payerEnvironment];
  notes.push(
    `Payer environment '${config.payerEnvironment}' adjusted posterior by ${payerPosteriorMap[config.payerEnvironment].toFixed(2)}`
  );

  const guidelinePriorMap: Record<GuidelineLeverage, number> = {
    low: 0.96,
    medium: 1.0,
    high: 1.07,
  };
  priorMultiplier *= guidelinePriorMap[config.guidelineLeverage];
  notes.push(
    `Guideline leverage '${config.guidelineLeverage}' adjusted prior by ${guidelinePriorMap[config.guidelineLeverage].toFixed(2)}`
  );

  const competitionPosteriorMap: Record<CompetitiveLandscape, number> = {
    open_market: 1.06,
    moderate_competition: 0.99,
    entrenched_standard_of_care: 0.9,
  };
  posteriorMultiplier *= competitionPosteriorMap[config.competitiveLandscape];
  notes.push(
    `Competitive landscape '${config.competitiveLandscape}' adjusted posterior by ${competitionPosteriorMap[config.competitiveLandscape].toFixed(2)}`
  );

  const accessShift = (0.5 - config.accessFrictionIndex) * 0.16;
  const accessMultiplier = clamp(1 + accessShift, 0.92, 1.08);
  posteriorMultiplier *= accessMultiplier;
  notes.push(
    `Access friction index ${config.accessFrictionIndex.toFixed(2)} adjusted posterior by ${accessMultiplier.toFixed(2)}`
  );

  const phasePriorMap: Record<AdoptionPhase, number> = {
    pre_launch: 0.9,
    early_adoption: 1.0,
    growth: 1.08,
    plateau: 0.98,
    decline: 0.9,
  };
  priorMultiplier *= phasePriorMap[config.adoptionPhase];
  notes.push(
    `Adoption phase '${config.adoptionPhase}' adjusted prior by ${phasePriorMap[config.adoptionPhase].toFixed(2)}`
  );

  const horizonPosteriorMap: Record<ForecastHorizonMonths, number> = {
    6: 0.95,
    12: 1.0,
    24: 1.06,
    36: 1.1,
  };
  posteriorMultiplier *= horizonPosteriorMap[config.forecastHorizonMonths];
  notes.push(
    `Forecast horizon ${config.forecastHorizonMonths} months adjusted posterior by ${horizonPosteriorMap[config.forecastHorizonMonths].toFixed(2)}`
  );

  priorMultiplier = clamp(priorMultiplier, 0.8, 1.2);
  posteriorMultiplier = clamp(posteriorMultiplier, 0.8, 1.2);

  return {
    priorMultiplier: round4(priorMultiplier),
    posteriorMultiplier: round4(posteriorMultiplier),
    explanation: notes,
    normalizedConfig: config,
  };
}

export function applyEnvironmentToProbability(
  baseProbability: number,
  adjustments: EnvironmentAdjustmentResult
): number {
  const clampedBase = clamp(baseProbability, 0.01, 0.99);
  const odds = clampedBase / (1 - clampedBase);
  const adjustedOdds = odds * adjustments.priorMultiplier * adjustments.posteriorMultiplier;
  const adjustedProbability = adjustedOdds / (1 + adjustedOdds);
  return round4(clamp(adjustedProbability, 0.01, 0.99));
}
