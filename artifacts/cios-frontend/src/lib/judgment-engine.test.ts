import { describe, it, expect } from "vitest";
import { generateExecutiveJudgment, type JudgmentInput, type ExecutiveJudgmentResult } from "./judgment-engine";
import { enforceDecomposition } from "./constraint-drivers";

function gate(label: string, status: string, cap: number) {
  return { gate_id: label.toLowerCase().replace(/\s/g, "_"), gate_label: label, description: "", status, reasoning: "", constrains_probability_to: cap };
}

function driver(name: string, direction: "Upward" | "Downward", pts: number, strength: "Low" | "Medium" | "High" = "Medium") {
  return { id: name.toLowerCase().replace(/\s/g, "_"), name, direction, strength, contributionPoints: pts };
}

function run(overrides: Partial<JudgmentInput>): ExecutiveJudgmentResult {
  const base: JudgmentInput = {
    priorPct: 50,
    brandOutlookPct: 60,
    finalForecastPct: 55,
    minGateCapPct: 55,
    executionGapPts: 5,
    gates: [gate("Clinical Evidence", "strong", 0.85), gate("Payer Access", "moderate", 0.60)],
    drivers: [driver("Efficacy Data", "Upward", 8), driver("KOL Support", "Upward", 5), driver("Payer Friction", "Downward", -6)],
    analogContext: null,
    questionText: "Will ARIKAYCE achieve meaningful HCP adoption within 18 months?",
  };
  return generateExecutiveJudgment({ ...base, ...overrides });
}

describe("GROUP 1 — Signal Dominance", () => {
  it("Case 1: Positive-majority, moderate gates → outcome cannot be strongly negative", () => {
    const result = run({
      brandOutlookPct: 65,
      finalForecastPct: 52,
      minGateCapPct: 52,
      executionGapPts: 13,
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Payer Access", "moderate", 0.60), gate("Guideline Support", "moderate", 0.65)],
      drivers: [driver("Efficacy Data", "Upward", 10), driver("KOL Support", "Upward", 7), driver("Real-World Evidence", "Upward", 5), driver("Payer Friction", "Downward", -4)],
    });

    expect(result._audit.integrityPassed).toBe(true);
    expect(result.probability).toBeGreaterThanOrEqual(40);
    expect(result.mostLikelyOutcome).not.toMatch(/unlikely|barriers outweigh/i);
    expect(["Moderate", "High"]).toContain(result.confidence);
  });

  it("Case 2: Negative-majority, moderate gates → outcome should reflect headwinds", () => {
    const result = run({
      brandOutlookPct: 45,
      finalForecastPct: 32,
      minGateCapPct: 32,
      executionGapPts: 13,
      gates: [gate("Clinical Evidence", "moderate", 0.55), gate("Payer Access", "weak", 0.40), gate("Guideline Support", "weak", 0.35)],
      drivers: [driver("Payer Friction", "Downward", -8), driver("Adoption Inertia", "Downward", -6), driver("Competitor Pressure", "Downward", -5), driver("KOL Support", "Upward", 4)],
    });

    expect(result.probability).toBeLessThan(40);
    expect(result.confidence).not.toBe("High");
    expect(result.decisionPosture).not.toMatch(/plan for this outcome|shift resources toward execution/i);
  });

  it("Case 3: Balanced signals, mixed gates → uncertainty must be acknowledged", () => {
    const result = run({
      brandOutlookPct: 55,
      finalForecastPct: 45,
      minGateCapPct: 45,
      executionGapPts: 10,
      gates: [gate("Clinical Evidence", "strong", 0.80), gate("Payer Access", "weak", 0.45), gate("Timeline Feasibility", "moderate", 0.55)],
      drivers: [driver("Efficacy Data", "Upward", 7), driver("KOL Support", "Upward", 5), driver("Payer Friction", "Downward", -6), driver("Adoption Inertia", "Downward", -5)],
    });

    expect(result.uncertaintyType).not.toBe("well_resolved");
    expect(result.confidence).not.toBe("High");
  });
});

