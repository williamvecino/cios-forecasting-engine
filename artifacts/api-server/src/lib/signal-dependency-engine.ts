import type { Signal } from "@workspace/db";

export const SOURCE_CLUSTERS = [
  "Clinical Evidence",
  "KOL / Expert Interpretation",
  "Publication / Guideline",
  "Market Research",
  "Field Feedback",
  "Real-World Evidence",
  "Access / Policy",
  "Competitive Intelligence",
  "Operational / Workflow",
  "Other",
] as const;
export type SourceCluster = (typeof SOURCE_CLUSTERS)[number];

export const DEPENDENCY_ROLES = [
  "Root",
  "Direct derivative",
  "Second-order derivative",
  "Independent parallel evidence",
] as const;
export type DependencyRole = (typeof DEPENDENCY_ROLES)[number];

export type LineageConfidence = "High" | "Medium" | "Low";
export type NovelInformationFlag = "Yes" | "Partial" | "No";
export type EchoVsTranslation = "Echo" | "Translation" | "Independent";

export interface DependencyTaggedSignal {
  signal: Signal;
  rootEvidenceId: string;
  signalLineage: string;
  sourceCluster: SourceCluster;
  dependencyRole: DependencyRole;
  lineageConfidence: LineageConfidence;
  novelInformationFlag: NovelInformationFlag;
  echoVsTranslation: EchoVsTranslation;
}

export interface EvidenceCluster {
  rootEvidenceId: string;
  rootSignal: DependencyTaggedSignal;
  descendants: DependencyTaggedSignal[];
  clusterSignalCount: number;
  compressedSignalCount: number;
  echoCount: number;
  translationCount: number;
  independentCount: number;
}

export interface CompressedSignal {
  originalSignalId: string;
  compressedLikelihoodRatio: number;
  rawLikelihoodRatio: number;
  compressionFactor: number;
  isRoot: boolean;
  clusterId: string;
}

export interface DependencyAnalysisResult {
  clusters: EvidenceCluster[];
  independentSignals: DependencyTaggedSignal[];
  compressedSignals: CompressedSignal[];
  metrics: DependencyMetrics;
  warnings: ConcentrationWarning[];
  confidenceCeiling: ConfidenceCeiling;
}

export interface DependencyMetrics {
  totalSignalCount: number;
  clusterCount: number;
  independentEvidenceFamilies: number;
  noveltyScore: number;
  echoDensity: number;
  evidenceDiversityScore: number;
  posteriorFragilityScore: number;
  concentrationPenalty: number;
}

export interface ConfidenceCeiling {
  maxAllowedProbability: number;
  reason: string;
  diversityLevel: "high" | "moderate" | "low" | "single";
}

export interface ConcentrationWarning {
  type: "cluster_size" | "posterior_concentration" | "descendant_overload" | "low_diversity" | "correlated_stacking";
  severity: "high" | "medium" | "low";
  message: string;
  clusterId?: string;
}

export interface NaiveVsCompressedComparison {
  naiveLrProduct: number;
  compressedLrProduct: number;
  naivePosterior: number;
  compressedPosterior: number;
  delta: number;
  inflationPrevented: number;
}

const SIGNAL_TYPE_TO_CLUSTER: Record<string, SourceCluster> = {
  PHASE_III_CLINICAL: "Clinical Evidence",
  REGULATORY_CLINICAL: "Clinical Evidence",
  KOL_ENDORSEMENT: "KOL / Expert Interpretation",
  GUIDELINE_INCLUSION: "Publication / Guideline",
  MARKET_ADOPTION: "Market Research",
  PAYER_ACCESS: "Access / Policy",
  ACCESS_COMMERCIAL: "Access / Policy",
  COMPETITOR_COUNTERMOVE: "Competitive Intelligence",
  OPERATIONAL_FRICTION: "Operational / Workflow",
  CAPACITY_INFRASTRUCTURE: "Operational / Workflow",
};

