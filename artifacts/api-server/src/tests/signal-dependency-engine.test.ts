import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runDependencyAnalysis,
  computeNaiveVsCompressed,
  computeConfidenceCeiling,
  classifyEchoOrTranslation,
  inferSourceCluster,
  computeTextSimilarity,
  type SourceCluster,
} from "../lib/signal-dependency-engine.js";

function makeSignal(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? `SIG-${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    signalId: overrides.signalId ?? id,
    caseId: overrides.caseId ?? "CASE-001",
    programId: overrides.programId ?? "PROG-001",
    signalDescription: overrides.signalDescription ?? "Generic signal",
    signalType: overrides.signalType ?? "PHASE_III_CLINICAL",
    likelihoodRatio: overrides.likelihoodRatio ?? 1.5,
    status: overrides.status ?? "active",
    rootEvidenceId: overrides.rootEvidenceId ?? null,
    correlationGroup: overrides.correlationGroup ?? null,
    sourceCluster: overrides.sourceCluster ?? null,
    signalLineage: overrides.signalLineage ?? null,
    dependencyRole: overrides.dependencyRole ?? null,
    lineageConfidence: overrides.lineageConfidence ?? null,
    novelInformationFlag: overrides.novelInformationFlag ?? null,
    echoVsTranslation: overrides.echoVsTranslation ?? null,
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? null,
    agentSource: overrides.agentSource ?? null,
    direction: overrides.direction ?? "positive",
    strength: overrides.strength ?? "moderate",
    timeHorizon: overrides.timeHorizon ?? "12m",
    evidenceGrade: overrides.evidenceGrade ?? "B",
    confidence: overrides.confidence ?? 0.7,
    actorCategory: overrides.actorCategory ?? null,
  } as any;
}

describe("Signal Dependency Engine — Gold Set", () => {

  describe("Scenario 1: Single-trial cascade (KEYNOTE-522 → 4 derivatives)", () => {
    const rootId = "KEYNOTE-522-ROOT";

    const signals = [
      makeSignal({
        id: "sig-root-k522",
        signalDescription: "KEYNOTE-522 Phase III trial shows pCR benefit with pembrolizumab + chemo in early TNBC, hazard ratio 0.63",
        signalType: "PHASE_III_CLINICAL",
        likelihoodRatio: 2.8,
        rootEvidenceId: rootId,
        sourceCluster: "Clinical Evidence",
      }),
      makeSignal({
        id: "sig-kol-k522",
        signalDescription: "KEYNOTE-522 Phase III trial results endorsed by leading oncology KOLs at ASCO, pCR benefit confirmed",
        signalType: "KOL_ENDORSEMENT",
        likelihoodRatio: 1.9,
        rootEvidenceId: rootId,
        sourceCluster: "KOL / Expert Interpretation",
      }),
      makeSignal({
        id: "sig-guide-k522",
        signalDescription: "NCCN guidelines updated to include pembrolizumab based on KEYNOTE-522 Phase III clinical data",
        signalType: "GUIDELINE_INCLUSION",
        likelihoodRatio: 2.1,
        rootEvidenceId: rootId,
        sourceCluster: "Publication / Guideline",
      }),
      makeSignal({
        id: "sig-payer-k522",
        signalDescription: "Payer formulary coverage expanded for pembrolizumab TNBC based on KEYNOTE-522 pCR data, step therapy waived, prior auth streamlined",
        signalType: "PAYER_ACCESS",
        likelihoodRatio: 1.6,
        rootEvidenceId: rootId,
        sourceCluster: "Access / Policy",
      }),
      makeSignal({
        id: "sig-market-k522",
        signalDescription: "Market research shows oncologists switching treatment protocol after KEYNOTE-522 results, adoption uptake accelerating",
        signalType: "MARKET_ADOPTION",
        likelihoodRatio: 1.4,
        rootEvidenceId: rootId,
        sourceCluster: "Market Research",
      }),
    ];

    it("should produce exactly 1 cluster with the root and 4 descendants", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.clusters.length, 1, "Should be 1 cluster");
      assert.equal(result.independentSignals.length, 0, "No independents");
      const cl = result.clusters[0];
      assert.equal(cl.clusterSignalCount, 5);
      assert.equal(cl.descendants.length, 4);
    });

    it("should classify KOL and guideline derivatives as Echo (not Translation)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const kolDesc = cl.descendants.find(d => d.signal.id === "sig-kol-k522");
      const guideDesc = cl.descendants.find(d => d.signal.id === "sig-guide-k522");
      assert.ok(kolDesc, "KOL descendant should exist");
      assert.ok(guideDesc, "Guideline descendant should exist");
      assert.equal(kolDesc!.echoVsTranslation, "Echo", "KOL interpretation of same trial = Echo");
      assert.equal(guideDesc!.echoVsTranslation, "Echo", "Guideline inclusion from same trial = Echo");
    });

    it("should classify payer access derivative as Translation (access keywords)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const payerDesc = cl.descendants.find(d => d.signal.id === "sig-payer-k522");
      assert.ok(payerDesc, "Payer descendant should exist");
      assert.equal(payerDesc!.echoVsTranslation, "Translation", "Payer access with formulary/step therapy = Translation");
    });

    it("should classify market adoption derivative as Translation (adoption/switching keywords)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const marketDesc = cl.descendants.find(d => d.signal.id === "sig-market-k522");
      assert.ok(marketDesc, "Market descendant should exist");
      assert.equal(marketDesc!.echoVsTranslation, "Translation", "Market adoption with switching/uptake = Translation");
    });

    it("should heavily compress echoes (≈0.05) and moderately compress translations (≈0.35)", () => {
      const result = runDependencyAnalysis(signals);
      const kolComp = result.compressedSignals.find(c => c.originalSignalId === "sig-kol-k522");
      const payerComp = result.compressedSignals.find(c => c.originalSignalId === "sig-payer-k522");
      assert.ok(kolComp);
      assert.ok(payerComp);
      assert.equal(kolComp!.compressionFactor, 0.05, "Echo compression = 0.05");
      assert.equal(payerComp!.compressionFactor, 0.35, "Translation compression = 0.35");
    });

    it("root signal should have compressionFactor = 1.0", () => {
      const result = runDependencyAnalysis(signals);
      const rootComp = result.compressedSignals.find(c => c.originalSignalId === "sig-root-k522");
      assert.ok(rootComp);
      assert.equal(rootComp!.compressionFactor, 1.0);
      assert.equal(rootComp!.isRoot, true);
    });

    it("naive vs compressed should show significant inflation prevented", () => {
      const result = runDependencyAnalysis(signals);
      const comparison = computeNaiveVsCompressed(signals, result, 0.3);
      assert.ok(comparison.naivePosterior > comparison.compressedPosterior, "Naive should be higher");
      assert.ok(comparison.inflationPrevented > 0.05, `Should prevent meaningful inflation, got ${comparison.inflationPrevented}`);
      assert.ok(comparison.delta > 0, "Delta should be positive");
    });

    it("confidence ceiling should apply (single family)", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.confidenceCeiling.diversityLevel, "single", "All from one root = single family");
      assert.equal(result.confidenceCeiling.maxAllowedProbability, 0.65, "Single family cap = 0.65");
    });

    it("should produce a cluster_size warning for 5 signals", () => {
      const result = runDependencyAnalysis(signals);
      const sizeWarning = result.warnings.find(w => w.type === "cluster_size");
      assert.ok(sizeWarning, "Should warn about large cluster");
    });
  });

  describe("Scenario 2: Two independent evidence families (truly independent)", () => {
    const signals = [
      makeSignal({
        id: "sig-trial-a",
        signalDescription: "TOPAZ-1 Phase III shows durvalumab + gemcitabine improves OS in biliary tract cancer, HR 0.80",
        signalType: "PHASE_III_CLINICAL",
        likelihoodRatio: 2.2,
        rootEvidenceId: "TOPAZ-1-ROOT",
        sourceCluster: "Clinical Evidence",
      }),
      makeSignal({
        id: "sig-trial-a-kol",
        signalDescription: "GI oncology KOLs at ESMO endorse durvalumab combination for biliary tract cancer based on TOPAZ-1 data",
        signalType: "KOL_ENDORSEMENT",
        likelihoodRatio: 1.6,
        rootEvidenceId: "TOPAZ-1-ROOT",
        sourceCluster: "KOL / Expert Interpretation",
      }),
      makeSignal({
        id: "sig-rwe-b",
        signalDescription: "Real-world evidence from insurance claims shows rapid uptake of enfortumab vedotin in bladder cancer, adoption faster than historical comparators",
        signalType: "MARKET_ADOPTION",
        likelihoodRatio: 1.8,
        rootEvidenceId: "RWE-BLADDER-ROOT",
        sourceCluster: "Real-World Evidence",
      }),
      makeSignal({
        id: "sig-field-b",
        signalDescription: "Field sales reps report community oncologists prescribing enfortumab vedotin earlier in treatment sequencing for bladder cancer, strong adoption trend",
        signalType: "MARKET_ADOPTION",
        likelihoodRatio: 1.5,
        rootEvidenceId: "RWE-BLADDER-ROOT",
        sourceCluster: "Field Feedback",
      }),
    ];

    it("should produce 2 clusters", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.clusters.length, 2, "Two independent lineages");
      assert.equal(result.independentSignals.length, 0);
    });

    it("should have higher diversity than single-trial cascade", () => {
      const result = runDependencyAnalysis(signals);
      assert.ok(result.metrics.independentEvidenceFamilies >= 2, "At least 2 independent families");
    });

    it("confidence ceiling should not be 'single'", () => {
      const result = runDependencyAnalysis(signals);
      assert.notEqual(result.confidenceCeiling.diversityLevel, "single");
    });

    it("field feedback about prescribing/sequencing should be Translation (not Echo)", () => {
      const result = runDependencyAnalysis(signals);
      const rwCluster = result.clusters.find(c => c.rootEvidenceId === "RWE-BLADDER-ROOT");
      assert.ok(rwCluster, "RWE cluster should exist");
      if (rwCluster!.descendants.length > 0) {
        const fieldDesc = rwCluster!.descendants.find(d => d.signal.id === "sig-field-b");
        if (fieldDesc) {
          assert.equal(fieldDesc.echoVsTranslation, "Translation", "Field feedback about prescribing/sequencing = Translation");
        }
      }
    });
  });

  describe("Scenario 3: False diversity (5 signals, all same root disguised)", () => {
    const rootId = "COMBI-DT-ROOT";

    const signals = [
      makeSignal({
        id: "sig-trial-combi",
        signalDescription: "COMBI-DT Phase III trial demonstrates dabrafenib plus trametinib combination improves PFS in BRAF V600E melanoma",
        signalType: "PHASE_III_CLINICAL",
        likelihoodRatio: 2.5,
        rootEvidenceId: rootId,
        sourceCluster: "Clinical Evidence",
      }),
      makeSignal({
        id: "sig-kol-combi",
        signalDescription: "COMBI-DT Phase III data presented by melanoma KOLs shows dabrafenib trametinib PFS improvement substantial",
        signalType: "KOL_ENDORSEMENT",
        likelihoodRatio: 1.7,
        rootEvidenceId: rootId,
        sourceCluster: "KOL / Expert Interpretation",
      }),
      makeSignal({
        id: "sig-guide-combi",
        signalDescription: "NCCN melanoma guideline updated with dabrafenib trametinib combination following COMBI-DT Phase III trial results",
        signalType: "GUIDELINE_INCLUSION",
        likelihoodRatio: 2.0,
        rootEvidenceId: rootId,
        sourceCluster: "Publication / Guideline",
      }),
      makeSignal({
        id: "sig-ci-combi",
        signalDescription: "Competitive intelligence report notes dabrafenib trametinib combination from COMBI-DT gaining share in BRAF melanoma market",
        signalType: "COMPETITOR_COUNTERMOVE",
        likelihoodRatio: 1.4,
        rootEvidenceId: rootId,
        sourceCluster: "Competitive Intelligence",
      }),
      makeSignal({
        id: "sig-pub-combi",
        signalDescription: "New England Journal publication of COMBI-DT Phase III trial confirms dabrafenib trametinib PFS improvement in melanoma",
        signalType: "GUIDELINE_INCLUSION",
        likelihoodRatio: 1.8,
        rootEvidenceId: rootId,
        sourceCluster: "Publication / Guideline",
      }),
    ];

    it("should detect all 5 as one cluster (false diversity)", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.clusters.length, 1, "All from same root = 1 cluster");
      assert.equal(result.independentSignals.length, 0);
    });

    it("competitive intelligence derivative should be Echo (not Translation)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const ciDesc = cl.descendants.find(d => d.signal.id === "sig-ci-combi");
      assert.ok(ciDesc);
      assert.equal(ciDesc!.echoVsTranslation, "Echo", "CI report restating same trial = Echo, not Translation");
    });

    it("should have high echo density", () => {
      const result = runDependencyAnalysis(signals);
      assert.ok(result.metrics.echoDensity >= 0.4, `Echo density should be high, got ${result.metrics.echoDensity}`);
    });

    it("naive posterior should be much higher than compressed", () => {
      const result = runDependencyAnalysis(signals);
      const comp = computeNaiveVsCompressed(signals, result, 0.3);
      assert.ok(comp.inflationPrevented > 0.1, `Should prevent >10pp inflation, got ${comp.inflationPrevented}`);
    });

    it("confidence ceiling should be 'single' (one family)", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.confidenceCeiling.diversityLevel, "single");
      assert.equal(result.confidenceCeiling.maxAllowedProbability, 0.65);
    });

    it("should generate correlated_stacking warning", () => {
      const result = runDependencyAnalysis(signals);
      const stackWarning = result.warnings.find(w => w.type === "correlated_stacking");
      assert.ok(stackWarning, "Should warn about correlated stacking when echo density > 0.5");
    });
  });

  describe("Scenario 4: Mixed positive root + negative translation", () => {
    const signals = [
      makeSignal({
        id: "sig-pos-root",
        signalDescription: "DESTINY-Breast04 Phase III shows trastuzumab deruxtecan OS benefit in HER2-low breast cancer, hazard ratio 0.64",
        signalType: "PHASE_III_CLINICAL",
        likelihoodRatio: 3.0,
        rootEvidenceId: "DESTINY-B04-ROOT",
        sourceCluster: "Clinical Evidence",
      }),
      makeSignal({
        id: "sig-neg-access",
        signalDescription: "Payer access barriers restrict trastuzumab deruxtecan coverage requiring prior authorization and step therapy through older HER2 agents, formulary tier 3 with high copay burden",
        signalType: "PAYER_ACCESS",
        likelihoodRatio: 0.7,
        rootEvidenceId: "DESTINY-B04-ROOT",
        sourceCluster: "Access / Policy",
      }),
      makeSignal({
        id: "sig-neg-workflow",
        signalDescription: "Operational workflow challenges with trastuzumab deruxtecan administration require specialized infusion center capacity and monitoring, creating friction and delay in adoption timeline",
        signalType: "OPERATIONAL_FRICTION",
        likelihoodRatio: 0.8,
        rootEvidenceId: "DESTINY-B04-ROOT",
        sourceCluster: "Operational / Workflow",
      }),
      makeSignal({
        id: "sig-independent-comp",
        signalDescription: "Competitor launches biosimilar trastuzumab at 40% discount targeting community oncology segment",
        signalType: "COMPETITOR_COUNTERMOVE",
        likelihoodRatio: 0.6,
        sourceCluster: "Competitive Intelligence",
      }),
    ];

    it("should create 1 cluster + 1 independent signal", () => {
      const result = runDependencyAnalysis(signals);
      assert.equal(result.clusters.length, 1, "One cluster from DESTINY root");
      assert.equal(result.independentSignals.length, 1, "Competitor signal is independent");
      assert.equal(result.independentSignals[0].signal.id, "sig-independent-comp");
    });

    it("negative access derivative should be Translation (access + prior auth keywords)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const accessDesc = cl.descendants.find(d => d.signal.id === "sig-neg-access");
      assert.ok(accessDesc);
      assert.equal(accessDesc!.echoVsTranslation, "Translation", "Access signal with prior auth/formulary/copay = Translation");
    });

    it("negative workflow derivative should be Translation (workflow/friction keywords)", () => {
      const result = runDependencyAnalysis(signals);
      const cl = result.clusters[0];
      const workflowDesc = cl.descendants.find(d => d.signal.id === "sig-neg-workflow");
      assert.ok(workflowDesc);
      assert.equal(workflowDesc!.echoVsTranslation, "Translation", "Workflow signal with friction/adoption/delay = Translation");
    });

    it("compressed LR for translations should preserve partial impact", () => {
      const result = runDependencyAnalysis(signals);
      const accessComp = result.compressedSignals.find(c => c.originalSignalId === "sig-neg-access");
      assert.ok(accessComp);
      assert.ok(accessComp!.compressionFactor > 0.05, "Translation gets more weight than echo");
      assert.ok(accessComp!.compressionFactor <= 0.525, "Translation factor bounded");
      assert.ok(accessComp!.compressedLikelihoodRatio < 1.0, "Negative LR should stay below 1 after compression");
    });

    it("independent evidence families should be >= 2", () => {
      const result = runDependencyAnalysis(signals);
      assert.ok(result.metrics.independentEvidenceFamilies >= 2, `Should have >= 2 families, got ${result.metrics.independentEvidenceFamilies}`);
    });
  });

  describe("Echo vs Translation classification rules", () => {
    it("same cluster always returns Echo", () => {
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Clinical Evidence", "anything"), "Echo");
      assert.equal(classifyEchoOrTranslation("Market Research", "Market Research", "anything"), "Echo");
    });

    it("qualifying cluster WITH matching keywords returns Translation", () => {
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Field Feedback", "prescribing patterns shifted"), "Translation");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Access / Policy", "formulary tier changed"), "Translation");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Operational / Workflow", "workflow friction increased"), "Translation");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Market Research", "adoption segment analysis"), "Translation");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Real-World Evidence", "uptake data shows lag"), "Translation");
    });

    it("qualifying cluster WITHOUT matching keywords returns Echo", () => {
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Field Feedback", "trial results confirmed"), "Echo");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Market Research", "data looks positive"), "Echo");
    });

    it("non-qualifying cluster always returns Echo", () => {
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "KOL / Expert Interpretation", "prescribing adoption changed"), "Echo");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Publication / Guideline", "formulary updated"), "Echo");
      assert.equal(classifyEchoOrTranslation("Clinical Evidence", "Competitive Intelligence", "uptake shifting"), "Echo");
    });
  });

  describe("Source cluster inference", () => {
    it("should infer cluster from signalType when sourceCluster is missing", () => {
      const s = makeSignal({ sourceCluster: null, signalType: "PHASE_III_CLINICAL" });
      assert.equal(inferSourceCluster(s), "Clinical Evidence");
    });

    it("should use explicit sourceCluster when provided", () => {
      const s = makeSignal({ sourceCluster: "Real-World Evidence", signalType: "PHASE_III_CLINICAL" });
      assert.equal(inferSourceCluster(s), "Real-World Evidence");
    });

    it("should fall back to Other for unknown types", () => {
      const s = makeSignal({ sourceCluster: null, signalType: "UNKNOWN_TYPE" });
      assert.equal(inferSourceCluster(s), "Other");
    });
  });

  describe("Text similarity", () => {
    it("identical strings = 1.0", () => {
      assert.equal(computeTextSimilarity("Phase III trial results", "Phase III trial results"), 1.0);
    });

    it("completely different strings ≈ 0", () => {
      const sim = computeTextSimilarity("Phase III clinical trial oncology", "Banking regulatory compliance framework");
      assert.ok(sim < 0.1, `Should be near 0, got ${sim}`);
    });

    it("highly overlapping strings > 0.7", () => {
      const sim = computeTextSimilarity(
        "Phase III trial shows PFS benefit with pembrolizumab combination",
        "Phase III trial demonstrates PFS benefit with pembrolizumab therapy"
      );
      assert.ok(sim > 0.5, `Should be high similarity, got ${sim}`);
    });
  });

  describe("Confidence ceiling computation", () => {
    it("single family → 0.65 cap", () => {
      const ceiling = computeConfidenceCeiling({
        totalSignalCount: 5,
        clusterCount: 1,
        independentEvidenceFamilies: 1,
        noveltyScore: 0.2,
        echoDensity: 0.8,
        evidenceDiversityScore: 0.1,
        posteriorFragilityScore: 0.9,
        concentrationPenalty: 0.8,
      });
      assert.equal(ceiling.maxAllowedProbability, 0.65);
      assert.equal(ceiling.diversityLevel, "single");
    });

    it("low diversity → 0.70 cap", () => {
      const ceiling = computeConfidenceCeiling({
        totalSignalCount: 6,
        clusterCount: 2,
        independentEvidenceFamilies: 2,
        noveltyScore: 0.3,
        echoDensity: 0.5,
        evidenceDiversityScore: 0.15,
        posteriorFragilityScore: 0.6,
        concentrationPenalty: 0.2,
      });
      assert.equal(ceiling.maxAllowedProbability, 0.70);
      assert.equal(ceiling.diversityLevel, "low");
    });

    it("moderate diversity → 0.80 cap", () => {
      const ceiling = computeConfidenceCeiling({
        totalSignalCount: 8,
        clusterCount: 3,
        independentEvidenceFamilies: 4,
        noveltyScore: 0.5,
        echoDensity: 0.3,
        evidenceDiversityScore: 0.35,
        posteriorFragilityScore: 0.4,
        concentrationPenalty: 0,
      });
      assert.equal(ceiling.maxAllowedProbability, 0.80);
      assert.equal(ceiling.diversityLevel, "moderate");
    });

    it("high diversity → no cap (1.0)", () => {
      const ceiling = computeConfidenceCeiling({
        totalSignalCount: 10,
        clusterCount: 4,
        independentEvidenceFamilies: 6,
        noveltyScore: 0.8,
        echoDensity: 0.1,
        evidenceDiversityScore: 0.6,
        posteriorFragilityScore: 0.2,
        concentrationPenalty: 0,
      });
      assert.equal(ceiling.maxAllowedProbability, 1.0);
      assert.equal(ceiling.diversityLevel, "high");
    });

    it("zero signals → no cap", () => {
      const result = runDependencyAnalysis([]);
      assert.equal(result.confidenceCeiling.maxAllowedProbability, 1.0);
    });
  });

  describe("Naive vs Compressed comparison", () => {
    it("with no compression, naive equals compressed", () => {
      const sig = makeSignal({ likelihoodRatio: 2.0 });
      const result = runDependencyAnalysis([sig]);
      const comp = computeNaiveVsCompressed([sig], result, 0.3);
      assert.equal(comp.naivePosterior, comp.compressedPosterior);
      assert.equal(comp.inflationPrevented, 0);
    });

    it("prior probability is clamped to [0.01, 0.99]", () => {
      const sig = makeSignal({ likelihoodRatio: 2.0 });
      const result = runDependencyAnalysis([sig]);
      const comp0 = computeNaiveVsCompressed([sig], result, 0.0);
      const comp1 = computeNaiveVsCompressed([sig], result, 1.0);
      assert.ok(comp0.naivePosterior > 0);
      assert.ok(comp1.naivePosterior < 1);
    });
  });

  describe("Edge cases", () => {
    it("empty signal list returns valid empty result", () => {
      const result = runDependencyAnalysis([]);
      assert.equal(result.clusters.length, 0);
      assert.equal(result.independentSignals.length, 0);
      assert.equal(result.compressedSignals.length, 0);
      assert.equal(result.metrics.totalSignalCount, 0);
      assert.equal(result.warnings.length, 0);
    });

    it("single signal returns as independent", () => {
      const sig = makeSignal({ likelihoodRatio: 2.0 });
      const result = runDependencyAnalysis([sig]);
      assert.equal(result.clusters.length, 0);
      assert.equal(result.independentSignals.length, 1);
      assert.equal(result.compressedSignals.length, 1);
      assert.equal(result.compressedSignals[0].compressionFactor, 1.0);
    });

    it("signals with likelihoodRatio = 1 (no impact) still get processed", () => {
      const signals = [
        makeSignal({ id: "s1", likelihoodRatio: 1.0, rootEvidenceId: "R1" }),
        makeSignal({ id: "s2", likelihoodRatio: 1.0, rootEvidenceId: "R1" }),
      ];
      const result = runDependencyAnalysis(signals);
      assert.ok(result.compressedSignals.length > 0);
    });

    it("directional consistency: translation with larger LR than root still classified correctly", () => {
      const signals = [
        makeSignal({
          id: "sig-clinical-weak",
          signalDescription: "Phase III trial shows modest benefit in rare subgroup",
          signalType: "PHASE_III_CLINICAL",
          likelihoodRatio: 1.3,
          rootEvidenceId: "TRIAL-WEAK-ROOT",
          sourceCluster: "Clinical Evidence",
        }),
        makeSignal({
          id: "sig-access-strong",
          signalDescription: "Payer formulary coverage expanded with prior authorization waived and step therapy removed, major access improvement",
          signalType: "PAYER_ACCESS",
          likelihoodRatio: 2.5,
          rootEvidenceId: "TRIAL-WEAK-ROOT",
          sourceCluster: "Access / Policy",
        }),
      ];
      const result = runDependencyAnalysis(signals);
      assert.equal(result.clusters.length, 1, "Both share same root");
      const cl = result.clusters[0];
      assert.equal(cl.rootSignal.signal.id, "sig-access-strong", "Higher LR becomes root");
      assert.equal(cl.descendants.length, 1);
      const desc = cl.descendants[0];
      assert.equal(desc.signal.id, "sig-clinical-weak");
      assert.equal(desc.echoVsTranslation, "Echo", "Clinical Evidence is NOT a qualifying translation cluster");
    });

    it("directional consistency: input order does not change classification", () => {
      const clinicalSig = makeSignal({
        id: "sig-clin",
        signalDescription: "Phase III data confirms efficacy endpoint met",
        signalType: "PHASE_III_CLINICAL",
        likelihoodRatio: 2.0,
        rootEvidenceId: "SHARED-ROOT",
        sourceCluster: "Clinical Evidence",
      });
      const accessSig = makeSignal({
        id: "sig-acc",
        signalDescription: "Formulary tier upgrade and prior authorization removal for access improvement",
        signalType: "PAYER_ACCESS",
        likelihoodRatio: 1.5,
        rootEvidenceId: "SHARED-ROOT",
        sourceCluster: "Access / Policy",
      });

      const resultAB = runDependencyAnalysis([clinicalSig, accessSig]);
      const resultBA = runDependencyAnalysis([accessSig, clinicalSig]);

      const descAB = resultAB.clusters[0].descendants[0];
      const descBA = resultBA.clusters[0].descendants[0];
      assert.equal(descAB.echoVsTranslation, descBA.echoVsTranslation, "Classification should be same regardless of input order");
    });
  });
});

console.log("Running signal dependency engine gold-set tests...");