describe("GROUP 2 — Gate Stress", () => {
  it("Case 4: Strong signals, one hard gate → gate must constrain but not erase signal strength", () => {
    const result = run({
      brandOutlookPct: 75,
      finalForecastPct: 35,
      minGateCapPct: 35,
      executionGapPts: 40,
      gates: [gate("Clinical Evidence", "strong", 0.90), gate("Guideline Support", "strong", 0.85), gate("Payer Access", "weak", 0.35)],
      drivers: [driver("Efficacy Data", "Upward", 12), driver("KOL Support", "Upward", 8), driver("Real-World Evidence", "Upward", 6)],
    });

    expect(result.uncertaintyType).toBe("gating_barriers");
    expect(result.reasoning).toMatch(/gap|barrier|operational|practical/i);
    expect(result.decisionPosture).not.toMatch(/this outcome is unlikely under current conditions.*do not plan/i);
    expect(result._audit.inputs.executionGapPts).toBe(40);
  });

  it("Case 5: Strong signals, one moderate gate → forecast should be in mid range", () => {
    const result = run({
      brandOutlookPct: 70,
      finalForecastPct: 55,
      minGateCapPct: 55,
      executionGapPts: 15,
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Guideline Support", "strong", 0.80), gate("Payer Access", "moderate", 0.60)],
      drivers: [driver("Efficacy Data", "Upward", 10), driver("KOL Support", "Upward", 7), driver("Real-World Evidence", "Upward", 5)],
    });

    expect(result.probability).toBeGreaterThanOrEqual(40);
    expect(result.probability).toBeLessThan(70);
    expect(result.reasoning).toMatch(/operational|limiting|partially/i);
  });

  it("Case 6: Weak signals, strong gates → forecast should be moderate, not inflated by gates", () => {
    const result = run({
      brandOutlookPct: 40,
      finalForecastPct: 38,
      minGateCapPct: 38,
      executionGapPts: 2,
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Payer Access", "strong", 0.80), gate("Guideline Support", "strong", 0.75)],
      drivers: [driver("Limited Data", "Downward", -5), driver("Small Patient Pop", "Downward", -4), driver("KOL Interest", "Upward", 3)],
    });

    expect(result.probability).toBeLessThan(50);
    expect(result.mostLikelyOutcome).not.toMatch(/likely within the forecast window/i);
  });
});

describe("GROUP 3 — Confidence Integrity", () => {
  it("Case 7: Contradictory evidence → confidence cannot be High", () => {
    const result = run({
      brandOutlookPct: 60,
      finalForecastPct: 48,
      minGateCapPct: 48,
      executionGapPts: 12,
      gates: [gate("Clinical Evidence", "moderate", 0.65), gate("Payer Access", "moderate", 0.55)],
      drivers: [
        driver("Phase 3 Efficacy", "Upward", 10),
        driver("KOL Endorsement", "Upward", 7),
        driver("Safety Signal", "Downward", -8),
        driver("Competitor Launch", "Downward", -7),
      ],
    });

    expect(result.confidence).not.toBe("High");
    expect(result.uncertaintyType).not.toBe("well_resolved");
  });

  it("Case 8: Sparse evidence → confidence must be Low", () => {
    const result = run({
      brandOutlookPct: 50,
      finalForecastPct: 45,
      minGateCapPct: 45,
      executionGapPts: 5,
      gates: [gate("Clinical Evidence", "unresolved", 0.40)],
      drivers: [driver("Early Signal", "Upward", 3)],
    });

    expect(result.confidence).toBe("Low");
    expect(["missing_evidence", "weak_evidence"]).toContain(result.uncertaintyType);
  });

  it("Case 9: High signal agreement, all gates resolved → confidence can be High", () => {
    const result = run({
      brandOutlookPct: 72,
      finalForecastPct: 70,
      minGateCapPct: 70,
      executionGapPts: 2,
      gates: [gate("Clinical Evidence", "strong", 0.90), gate("Payer Access", "strong", 0.80), gate("Guideline Support", "strong", 0.75)],
      drivers: [driver("Phase 3 Efficacy", "Upward", 12), driver("KOL Endorsement", "Upward", 8), driver("Guideline Inclusion", "Upward", 7)],
    });

    expect(["High", "Moderate"]).toContain(result.confidence);
    expect(result.uncertaintyType).toBe("well_resolved");
    expect(result._audit.integrityPassed).toBe(true);
  });
});