export function inferSourceCluster(signal: Signal): SourceCluster {
  if (signal.sourceCluster) {
    const match = SOURCE_CLUSTERS.find(
      (c) => c.toLowerCase() === (signal.sourceCluster ?? "").toLowerCase()
    );
    if (match) return match;
  }
  return SIGNAL_TYPE_TO_CLUSTER[signal.signalType ?? ""] ?? "Other";
}

export function computeTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

const TRIAL_ID_PATTERN = /\b(NCT\d{6,10})\b/i;
const NAMED_TRIAL_PATTERN = /\b(TRAILBLAZER[- ]?\d|CLARITY[- ]?AD|EMERGE[- ]?\d|GRADUATE[- ]?\d|KEYNOTE[- ]?\d{2,4}|CHECKMATE[- ]?\d{2,4}|HIMALAYA[- ]?\d|TOPAZ[- ]?\d|APOLLO[- ]?\d|DESTINY[- ]?\w+\d|MAGELLAN[- ]?\d|COMBI-[A-Z]+|BREAK-[A-Z]+|coBRIM|COLUMBUS[- ]?\d|IMpower\d{2,4}|IMbrave\d{2,4}|MONALEESA[- ]?\d|PALOMA[- ]?\d|MONARCH[- ]?\d|SOLO[- ]?\d|PRIMA[- ]?\d|PAOLA[- ]?\d|ARIEL[- ]?\d|NOVA[- ]?\d|TITAN[- ]?\d|SPARTAN[- ]?\d|VISION[- ]?\d|PROFOUND[- ]?\d|TRITON[- ]?\d|TALAPRO[- ]?\d|ENZAMET|PROSPER|ARAMIS|EMBARK|ARASENS|PEACE[- ]?\d)/i;

export function extractTrialIdentifier(text: string): string | null {
  const nctMatch = text.match(TRIAL_ID_PATTERN);
  if (nctMatch) return nctMatch[1].toUpperCase();
  const namedMatch = text.match(NAMED_TRIAL_PATTERN);
  if (namedMatch) return namedMatch[1].toUpperCase();
  return null;
}

function shareTrialIdentifier(descA: string, descB: string): boolean {
  const trialA = extractTrialIdentifier(descA);
  const trialB = extractTrialIdentifier(descB);
  if (!trialA || !trialB) return false;
  return trialA === trialB;
}

const TRANSLATION_QUALIFYING_CLUSTERS: Set<SourceCluster> = new Set([
  "Field Feedback",
  "Access / Policy",
  "Operational / Workflow",
  "Market Research",
  "Real-World Evidence",
]);

const TRANSLATION_KEYWORDS = /\b(adopt|prescri|switch|workflow|access|formulary|pathway|tier|step.?therapy|copay|prior.?auth|burden|friction|segment|community|academic|uptake|lag|delay|timeline|sequenc|reimburse|coverage|copay|deductible|restrict|prefer|non.?prefer|block|denial|appeal|utiliz)/i;

export function classifyEchoOrTranslation(
  rootCluster: SourceCluster,
  candidateCluster: SourceCluster,
  candidateDesc: string
): EchoVsTranslation {
  if (rootCluster === candidateCluster) return "Echo";

  if (TRANSLATION_QUALIFYING_CLUSTERS.has(candidateCluster)) {
    if (TRANSLATION_KEYWORDS.test(candidateDesc)) return "Translation";
  }

  return "Echo";
}

