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

export interface ConcentrationWarning {
  type: "cluster_size" | "posterior_concentration" | "descendant_overload" | "low_diversity" | "correlated_stacking";
  severity: "high" | "medium" | "low";
  message: string;
  clusterId?: string;
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

function inferSourceCluster(signal: Signal): SourceCluster {
  if (signal.sourceCluster) {
    const match = SOURCE_CLUSTERS.find(
      (c) => c.toLowerCase() === (signal.sourceCluster ?? "").toLowerCase()
    );
    if (match) return match;
  }
  return SIGNAL_TYPE_TO_CLUSTER[signal.signalType ?? ""] ?? "Other";
}

function computeTextSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  const wordsB = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter(Boolean));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) if (wordsB.has(w)) intersection++;
  return intersection / Math.max(wordsA.size, wordsB.size);
}

function inferLineageRelationship(
  signal: Signal,
  candidate: Signal
): { isRelated: boolean; role: DependencyRole; confidence: LineageConfidence; echoOrTranslation: EchoVsTranslation } {
  if (signal.rootEvidenceId && candidate.rootEvidenceId && signal.rootEvidenceId === candidate.rootEvidenceId) {
    return { isRelated: true, role: "Direct derivative", confidence: "High", echoOrTranslation: "Echo" };
  }

  if (signal.correlationGroup && candidate.correlationGroup && signal.correlationGroup === candidate.correlationGroup) {
    return { isRelated: true, role: "Direct derivative", confidence: "High", echoOrTranslation: "Echo" };
  }

  const descA = signal.signalDescription ?? "";
  const descB = candidate.signalDescription ?? "";
  const similarity = computeTextSimilarity(descA, descB);

  if (similarity > 0.7) {
    const sameCluster = inferSourceCluster(signal) === inferSourceCluster(candidate);
    if (sameCluster) {
      return { isRelated: true, role: "Direct derivative", confidence: "Medium", echoOrTranslation: "Echo" };
    } else {
      return { isRelated: true, role: "Direct derivative", confidence: "Medium", echoOrTranslation: "Translation" };
    }
  }

  if (similarity > 0.5) {
    const sameCluster = inferSourceCluster(signal) === inferSourceCluster(candidate);
    return {
      isRelated: true,
      role: "Second-order derivative",
      confidence: "Low",
      echoOrTranslation: sameCluster ? "Echo" : "Translation",
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

        if (rootLR >= candLR) {
          if (tagged[i].dependencyRole === "Independent parallel evidence") {
            tagged[i].dependencyRole = "Root";
          }
          tagged[j].dependencyRole = rel.role;
          tagged[j].rootEvidenceId = tagged[i].rootEvidenceId;
          tagged[j].lineageConfidence = rel.confidence;
          tagged[j].echoVsTranslation = rel.echoOrTranslation;
          tagged[j].novelInformationFlag = rel.echoOrTranslation === "Echo" ? "No" : "Partial";
        } else {
          if (tagged[j].dependencyRole === "Independent parallel evidence") {
            tagged[j].dependencyRole = "Root";
          }
          tagged[i].dependencyRole = rel.role;
          tagged[i].rootEvidenceId = tagged[j].rootEvidenceId;
          tagged[i].lineageConfidence = rel.confidence;
          tagged[i].echoVsTranslation = rel.echoOrTranslation;
          tagged[i].novelInformationFlag = rel.echoOrTranslation === "Echo" ? "No" : "Partial";
        }
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
        compressionFactor: Number(factor.toFixed(4)),
        isRoot: false,
        clusterId: cluster.rootEvidenceId,
      });
    }
  }

  for (const ind of independents) {
    compressed.push({
      originalSignalId: ind.signal.id,
      compressedLikelihoodRatio: ind.signal.likelihoodRatio ?? 1,
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

  const uniqueClusters = new Set(allTagged.map((t) => t.sourceCluster));
  const evidenceDiversityScore = Math.min(1, uniqueClusters.size / Math.max(SOURCE_CLUSTERS.length / 2, 1));

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
    };
  }

  const tagged = tagSignals(signals);
  const { clusters, independents } = buildClusters(tagged);
  const compressed = compressClusterSignals(clusters, independents);
  const metrics = computeMetrics(clusters, independents, compressed, tagged);
  const warnings = generateWarnings(clusters, metrics, tagged);

  return {
    clusters,
    independentSignals: independents,
    compressedSignals: compressed,
    metrics,
    warnings,
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
