export interface CaseSummary {
  id: string;
  caseId: string;
  assetName: string;
  assetType: string;
  therapeuticArea: string;
  diseaseState: string;
  specialty: string;
  geography: string;
  strategicQuestion: string;
  outcomeDefinition: string;
  timeHorizon: string;
  priorProbability: number;
  currentProbability: number;
  confidenceLevel: "Low" | "Developing" | "Moderate" | "High";
  primaryBrand: string;
  primarySpecialtyProfile: string;
  payerEnvironment: string;
  guidelineLeverage: string;
  competitorProfile: string;
  topSupportiveActor: string | null;
  topConstrainingActor: string | null;
  miosRoutingCheck: string | null;
  ohosRoutingCheck: string | null;
  isDemo: "true" | "false";
  lastUpdate: string;
  signalCount: number;
}

export interface SignalDetail {
  id: string;
  signalId: string;
  caseId: string;
  candidateId: string | null;
  brand: string | null;
  signalDescription: string;
  signalType: string;
  direction: "Positive" | "Negative";
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  scope: "national" | "regional" | "local";
  timing: "current" | "near-term" | "long-term";
  route: string | null;
  targetPopulation: string | null;
  miosFlag: "Yes" | "No";
  ohosFlag: "Yes" | "No";
  weightedSignalScore: number;
  activeLikelihoodRatio: number;
  createdAt: string;
}

export interface ForecastSignalDetail {
  signalId: string;
  signalType: string;
  signalDescription: string;
  direction: "Positive" | "Negative";
  strengthScore: number;
  reliabilityScore: number;
  likelihoodRatio: number;
  weightedActorReaction: number;
  actorReactions: Record<string, number>;
  absoluteImpact: number;
}

export interface ForecastActorAggregation {
  actor: string;
  rawReactionSum: number;
  netActorEffect: number;
  interpretation: string;
  stance: string;
  expectedBehavior: string;
  influenceWeight: number;
}

export interface ForecastAgentSummary {
  agentId: string;
  label: string;
  baseScore: number;
  finalScore: number;
  stance: string;
  influenceAnnotations: Array<{
    fromLabel: string;
    label: string;
    delta: number;
  }>;
  contributionToTranslation: number;
}

export interface HierarchicalCalibration {
  calibratedProbability: number;
  fallbackLevel: string;
  fallbackReason: string;
  bucket: string | null;
  localSegmentN: number;
  globalBucketN: number;
  correctionAppliedPp: number;
  localSegmentCorrectionPp: number | null;
  globalBucketCorrectionPp: number | null;
}

export interface CalibrationConfidence {
  level: "high" | "medium" | "low";
  reason: string;
  localSegmentN: number;
  globalBucketN: number;
  correctionStable: boolean;
  localSegmentUsed: boolean;
  caseProfileSimilarity: number;
}

export interface ForecastDetailResponse {
  caseId: string;
  priorProbability: number;
  priorOdds: number;
  signalLrProduct: number;
  bayesianActorFactor: number;
  agentActorFactor: number | null;
  actorAdjustmentFactor: number;
  actorSource: "agent-simulation" | "bayesian-static";
  agentActorSummary: ForecastAgentSummary[];
  posteriorOdds: number;
  currentProbability: number;
  rawProbability: number;
  confidenceLevel: "Low" | "Developing" | "Moderate" | "High";
  netActorTranslation: number;
  topSupportiveActor: string | null;
  topConstrainingActor: string | null;
  actorAggregation: ForecastActorAggregation[];
  signalDetails: ForecastSignalDetail[];
  sensitivityAnalysis: {
    upwardSignals: Array<{
      signalId: string;
      signalType: string;
      currentLR: number;
      adjustedLR: number;
      probabilityImpact: number;
    }>;
    downwardSignals: Array<{
      signalId: string;
      signalType: string;
      currentLR: number;
      adjustedLR: number;
      probabilityImpact: number;
    }>;
    swingFactor: {
      signalId: string;
      description: string;
      swingMagnitude: number;
    } | null;
    stabilityNote: string;
  };
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
  bucketCorrectionApplied: {
    bucket: string;
    correctionPp: number;
  } | null;
  hierarchicalCalibration: HierarchicalCalibration;
  calibrationConfidence: CalibrationConfidence;
  forecastId: string;
  savedAt: string;
}