function inferLineageRelationship(
  signal: Signal,
  candidate: Signal
): { isRelated: boolean; role: DependencyRole; confidence: LineageConfidence; echoOrTranslation: EchoVsTranslation } {
  if (signal.rootEvidenceId && candidate.rootEvidenceId && signal.rootEvidenceId === candidate.rootEvidenceId) {
    const clsA = inferSourceCluster(signal);
    const clsB = inferSourceCluster(candidate);
    const etype = classifyEchoOrTranslation(clsA, clsB, candidate.signalDescription ?? "");
    return { isRelated: true, role: "Direct derivative", confidence: "High", echoOrTranslation: etype };
  }

  if (signal.correlationGroup && candidate.correlationGroup && signal.correlationGroup === candidate.correlationGroup) {
    const clsA = inferSourceCluster(signal);
    const clsB = inferSourceCluster(candidate);
    const etype = classifyEchoOrTranslation(clsA, clsB, candidate.signalDescription ?? "");
    return { isRelated: true, role: "Direct derivative", confidence: "High", echoOrTranslation: etype };
  }

  const descA = signal.signalDescription ?? "";
  const descB = candidate.signalDescription ?? "";

  if (shareTrialIdentifier(descA, descB)) {
    const clsA = inferSourceCluster(signal);
    const clsB = inferSourceCluster(candidate);
    const etype = classifyEchoOrTranslation(clsA, clsB, descB);
    return { isRelated: true, role: "Direct derivative", confidence: "High", echoOrTranslation: etype };
  }

  const similarity = computeTextSimilarity(descA, descB);

  if (similarity > 0.7) {
    const clsA = inferSourceCluster(signal);
    const clsB = inferSourceCluster(candidate);
    const etype = classifyEchoOrTranslation(clsA, clsB, descB);
    return { isRelated: true, role: "Direct derivative", confidence: "Medium", echoOrTranslation: etype };
  }

  if (similarity > 0.5) {
    const clsA = inferSourceCluster(signal);
    const clsB = inferSourceCluster(candidate);
    const etype = classifyEchoOrTranslation(clsA, clsB, descB);
    return {
      isRelated: true,
      role: "Second-order derivative",
      confidence: "Low",
      echoOrTranslation: etype,
    };
  }

  return { isRelated: false, role: "Independent parallel evidence", confidence: "High", echoOrTranslation: "Independent" };
}

function tagSignals(signals: Signal[]): DependencyTaggedSignal[] {
  const tagged: DependencyTaggedSignal[] = signals.map((s) => ({
    signal: s,
    rootEvidenceId: s.rootEvidenceId ?? s.id,
    signalLineage: s.signalLineage ?? s.id,
    sourceCluster: inferSourceCluster(s),
    dependencyRole: (s.dependencyRole as DependencyRole) ?? "Independent parallel evidence",
    lineageConfidence: (s.lineageConfidence as LineageConfidence) ?? "Medium",
    novelInformationFlag: (s.novelInformationFlag as NovelInformationFlag) ?? "Yes",
    echoVsTranslation: (s.echoVsTranslation as EchoVsTranslation) ?? "Independent",
  }));

  for (let i = 0; i < tagged.length; i++) {
    for (let j = i + 1; j < tagged.length; j++) {
      const rel = inferLineageRelationship(tagged[i].signal, tagged[j].signal);
      if (rel.isRelated) {
        const rootLR = Math.abs((tagged[i].signal.likelihoodRatio ?? 1) - 1);
        const candLR = Math.abs((tagged[j].signal.likelihoodRatio ?? 1) - 1);

        let rootIdx: number, descIdx: number;
        if (rootLR >= candLR) {
          rootIdx = i;
          descIdx = j;
        } else {
          rootIdx = j;
          descIdx = i;
        }

        if (tagged[rootIdx].dependencyRole === "Independent parallel evidence") {
          tagged[rootIdx].dependencyRole = "Root";
        }
        tagged[descIdx].dependencyRole = rel.role;
        tagged[descIdx].rootEvidenceId = tagged[rootIdx].rootEvidenceId;
        tagged[descIdx].lineageConfidence = rel.confidence;

        const correctEchoType = classifyEchoOrTranslation(
          tagged[rootIdx].sourceCluster,
          tagged[descIdx].sourceCluster,
          tagged[descIdx].signal.signalDescription ?? ""
        );
        tagged[descIdx].echoVsTranslation = correctEchoType;
        tagged[descIdx].novelInformationFlag = correctEchoType === "Echo" ? "No" : "Partial";
      }
    }
  }

  return tagged;
}