describe("GROUP 4 — Timing / Edge Cases", () => {
  it("Case 10: Same case, same inputs → deterministic output (static regression)", () => {
    const input: JudgmentInput = {
      priorPct: 50,
      brandOutlookPct: 65,
      finalForecastPct: 48,
      minGateCapPct: 48,
      executionGapPts: 17,
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Payer Access", "weak", 0.48), gate("Guideline Support", "moderate", 0.60)],
      drivers: [driver("Efficacy Data", "Upward", 9), driver("KOL Support", "Upward", 6), driver("Payer Friction", "Downward", -7)],
      analogContext: null,
      questionText: "Will ARIKAYCE achieve meaningful HCP adoption within 18 months?",
    };

    const run1 = generateExecutiveJudgment(input);
    const run2 = generateExecutiveJudgment(input);
    const run3 = generateExecutiveJudgment(input);

    expect(run1.mostLikelyOutcome).toBe(run2.mostLikelyOutcome);
    expect(run2.mostLikelyOutcome).toBe(run3.mostLikelyOutcome);
    expect(run1.confidence).toBe(run2.confidence);
    expect(run1.probability).toBe(run2.probability);
    expect(run1.decisionPosture).toBe(run2.decisionPosture);
    expect(run1.uncertaintyType).toBe(run2.uncertaintyType);
    expect(run1.reasoning).toBe(run2.reasoning);
    expect(run1._audit.confidenceAudit.rawTotal).toBe(run2._audit.confidenceAudit.rawTotal);
  });
});

describe("SENSITIVITY — One-variable changes", () => {
  const baseInput: JudgmentInput = {
    priorPct: 50,
    brandOutlookPct: 60,
    finalForecastPct: 50,
    minGateCapPct: 50,
    executionGapPts: 10,
    gates: [gate("Clinical Evidence", "strong", 0.80), gate("Payer Access", "moderate", 0.55)],
    drivers: [driver("Efficacy Data", "Upward", 8), driver("KOL Support", "Upward", 5), driver("Payer Friction", "Downward", -6)],
    analogContext: null,
    questionText: "Will this therapy achieve meaningful adoption within 18 months?",
  };

  it("S1: Improving the weakest gate status (only) should not worsen the outcome polarity", () => {
    const withWeak = generateExecutiveJudgment({
      ...baseInput,
      gates: [gate("Clinical Evidence", "strong", 0.80), gate("Payer Access", "weak", 0.40)],
    });
    const withModerate = generateExecutiveJudgment({
      ...baseInput,
      gates: [gate("Clinical Evidence", "strong", 0.80), gate("Payer Access", "moderate", 0.55)],
    });

    const polarityRank = { negative: 0, neutral: 1, positive: 2 };
    const weakPolarity = withWeak._audit.outcomeAudit.probabilityBand.startsWith("<40") ? "negative" : withWeak._audit.outcomeAudit.probabilityBand.startsWith("40") ? "neutral" : "positive";
    const modPolarity = withModerate._audit.outcomeAudit.probabilityBand.startsWith("<40") ? "negative" : withModerate._audit.outcomeAudit.probabilityBand.startsWith("40") ? "neutral" : "positive";
    expect(polarityRank[modPolarity]).toBeGreaterThanOrEqual(polarityRank[weakPolarity]);
  });

  it("S2: Adding a negative driver should lower confidence or darken posture", () => {
    const base = generateExecutiveJudgment(baseInput);
    const withNeg = generateExecutiveJudgment({
      ...baseInput,
      drivers: [...baseInput.drivers, driver("Safety Concern", "Downward", -8)],
    });

    const confRank = { Low: 0, Moderate: 1, High: 2 };
    expect(confRank[withNeg.confidence]).toBeLessThanOrEqual(confRank[base.confidence]);
  });

  it("S3: Increasing execution gap (only) should not increase confidence", () => {
    const small = generateExecutiveJudgment({ ...baseInput, executionGapPts: 5 });
    const large = generateExecutiveJudgment({ ...baseInput, executionGapPts: 35 });

    const confRank: Record<string, number> = { Low: 0, Moderate: 1, High: 2 };
    expect(confRank[large.confidence]).toBeLessThanOrEqual(confRank[small.confidence]);
  });

  it("S4: Question category changes outcome language but not confidence", () => {
    const adoption = generateExecutiveJudgment({ ...baseInput, questionText: "Will adoption increase?" });
    const launch = generateExecutiveJudgment({ ...baseInput, questionText: "Will FDA approval happen on time?" });

    expect(adoption._audit.outcomeAudit.questionCategory).toBe("adoption");
    expect(launch._audit.outcomeAudit.questionCategory).toBe("launch");
    expect(adoption.confidence).toBe(launch.confidence);
    expect(adoption.mostLikelyOutcome).not.toBe(launch.mostLikelyOutcome);
  });
});