export interface ScenarioSimulationRequest {
  excludeSignalIds: string[];
}

export interface ScenarioSimulationResponse {
  baseProbability: number;
  scenarioProbability: number;
  delta: number;
  excludedCount: number;
  totalSignals: number;
  scenarioSignals: number;
}

export interface Recommendation {
  headline: string;
  rationale: string;
  riskNote: string;
  monitorNext: string[];
}

export interface CalibrationBandStat {
  band: string;
  count: number;
  meanPredicted: number | null;
  meanActual: number | null;
}

export interface CalibrationSummary {
  totalForecasts: number;
  calibratedForecasts: number;
  meanBrierScore: number | null;
  meanForecastError: number | null;
  bandStats: CalibrationBandStat[];
}

export interface ForecastLedgerEntry {
  id: string;
  predictionId: string;
  caseId: string;
  strategicQuestion: string;
  forecastProbability: number;
  forecastDate: string;
  timeHorizon: string;
  expectedResolutionDate: string | null;
  actualOutcome: number | null;
  resolutionDate: string | null;
  predictionError: number | null;
  calibrationBucket: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ResolveOutcomeRequest {
  actualOutcome: 0 | 1;
  resolutionDate?: string;
}

export interface StrategicNarrative {
  caseId: string;
  predictionId: string | null;
  forecastDate: string;
  generatedAt: string;
  sections: {
    headline: string;
    coreForecastStatement: string;
    supportingDrivers: string;
    risksAndCounterSignals: string;
    interpretation: string;
    strategicImplication: string;
    whatWouldChangeTheForecast: string;
  };
}

export interface WeeklyStrategicBrief {
  generatedAt: string;
  briefDate: string;
  systemOverview: {
    activeForecasts: number;
    pendingAssessments: number;
    resolvedForecasts: number;
    calibrationScore: number | null;
    totalSignals: number;
    watchlistEvents: number;
  };
  keyForecasts: {
    caseId: string;
    assetName: string;
    therapeuticArea: string;
    strategicQuestion: string;
    currentProbability: number;
    confidenceLevel: string;
    timeHorizon: string;
  }[];
  majorDrivers: {
    description: string;
    signalType: string;
    caseId: string;
    assetName: string;
    likelihoodRatio: number;
  }[];
  keyRisks: {
    description: string;
    signalType: string;
    caseId: string;
    assetName: string;
    likelihoodRatio: number;
  }[];
  upcomingWatchlist: {
    watchEventId: string;
    eventType: string;
    eventName: string;
    targetAssetOrCompetitor: string | null;
    expectedDate: string | null;
    status: string;
    potentialSignalCategory: string | null;
    expectedDirection: string | null;
  }[];
}

export interface CompetitorBehaviorEntry {
  id: string;
  behaviorId: string;
  competitorName: string;
  assetName: string;
  behaviorType: string;
  behaviorDescription: string | null;
  likelihoodEstimate: number | null;
  strategicImpact: string | null;
  expectedTiming: string | null;
  relatedCaseId: string | null;
  sourceBasis: string | null;
  status: "Proposed" | "Monitoring" | "Confirmed" | "Closed";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SignalWatchlistEntry {
  id: string;
  watchEventId: string;
  caseId: string | null;
  eventType: string;
  eventName: string;
  eventDescription: string | null;
  targetAssetOrCompetitor: string | null;
  expectedDate: string | null;
  status: "Upcoming" | "Monitoring" | "Occurred" | "Closed";
  potentialSignalCategory: string | null;
  expectedDirection: string | null;
  sourceLink: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}