function buildClusters(tagged: DependencyTaggedSignal[]): { clusters: EvidenceCluster[]; independents: DependencyTaggedSignal[] } {
  const clusterMap = new Map<string, DependencyTaggedSignal[]>();

  for (const t of tagged) {
    const key = t.rootEvidenceId;
    if (!clusterMap.has(key)) clusterMap.set(key, []);
    clusterMap.get(key)!.push(t);
  }

  const clusters: EvidenceCluster[] = [];
  const independents: DependencyTaggedSignal[] = [];

  for (const [rootId, members] of clusterMap) {
    if (members.length === 1 && members[0].dependencyRole === "Independent parallel evidence") {
      independents.push(members[0]);
      continue;
    }

    const root = members.find((m) => m.dependencyRole === "Root") ?? members[0];
    const descendants = members.filter((m) => m !== root);

    let echoCount = 0;
    let translationCount = 0;
    let independentCount = 0;
    for (const m of members) {
      if (m.echoVsTranslation === "Echo") echoCount++;
      else if (m.echoVsTranslation === "Translation") translationCount++;
      else independentCount++;
    }

    const compressedCount = 1 + descendants.filter(
      (d) => d.novelInformationFlag !== "No"
    ).length;

    clusters.push({
      rootEvidenceId: rootId,
      rootSignal: root,
      descendants,
      clusterSignalCount: members.length,
      compressedSignalCount: compressedCount,
      echoCount,
      translationCount,
      independentCount,
    });
  }

  return { clusters, independents };
}

const ECHO_COMPRESSION = 0.05;
const TRANSLATION_COMPRESSION = 0.35;
const PARTIAL_NOVELTY_COMPRESSION = 0.5;

function compressClusterSignals(clusters: EvidenceCluster[], independents: DependencyTaggedSignal[]): CompressedSignal[] {
  const compressed: CompressedSignal[] = [];

  for (const cluster of clusters) {
    compressed.push({
      originalSignalId: cluster.rootSignal.signal.id,
      compressedLikelihoodRatio: cluster.rootSignal.signal.likelihoodRatio ?? 1,
      rawLikelihoodRatio: cluster.rootSignal.signal.likelihoodRatio ?? 1,
      compressionFactor: 1.0,
      isRoot: true,
      clusterId: cluster.rootEvidenceId,
    });

    for (const desc of cluster.descendants) {
      const rawLR = desc.signal.likelihoodRatio ?? 1;
      const centered = rawLR - 1;

      let factor: number;
      if (desc.echoVsTranslation === "Echo") {
        factor = ECHO_COMPRESSION;
      } else if (desc.echoVsTranslation === "Translation") {
        factor = desc.novelInformationFlag === "Yes" ? TRANSLATION_COMPRESSION * 1.5
               : desc.novelInformationFlag === "Partial" ? TRANSLATION_COMPRESSION
               : ECHO_COMPRESSION;
      } else {
        factor = desc.novelInformationFlag === "Yes" ? 1.0
               : desc.novelInformationFlag === "Partial" ? PARTIAL_NOVELTY_COMPRESSION
               : ECHO_COMPRESSION;
      }

      const compressedLR = 1 + centered * factor;
      compressed.push({
        originalSignalId: desc.signal.id,
        compressedLikelihoodRatio: Number(compressedLR.toFixed(4)),
        rawLikelihoodRatio: rawLR,
        compressionFactor: Number(factor.toFixed(4)),
        isRoot: false,
        clusterId: cluster.rootEvidenceId,
      });
    }
  }

  for (const ind of independents) {
    const lr = ind.signal.likelihoodRatio ?? 1;
    compressed.push({
      originalSignalId: ind.signal.id,
      compressedLikelihoodRatio: lr,
      rawLikelihoodRatio: lr,
      compressionFactor: 1.0,
      isRoot: false,
      clusterId: ind.rootEvidenceId,
    });
  }

  return compressed;
}