describe("CONTRADICTION STRESS TESTS", () => {
  it("C1: Many positives + one unresolved gate → cannot say well_resolved", () => {
    const result = run({
      brandOutlookPct: 70,
      finalForecastPct: 38,
      minGateCapPct: 38,
      executionGapPts: 32,
      gates: [gate("Clinical Evidence", "strong", 0.90), gate("Guideline Support", "strong", 0.85), gate("Payer Access", "unresolved", 0.30)],
      drivers: [
        driver("Efficacy Data", "Upward", 12),
        driver("KOL Support", "Upward", 8),
        driver("Guideline Inclusion", "Upward", 6),
        driver("Real-World Evidence", "Upward", 5),
      ],
    });

    expect(result.uncertaintyType).not.toBe("well_resolved");
    expect(result.confidence).not.toBe("High");
    expect(result._audit.inputs.executionGapPts).toBe(32);
  });

  it("C2: Weak evidence but strong access → uncertainty must reflect evidence gap", () => {
    const result = run({
      brandOutlookPct: 45,
      finalForecastPct: 42,
      minGateCapPct: 42,
      executionGapPts: 3,
      gates: [gate("Clinical Evidence", "weak", 0.45), gate("Payer Access", "strong", 0.85)],
      drivers: [driver("Preliminary Data", "Upward", 3)],
    });

    expect(["missing_evidence", "weak_evidence", "gating_barriers"]).toContain(result.uncertaintyType);
    expect(result.confidence).not.toBe("High");
  });

  it("C3: Equal positives and negatives → must acknowledge mixed signals", () => {
    const result = run({
      brandOutlookPct: 55,
      finalForecastPct: 48,
      minGateCapPct: 48,
      executionGapPts: 7,
      gates: [gate("Clinical Evidence", "moderate", 0.60), gate("Payer Access", "moderate", 0.55)],
      drivers: [
        driver("Efficacy", "Upward", 7),
        driver("KOL Support", "Upward", 5),
        driver("Safety Signal", "Downward", -7),
        driver("Competitor Pressure", "Downward", -5),
      ],
    });

    expect(result.confidence).not.toBe("High");
    expect(result.uncertaintyType).not.toBe("well_resolved");
  });

  it("C4: All gates strong + positive majority → integrity auto-corrects negative polarity to neutral", () => {
    const result = run({
      brandOutlookPct: 75,
      finalForecastPct: 35,
      minGateCapPct: 35,
      executionGapPts: 40,
      gates: [gate("Clinical Evidence", "strong", 0.90), gate("Payer Access", "strong", 0.80), gate("Guideline", "strong", 0.75)],
      drivers: [driver("Efficacy", "Upward", 10), driver("KOL", "Upward", 7), driver("RWE", "Upward", 5)],
    });

    const check = result._audit.integrityChecks.find(c => c.rule === "positive_majority_with_strong_gates_cannot_produce_strongly_negative_outcome");
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(result._audit.integrityPassed).toBe(false);
    expect(result.mostLikelyOutcome).not.toMatch(/unlikely|barriers outweigh|constrained/i);
  });

  it("C5: Large gap (40pts) → confidence auto-corrected to non-High", () => {
    const result = run({
      brandOutlookPct: 80,
      finalForecastPct: 40,
      minGateCapPct: 40,
      executionGapPts: 40,
      gates: [gate("Evidence", "strong", 0.90), gate("Access", "strong", 0.85), gate("Guideline", "strong", 0.80)],
      drivers: [driver("Efficacy", "Upward", 12), driver("KOL", "Upward", 8), driver("RWE", "Upward", 6)],
      analogContext: { topMatches: [{ caseId: "ANALOG-1", therapyArea: "Oncology", specialty: null, productType: null, evidenceType: null, similarityScore: 0.85, confidenceBand: "High" as const, matchedDimensions: ["therapy_area"], keyDifferences: [], adoptionLesson: "Strong precedent", finalProbability: 0.65 }], calibratedCount: 5, scenarios: { optimistic: null, base: null, pessimistic: null } },
    });

    expect(result.confidence).not.toBe("High");
  });

  it("C6: Moderate gate capping below 50% → integrity check fires and correction applied", () => {
    const result = run({
      brandOutlookPct: 60,
      finalForecastPct: 45,
      minGateCapPct: 40,
      executionGapPts: 15,
      gates: [gate("Clinical Evidence", "strong", 0.80), gate("Payer Access", "moderate", 0.40)],
      drivers: [driver("Efficacy", "Upward", 8), driver("KOL", "Upward", 5)],
    });

    const moderateBelowCheck = result._audit.integrityChecks.find(c => c.rule === "moderate_gate_cannot_cap_below_50");
    expect(moderateBelowCheck).toBeDefined();
    expect(moderateBelowCheck!.passed).toBe(false);
    expect(result._audit.integrityPassed).toBe(false);

    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.length).toBeGreaterThan(0);
    expect(result.decisionPosture).toBeDefined();
    expect(result.decisionPosture.length).toBeGreaterThan(0);
  });
});