function computeMetrics(
  clusters: EvidenceCluster[],
  independents: DependencyTaggedSignal[],
  compressed: CompressedSignal[],
  allTagged: DependencyTaggedSignal[]
): DependencyMetrics {
  const totalSignals = allTagged.length;
  const clusterCount = clusters.length;
  const independentFamilies = independents.length;

  const totalEchos = allTagged.filter((t) => t.echoVsTranslation === "Echo").length;
  const echoDensity = totalSignals > 0 ? totalEchos / totalSignals : 0;

  const evidenceDiversityScore = totalSignals > 0
    ? Math.min(1, (independentFamilies + clusterCount) / totalSignals)
    : 0;

  const totalCompressedImpact = compressed.reduce(
    (sum, c) => sum + Math.abs(c.compressedLikelihoodRatio - 1), 0
  );
  const maxClusterImpact = clusters.reduce((max, cl) => {
    const clusterImpact = compressed
      .filter((c) => c.clusterId === cl.rootEvidenceId)
      .reduce((s, c) => s + Math.abs(c.compressedLikelihoodRatio - 1), 0);
    return Math.max(max, clusterImpact);
  }, 0);
  const posteriorFragilityScore = totalCompressedImpact > 0
    ? maxClusterImpact / totalCompressedImpact
    : 0;

  const novelSignals = allTagged.filter((t) => t.novelInformationFlag === "Yes").length;
  const noveltyScore = totalSignals > 0 ? novelSignals / totalSignals : 1;

  const concentrationPenalty = Math.max(0, posteriorFragilityScore - 0.5) * 2;

  return {
    totalSignalCount: totalSignals,
    clusterCount,
    independentEvidenceFamilies: independentFamilies + clusterCount,
    noveltyScore: Number(noveltyScore.toFixed(3)),
    echoDensity: Number(echoDensity.toFixed(3)),
    evidenceDiversityScore: Number(evidenceDiversityScore.toFixed(3)),
    posteriorFragilityScore: Number(posteriorFragilityScore.toFixed(3)),
    concentrationPenalty: Number(concentrationPenalty.toFixed(3)),
  };
}

export function computeConfidenceCeiling(metrics: DependencyMetrics): ConfidenceCeiling {
  const families = metrics.independentEvidenceFamilies;
  const diversity = metrics.evidenceDiversityScore;
  const fragility = metrics.posteriorFragilityScore;

  if (families <= 1 && metrics.totalSignalCount > 0) {
    return {
      maxAllowedProbability: 0.65,
      reason: "All evidence traces to a single source family. Probability is capped until independent evidence is added.",
      diversityLevel: "single",
    };
  }

  if (diversity < 0.2 || fragility > 0.7) {
    return {
      maxAllowedProbability: 0.70,
      reason: "Evidence diversity is very low or probability depends heavily on one lineage. Ceiling applied.",
      diversityLevel: "low",
    };
  }

  if (diversity < 0.4 || fragility > 0.5) {
    return {
      maxAllowedProbability: 0.80,
      reason: "Moderate evidence diversity. Probability can rise further with more independent evidence families.",
      diversityLevel: "moderate",
    };
  }

  return {
    maxAllowedProbability: 1.0,
    reason: "Evidence comes from multiple independent families. No ceiling applied.",
    diversityLevel: "high",
  };
}

function generateWarnings(
  clusters: EvidenceCluster[],
  metrics: DependencyMetrics,
  allTagged: DependencyTaggedSignal[]
): ConcentrationWarning[] {
  const warnings: ConcentrationWarning[] = [];

  for (const cl of clusters) {
    if (cl.clusterSignalCount > 3) {
      warnings.push({
        type: "cluster_size",
        severity: cl.clusterSignalCount > 5 ? "high" : "medium",
        message: `${cl.clusterSignalCount} signals share the same root evidence (${cl.rootSignal.signal.signalDescription?.slice(0, 60)}…). Only truly novel information from this cluster affects the forecast.`,
        clusterId: cl.rootEvidenceId,
      });
    }
  }

  if (metrics.posteriorFragilityScore > 0.5) {
    const dominant = clusters.reduce((max, cl) => cl.clusterSignalCount > (max?.clusterSignalCount ?? 0) ? cl : max, clusters[0]);
    warnings.push({
      type: "posterior_concentration",
      severity: metrics.posteriorFragilityScore > 0.7 ? "high" : "medium",
      message: `Over ${Math.round(metrics.posteriorFragilityScore * 100)}% of probability movement comes from one evidence lineage. The forecast may be overstated due to correlated signals.`,
      clusterId: dominant?.rootEvidenceId,
    });
  }

  const totalRoots = allTagged.filter((t) => t.dependencyRole === "Root").length;
  const totalDescendants = allTagged.filter(
    (t) => t.dependencyRole === "Direct derivative" || t.dependencyRole === "Second-order derivative"
  ).length;
  if (totalDescendants > totalRoots * 2 && totalDescendants > 3) {
    warnings.push({
      type: "descendant_overload",
      severity: "medium",
      message: `Derivative signals (${totalDescendants}) significantly outnumber root evidence (${totalRoots}). The evidence base may appear broader than it actually is.`,
    });
  }

  if (metrics.evidenceDiversityScore < 0.3) {
    warnings.push({
      type: "low_diversity",
      severity: "medium",
      message: `Evidence comes from few source types. The forecast would be stronger with signals from more diverse evidence families.`,
    });
  }

  if (metrics.echoDensity > 0.5 && allTagged.length > 3) {
    warnings.push({
      type: "correlated_stacking",
      severity: "high",
      message: `Most active signals are echoes of upstream evidence. The probability may be inflated by restated information rather than independent reasoning.`,
    });
  }

  return warnings;
}