describe("AUDIT TRAIL COMPLETENESS", () => {
  it("Every judgment produces a complete audit trail", () => {
    const result = run({});

    expect(result._audit).toBeDefined();
    expect(result._audit.inputs.priorPct).toBeTypeOf("number");
    expect(result._audit.inputs.brandOutlookPct).toBeTypeOf("number");
    expect(result._audit.inputs.finalForecastPct).toBeTypeOf("number");
    expect(result._audit.inputs.minGateCapPct).toBeTypeOf("number");
    expect(result._audit.inputs.executionGapPts).toBeTypeOf("number");
    expect(result._audit.inputs.upwardDriverCount).toBeTypeOf("number");
    expect(result._audit.inputs.downwardDriverCount).toBeTypeOf("number");
    expect(result._audit.inputs.topPositiveDrivers).toBeInstanceOf(Array);
    expect(result._audit.inputs.topNegativeDrivers).toBeInstanceOf(Array);
    expect(result._audit.inputs.gateStates).toBeInstanceOf(Array);
    expect(result._audit.inputs.gateStates.length).toBeGreaterThan(0);

    expect(result._audit.confidenceAudit.gateResolutionScore).toBeTypeOf("number");
    expect(result._audit.confidenceAudit.analogScore).toBeTypeOf("number");
    expect(result._audit.confidenceAudit.convergenceScore).toBeTypeOf("number");
    expect(result._audit.confidenceAudit.gateCountScore).toBeTypeOf("number");
    expect(result._audit.confidenceAudit.rawTotal).toBeTypeOf("number");
    expect(["High", "Moderate", "Low"]).toContain(result._audit.confidenceAudit.finalLevel);

    expect(result._audit.outcomeAudit.questionCategory).toBeTypeOf("string");
    expect(result._audit.outcomeAudit.probabilityBand).toBeTypeOf("string");
    expect(result._audit.outcomeAudit.ruleTriggered).toBeTypeOf("string");

    expect(result._audit.postureAudit.caseType).toBeTypeOf("string");
    expect(result._audit.postureAudit.ruleTriggered).toBeTypeOf("string");

    expect(result._audit.integrityChecks).toBeInstanceOf(Array);
    expect(result._audit.integrityChecks.length).toBe(5);
    for (const check of result._audit.integrityChecks) {
      expect(check.rule).toBeTypeOf("string");
      expect(check.passed).toBeTypeOf("boolean");
      expect(check.detail).toBeTypeOf("string");
    }

    expect(result._audit.integrityPassed).toBeTypeOf("boolean");

    expect(result._audit.constraintDecomposition).toBeInstanceOf(Array);
    expect(result._audit.constraintDecomposition.length).toBeGreaterThan(0);
    for (const cd of result._audit.constraintDecomposition) {
      expect(cd.gateId).toBeTypeOf("string");
      expect(cd.gateLabel).toBeTypeOf("string");
      expect(cd.gateStatus).toBeTypeOf("string");
      expect(cd.isAbstract).toBeTypeOf("boolean");
      expect(cd.drivers).toBeInstanceOf(Array);
      for (const d of cd.drivers) {
        expect(d.name).toBeTypeOf("string");
        expect(d.impactScore).toBeTypeOf("number");
        expect(["High", "Moderate", "Low"]).toContain(d.rank);
      }
    }
  });

  it("Abstract constraints must have at least one ranked driver", () => {
    const result = run({
      gates: [
        gate("Operational Readiness", "weak", 0.35),
        gate("Payer Access", "moderate", 0.55),
        gate("Clinical Evidence", "strong", 0.85),
      ],
    });
    const abstractGates = result._audit.constraintDecomposition.filter(cd => cd.isAbstract);
    expect(abstractGates.length).toBeGreaterThan(0);
    for (const cd of abstractGates) {
      expect(cd.drivers.length).toBeGreaterThan(0);
    }
  });

  it("Constraint drivers are sorted by impact score descending", () => {
    const result = run({
      gates: [gate("Operational Readiness", "weak", 0.35)],
    });
    const cd = result._audit.constraintDecomposition.find(c => c.gateLabel === "Operational Readiness");
    expect(cd).toBeDefined();
    expect(cd!.drivers.length).toBeGreaterThan(1);
    for (let i = 1; i < cd!.drivers.length; i++) {
      expect(cd!.drivers[i - 1].impactScore).toBeGreaterThanOrEqual(cd!.drivers[i].impactScore);
    }
  });

  it("enforceDecomposition throws for abstract constraint with no drivers", () => {
    expect(() => enforceDecomposition([{
      gateId: "test_gate",
      gateLabel: "Unmapped Readiness",
      gateStatus: "weak",
      isAbstract: true,
      drivers: [],
    }])).toThrow(/Unmapped Readiness/);
  });

  it("DECOMP-ENFORCEMENT check appended when abstract gate has no mapped drivers", () => {
    const result = run({
      gates: [gate("Novel Endorsement", "weak", 0.35)],
    });
    const cd = result._audit.constraintDecomposition.find(c => c.gateLabel === "Novel Endorsement");
    if (cd && cd.isAbstract && cd.drivers.length === 0) {
      const decompCheck = result._audit.integrityChecks.find(c => c.rule === "DECOMP-ENFORCEMENT");
      expect(decompCheck).toBeDefined();
      expect(decompCheck!.passed).toBe(false);
      expect(result._audit.integrityPassed).toBe(false);
    } else {
      expect(cd!.drivers.length).toBeGreaterThan(0);
    }
  });

  it("Confidence audit score correctly sums to rawTotal", () => {
    const result = run({});
    const ca = result._audit.confidenceAudit;
    const expectedTotal = ca.gateResolutionScore + ca.analogScore + ca.convergenceScore + ca.gateCountScore - ca.gapPenalty - ca.conflictPenalty;
    expect(ca.rawTotal).toBe(expectedTotal);
  });

  it("Driver counts match actual driver arrays", () => {
    const drivers = [
      driver("A", "Upward", 5),
      driver("B", "Upward", 3),
      driver("C", "Downward", -4),
    ];
    const result = run({ drivers });
    expect(result._audit.inputs.upwardDriverCount).toBe(2);
    expect(result._audit.inputs.downwardDriverCount).toBe(1);
  });
});