export function runDependencyAnalysis(signals: Signal[]): DependencyAnalysisResult {
  if (signals.length === 0) {
    return {
      clusters: [],
      independentSignals: [],
      compressedSignals: [],
      metrics: {
        totalSignalCount: 0,
        clusterCount: 0,
        independentEvidenceFamilies: 0,
        noveltyScore: 1,
        echoDensity: 0,
        evidenceDiversityScore: 0,
        posteriorFragilityScore: 0,
        concentrationPenalty: 0,
      },
      warnings: [],
      confidenceCeiling: { maxAllowedProbability: 1.0, reason: "No signals present.", diversityLevel: "high" },
    };
  }

  const tagged = tagSignals(signals);
  const { clusters, independents } = buildClusters(tagged);
  const compressed = compressClusterSignals(clusters, independents);
  const metrics = computeMetrics(clusters, independents, compressed, tagged);
  const warnings = generateWarnings(clusters, metrics, tagged);
  const confidenceCeiling = computeConfidenceCeiling(metrics);

  return {
    clusters,
    independentSignals: independents,
    compressedSignals: compressed,
    metrics,
    warnings,
    confidenceCeiling,
  };
}

export function applyCompressionToSignals(
  signals: Signal[],
  analysis: DependencyAnalysisResult
): Signal[] {
  const compressionMap = new Map<string, CompressedSignal>();
  for (const cs of analysis.compressedSignals) {
    compressionMap.set(cs.originalSignalId, cs);
  }

  return signals.map((s) => {
    const comp = compressionMap.get(s.id);
    if (comp && comp.compressionFactor < 1.0) {
      return {
        ...s,
        likelihoodRatio: comp.compressedLikelihoodRatio,
      };
    }
    return s;
  });
}

export function computeNaiveVsCompressed(
  signals: Signal[],
  analysis: DependencyAnalysisResult,
  priorProbability: number
): NaiveVsCompressedComparison {
  const prior = Math.max(0.01, Math.min(0.99, priorProbability));
  const priorOdds = prior / (1 - prior);

  let naiveLrProduct = 1;
  let compressedLrProduct = 1;

  for (const cs of analysis.compressedSignals) {
    naiveLrProduct *= cs.rawLikelihoodRatio;
    compressedLrProduct *= cs.compressedLikelihoodRatio;
  }

  const naiveOdds = priorOdds * naiveLrProduct;
  const compressedOdds = priorOdds * compressedLrProduct;

  const naivePosterior = Number(Math.min(0.99, naiveOdds / (1 + naiveOdds)).toFixed(4));
  const compressedPosterior = Number(Math.min(0.99, compressedOdds / (1 + compressedOdds)).toFixed(4));

  return {
    naiveLrProduct: Number(naiveLrProduct.toFixed(4)),
    compressedLrProduct: Number(compressedLrProduct.toFixed(4)),
    naivePosterior,
    compressedPosterior,
    delta: Number((naivePosterior - compressedPosterior).toFixed(4)),
    inflationPrevented: Number(Math.max(0, naivePosterior - compressedPosterior).toFixed(4)),
  };
}