describe("NARRATIVE INTEGRITY", () => {
  it("Reasoning mentions gap when execution gap >= 15", () => {
    const result = run({ brandOutlookPct: 70, finalForecastPct: 45, executionGapPts: 25 });
    expect(result.reasoning).toMatch(/gap|stronger than.*readiness/i);
  });

  it("Reasoning mentions alignment when gap < 5", () => {
    const result = run({ brandOutlookPct: 55, finalForecastPct: 53, executionGapPts: 2 });
    expect(result.reasoning).toMatch(/aligned|reflects conditions/i);
  });

  it("Decision posture matches probability band", () => {
    const highProb = run({ finalForecastPct: 70, brandOutlookPct: 72, executionGapPts: 2, minGateCapPct: 70 });
    expect(highProb.decisionPosture).toMatch(/plan for|prepare for|favorable/i);

    const lowProb = run({ finalForecastPct: 25, brandOutlookPct: 65, executionGapPts: 40, minGateCapPct: 25 });
    expect(lowProb.decisionPosture).not.toMatch(/plan for this outcome.*shift resources/i);
  });

  it("primaryConstraints includes non-strong gates with top 1-3 drivers and lever text", () => {
    const result = run({
      brandOutlookPct: 70,
      finalForecastPct: 40,
      executionGapPts: 30,
      gates: [gate("Operational Readiness", "weak", 0.35), gate("Payer Access", "moderate", 0.55), gate("Clinical Evidence", "strong", 0.85)],
    });
    expect(result.primaryConstraints.length).toBe(2);
    const opReady = result.primaryConstraints.find(c => c.label === "Operational Readiness");
    expect(opReady).toBeDefined();
    expect(opReady!.status).toBe("weak");
    expect(opReady!.drivers.length).toBeGreaterThan(0);
    expect(opReady!.drivers.length).toBeLessThanOrEqual(3);
    expect(opReady!.lever).toMatch(/Resolving .+ could raise the outlook from \d+% to ~\d+%/);
    for (const d of opReady!.drivers) {
      expect(d.name).toBeTypeOf("string");
      expect(["High", "Moderate", "Low"]).toContain(d.rank);
    }
    const clinical = result.primaryConstraints.find(c => c.label === "Clinical Evidence");
    expect(clinical).toBeUndefined();
  });

  it("primaryConstraints is empty when all gates are strong", () => {
    const result = run({
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Guideline Endorsement", "strong", 0.80)],
    });
    expect(result.primaryConstraints.length).toBe(0);
  });

  it("Reasoning includes specific driver names when abstract constraints are present", () => {
    const result = run({
      brandOutlookPct: 70,
      finalForecastPct: 40,
      executionGapPts: 30,
      gates: [gate("Clinical Evidence", "strong", 0.85), gate("Operational Readiness", "weak", 0.35)],
    });
    expect(result.reasoning).toMatch(/Primary constraint: Operational Readiness\. Specific drivers:/);
    expect(result.reasoning).toMatch(/Site workflow integration|Staff training|Patient onboarding|Equipment|Administrative/);
  });

  it("Monitor list only contains items that exist in gates or drivers", () => {
    const inputDrivers = [driver("Efficacy Data", "Upward", 8), driver("KOL Support", "Upward", 5), driver("Payer Friction", "Downward", -6)];
    const inputGates = [gate("Clinical Evidence", "strong", 0.85), gate("Payer Access", "moderate", 0.60)];
    const result = run({ drivers: inputDrivers, gates: inputGates });
    const allGateLabels = inputGates.map(g => g.gate_label.toLowerCase());
    const allDriverNames = inputDrivers.map(d => d.name.toLowerCase());
    for (const item of result.monitorList) {
      const inGates = allGateLabels.includes(item.label.toLowerCase());
      const inDrivers = allDriverNames.includes(item.label.toLowerCase());
      expect(inGates || inDrivers).toBe(true);
    }
  });
});
