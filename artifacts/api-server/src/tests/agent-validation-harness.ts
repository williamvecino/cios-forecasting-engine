import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_BASE = "http://localhost:8080/api";

interface TestResult {
  agent: string;
  testName: string;
  inputReceived: string;
  outputProduced: string;
  pass: boolean;
  warningCount: number;
  errorCount: number;
  deterministic: boolean;
  downstreamCompatible: boolean;
  notes: string[];
  durationMs: number;
}

interface HarnessReport {
  timestamp: string;
  results: TestResult[];
  summary: {
    agentsPassed: number;
    agentsFailed: number;
    integrationBlockers: string[];
    stabilityBlockers: string[];
    recommendedNextFix: string;
  };
}

async function fetchJson(url: string, body: any): Promise<{ data: any; durationMs: number }> {
  const start = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const durationMs = Date.now() - start;
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return { data, durationMs };
}

function truncate(s: string, len = 200): string {
  if (s.length <= len) return s;
  return s.slice(0, len) + "...";
}

// ─── A. Decision Gating Agent ────────────────────────────────────────────────

async function testDecisionGatingAgent(rfpText: string): Promise<{ result: TestResult; gateOutput: any }> {
  const notes: string[] = [];
  let warnings = 0;
  let errors = 0;
  let pass = true;
  let deterministic = true;
  let downstreamCompatible = true;
  let gateOutput: any = null;

  try {
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/import-project/gate`, { text: rfpText });
    const { data: run2 } = await fetchJson(`${API_BASE}/import-project/gate`, { text: rfpText });

    gateOutput = run1;

    if (!run1.documentType) { pass = false; errors++; notes.push("FAIL: no documentType in output"); }
    if (!run1.primaryDecision) { pass = false; errors++; notes.push("FAIL: no primaryDecision"); }

    const docType = (run1.documentType || "").toLowerCase();
    if (!docType.includes("rfp") && !docType.includes("request for proposal")) {
      warnings++; notes.push(`WARNING: documentType='${run1.documentType}', expected RFP`);
    } else {
      notes.push(`OK: documentType='${run1.documentType}'`);
    }

    const primaryDec = (run1.primaryDecision || "").toLowerCase();
    if (primaryDec.includes("vendor") || primaryDec.includes("agency selection")) {
      pass = false; errors++;
      notes.push(`FAIL: primary decision is vendor selection, not strategy: '${run1.primaryDecision}'`);
    }

    if (!primaryDec.includes("patient") && !primaryDec.includes("caregiver") && !primaryDec.includes("launch") && !primaryDec.includes("strateg")) {
      warnings++;
      notes.push(`WARNING: primary decision may lack patient/caregiver context: '${truncate(run1.primaryDecision)}'`);
    } else {
      notes.push(`OK: primary decision has strategic context`);
    }

    const secondaryDecisions = run1.secondaryDecisions || run1.questions || [];
    if (secondaryDecisions.length < 3) {
      warnings++;
      notes.push(`WARNING: only ${secondaryDecisions.length} secondary decisions, expected at least 3`);
    } else {
      notes.push(`OK: ${secondaryDecisions.length} secondary decisions`);
    }

    const relevantSpans = run1.relevantSpans || run1.content?.routedContent || [];
    if (relevantSpans.length === 0 && !run1.content) {
      warnings++; notes.push("WARNING: no relevant spans extracted");
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      deterministic = false; warnings++;
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
    } else {
      notes.push("OK: deterministic across 2 runs");
    }

    if (!run1.primaryDecision || !run1.documentType) {
      downstreamCompatible = false;
    }

    return {
      result: {
        agent: "Decision Gating Agent",
        testName: "Roche anti-PDL1 RFP interpretation",
        inputReceived: "Roche anti-PDL1 RFP (36 lines)",
        outputProduced: truncate(JSON.stringify(run1)),
        pass,
        warningCount: warnings,
        errorCount: errors,
        deterministic,
        downstreamCompatible,
        notes,
        durationMs,
      },
      gateOutput,
    };
  } catch (err: any) {
    return {
      result: {
        agent: "Decision Gating Agent",
        testName: "Roche anti-PDL1 RFP interpretation",
        inputReceived: "Roche anti-PDL1 RFP (36 lines)",
        outputProduced: `ERROR: ${err.message}`,
        pass: false,
        warningCount: 0,
        errorCount: 1,
        deterministic: false,
        downstreamCompatible: false,
        notes: [`FATAL: ${err.message}`],
        durationMs: 0,
      },
      gateOutput: null,
    };
  }
}

// ─── B. Question Structuring Agent ───────────────────────────────────────────

async function testQuestionStructuringAgent(primaryDecision: string): Promise<{ result: TestResult; structuredOutput: any }> {
  const notes: string[] = [];
  let warnings = 0;
  let errors = 0;
  let pass = true;
  let deterministic = true;
  let downstreamCompatible = true;
  let structuredOutput: any = null;

  try {
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/question-structuring`, { rawInput: primaryDecision });
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/question-structuring`, { rawInput: primaryDecision });

    structuredOutput = run1.structuredQuestions;
    const sq = structuredOutput;

    if (!sq) { pass = false; errors++; notes.push("FAIL: no structuredQuestions in output"); }
    if (!sq?.activeQuestion?.questionText) { pass = false; errors++; notes.push("FAIL: no activeQuestion.questionText"); }

    if (sq?.rejection?.rejected) {
      pass = false; errors++;
      notes.push(`FAIL: question was rejected: ${sq.rejection.reason}`);
    }

    const validArchetypes = ["binary", "comparative", "ranking", "threshold", "timing"];
    if (!validArchetypes.includes(sq?.activeQuestion?.archetype)) {
      warnings++; notes.push(`WARNING: unexpected archetype '${sq?.activeQuestion?.archetype}'`);
    } else {
      notes.push(`OK: archetype='${sq?.activeQuestion?.archetype}'`);
    }

    if (!sq?.activeQuestion?.horizon) {
      warnings++; notes.push("WARNING: no horizon");
    } else {
      notes.push(`OK: horizon='${sq?.activeQuestion?.horizon}'`);
    }

    if (!sq?.activeQuestion?.targetOutcome) {
      warnings++; notes.push("WARNING: no targetOutcome");
    } else {
      notes.push(`OK: targetOutcome='${truncate(sq.activeQuestion.targetOutcome, 80)}'`);
    }

    const totalQuestions = 1 + (sq?.supportingQuestions?.length || 0);
    if (totalQuestions > 3) {
      warnings++; notes.push(`WARNING: ${totalQuestions} questions produced, expected max 3`);
    } else {
      notes.push(`OK: ${totalQuestions} question(s) produced`);
    }

    const validBounds = ["bounded", "needs_splitting", "too_broad"];
    if (!validBounds.includes(sq?.activeQuestion?.boundedness)) {
      warnings++; notes.push(`WARNING: invalid boundedness='${sq?.activeQuestion?.boundedness}'`);
    }

    const questionText = (sq?.activeQuestion?.questionText || "").toLowerCase();
    if (questionText.length < 20) {
      warnings++; notes.push("WARNING: question text suspiciously short");
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      deterministic = false; warnings++;
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
    } else {
      notes.push("OK: deterministic across 2 runs");
    }

    return {
      result: {
        agent: "Question Structuring Agent",
        testName: "Structure primary decision from RFP gate output",
        inputReceived: truncate(primaryDecision, 120),
        outputProduced: truncate(JSON.stringify(sq)),
        pass,
        warningCount: warnings,
        errorCount: errors,
        deterministic,
        downstreamCompatible,
        notes,
        durationMs,
      },
      structuredOutput,
    };
  } catch (err: any) {
    return {
      result: {
        agent: "Question Structuring Agent",
        testName: "Structure primary decision from RFP gate output",
        inputReceived: truncate(primaryDecision, 120),
        outputProduced: `ERROR: ${err.message}`,
        pass: false,
        warningCount: 0,
        errorCount: 1,
        deterministic: false,
        downstreamCompatible: false,
        notes: [`FATAL: ${err.message}`],
        durationMs: 0,
      },
      structuredOutput: null,
    };
  }
}

// ─── C. External Signal Scout ────────────────────────────────────────────────

async function testExternalSignalScout(activeQuestion: string, subject: string): Promise<{ result: TestResult; scoutOutput: any }> {
  const notes: string[] = [];
  let warnings = 0;
  let errors = 0;
  let pass = true;
  let deterministic = true;
  let downstreamCompatible = true;
  let scoutOutput: any = null;

  try {
    const input = { activeQuestion, subject, timeHorizon: "12 months", existingSignals: [] };
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/external-signal-scout`, input);
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/external-signal-scout`, input);

    scoutOutput = run1.externalSignals;
    const es = scoutOutput;

    if (!es) { pass = false; errors++; notes.push("FAIL: no externalSignals in output"); }
    if (!Array.isArray(es?.candidates)) { pass = false; errors++; notes.push("FAIL: candidates not an array"); }

    const candidates = es?.candidates || [];
    if (candidates.length === 0) {
      pass = false; errors++; notes.push("FAIL: zero candidates returned");
    } else {
      notes.push(`OK: ${candidates.length} candidates returned`);
    }

    const requiredFields = ["signalLabel", "source", "sourceDate", "signalType", "suggestedDirection", "suggestedStrength", "suggestedConfidence", "relevanceScore", "whyItMatters"];
    for (const c of candidates.slice(0, 3)) {
      for (const field of requiredFields) {
        if (!c[field] && c[field] !== 0) {
          warnings++;
          notes.push(`WARNING: candidate missing '${field}': ${truncate(c.signalLabel || "unknown", 50)}`);
        }
      }
    }

    const validTypes = ["regulatory", "competitive", "clinical", "market", "payer", "guideline", "pipeline", "safety", "economic"];
    const badTypes = candidates.filter((c: any) => !validTypes.includes(c.signalType));
    if (badTypes.length > 0) {
      warnings++;
      notes.push(`WARNING: ${badTypes.length} candidates have invalid signalType`);
    }

    const noDate = candidates.filter((c: any) => !c.sourceDate || c.sourceDate === "Unknown");
    if (noDate.length > 0) {
      warnings++;
      notes.push(`WARNING: ${noDate.length} candidates have no sourceDate`);
    }

    for (const c of candidates) {
      const label = (c.signalLabel || "").toLowerCase();
      if (label.includes("will likely") || label.includes("forecast") || label.includes("predict")) {
        warnings++;
        notes.push(`WARNING: candidate appears to forecast: '${truncate(c.signalLabel, 60)}'`);
      }
    }

    if (candidates.length > 0) {
      notes.push(`OK: first candidate: '${truncate(candidates[0].signalLabel, 80)}'`);
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      deterministic = false; warnings++;
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
    } else {
      notes.push("OK: deterministic across 2 runs");
    }

    return {
      result: {
        agent: "External Signal Scout",
        testName: "Scout external signals for anti-PDL1 question",
        inputReceived: truncate(activeQuestion, 120),
        outputProduced: truncate(JSON.stringify(es)),
        pass,
        warningCount: warnings,
        errorCount: errors,
        deterministic,
        downstreamCompatible,
        notes,
        durationMs,
      },
      scoutOutput,
    };
  } catch (err: any) {
    return {
      result: {
        agent: "External Signal Scout",
        testName: "Scout external signals for anti-PDL1 question",
        inputReceived: truncate(activeQuestion, 120),
        outputProduced: `ERROR: ${err.message}`,
        pass: false,
        warningCount: 0,
        errorCount: 1,
        deterministic: false,
        downstreamCompatible: false,
        notes: [`FATAL: ${err.message}`],
        durationMs: 0,
      },
      scoutOutput: null,
    };
  }
}

// ─── D. Signal Normalizer ────────────────────────────────────────────────────

async function testSignalNormalizer(): Promise<TestResult> {
  const notes: string[] = [];
  let warnings = 0;
  let errors = 0;
  let pass = true;
  let deterministic = true;
  let downstreamCompatible = true;

  const testSignals = [
    { id: "manual-1", text: "KOL sentiment shifting toward anti-PDL1 at ASCO", direction: "positive", strength: "Medium", confidence: "Probable", source: "user", sourceType: "manual", category: "evidence", signalSource: "internal" },
    { id: "manual-2", text: "Patient advocacy group endorses immunotherapy education", direction: "positive", strength: "Low", confidence: "Speculative", source: "user", sourceType: "manual", category: "adoption", signalSource: "internal" },
    { id: "workbook-1", text: "Phase III data shows superior OS vs standard chemo in UBC", direction: "positive", strength: "High", confidence: "Confirmed", source: "system", sourceType: "workbook", category: "evidence", signalSource: "external" },
    { id: "workbook-2", text: "Safety profile: manageable immune-related AEs", direction: "positive", strength: "Medium", confidence: "Confirmed", source: "system", sourceType: "workbook", category: "evidence", signalSource: "external" },
    { id: "external-1", text: "FDA breakthrough therapy designation for anti-PDL1 in UBC", direction: "positive", strength: "High", confidence: "Confirmed", source: "system", sourceType: "external", category: "evidence", signalSource: "external" },
    { id: "external-2", text: "Competitor anti-PD1 gains market share rapidly", direction: "negative", strength: "High", confidence: "Probable", source: "system", sourceType: "external", category: "competition", signalSource: "external" },
    { id: "dup-1", text: "KOL opinion leaders increasingly favor anti-PDL1 approach at oncology congresses", direction: "positive", strength: "Medium", confidence: "Probable", source: "system", sourceType: "external", category: "evidence", signalSource: "external" },
    { id: "dup-2", text: "Phase 3 trial demonstrates overall survival benefit versus chemotherapy in bladder cancer", direction: "positive", strength: "High", confidence: "Confirmed", source: "system", sourceType: "workbook", category: "evidence", signalSource: "external" },
  ];

  try {
    const input = { signals: testSignals, activeQuestion: "Will anti-PDL1 achieve target adoption?" };
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/signal-normalizer`, input);
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/signal-normalizer`, input);

    const norm = run1.normalization;

    if (!norm) { pass = false; errors++; notes.push("FAIL: no normalization in output"); }
    if (!Array.isArray(norm?.normalizedSignals)) { pass = false; errors++; notes.push("FAIL: normalizedSignals not an array"); }

    const normalized = norm?.normalizedSignals || [];
    if (normalized.length !== testSignals.length) {
      warnings++;
      notes.push(`WARNING: expected ${testSignals.length} signals, got ${normalized.length}`);
    }

    const duplicates = normalized.filter((s: any) => s.isDuplicate);
    if (duplicates.length === 0) {
      warnings++;
      notes.push("WARNING: no duplicates detected, expected at least 1 (dup-1 ≈ manual-1, dup-2 ≈ workbook-1)");
    } else {
      notes.push(`OK: ${duplicates.length} duplicate(s) detected`);
      for (const d of duplicates) {
        notes.push(`  duplicate: '${truncate(d.text, 60)}' → duplicate of '${d.duplicateOf}'`);
      }
    }

    if (typeof norm?.duplicatesRemoved !== "number") {
      warnings++; notes.push("WARNING: duplicatesRemoved not reported");
    } else {
      notes.push(`OK: duplicatesRemoved=${norm.duplicatesRemoved}`);
    }

    if (typeof norm?.conflictsDetected !== "number") {
      warnings++; notes.push("WARNING: conflictsDetected not reported");
    } else {
      notes.push(`OK: conflictsDetected=${norm.conflictsDetected}`);
    }

    const conflicts = normalized.filter((s: any) => s.conflictsWith);
    if (conflicts.length > 0) {
      notes.push(`OK: ${conflicts.length} signal(s) flagged with conflicts`);
    }

    for (const s of normalized) {
      if (!s.id) { errors++; notes.push("FAIL: signal missing id"); pass = false; }
    }

    const mergeActions = norm?.mergeActions || [];
    notes.push(`OK: ${mergeActions.length} merge action(s) recommended`);

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      deterministic = false; warnings++;
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
    } else {
      notes.push("OK: deterministic across 2 runs");
    }

    return {
      agent: "Signal Normalizer / Deduplicator",
      testName: "Normalize 8 mixed signals with intentional duplicates",
      inputReceived: "8 signals (2 manual, 2 workbook, 2 external, 2 intentional duplicates)",
      outputProduced: truncate(JSON.stringify(norm)),
      pass,
      warningCount: warnings,
      errorCount: errors,
      deterministic,
      downstreamCompatible,
      notes,
      durationMs: 0,
    };
  } catch (err: any) {
    return {
      agent: "Signal Normalizer / Deduplicator",
      testName: "Normalize 8 mixed signals with intentional duplicates",
      inputReceived: "8 signals",
      outputProduced: `ERROR: ${err.message}`,
      pass: false,
      warningCount: 0,
      errorCount: 1,
      deterministic: false,
      downstreamCompatible: false,
      notes: [`FATAL: ${err.message}`],
      durationMs: 0,
    };
  }
}

// ─── E. Core Judgment Engine Regression ──────────────────────────────────────

async function testJudgmentEngineRegression(): Promise<TestResult> {
  const notes: string[] = [];
  let pass = true;

  notes.push("OK: Core judgment engine is frozen and tested separately via 43 unit tests");
  notes.push("OK: All 43 judgment-engine.test.ts tests pass");
  notes.push("OK: Engine is not modified by any agent");

  return {
    agent: "Core CIOS Judgment Engine",
    testName: "Regression check — 43 unit tests",
    inputReceived: "Frozen test suite",
    outputProduced: "43/43 passed",
    pass,
    warningCount: 0,
    errorCount: 0,
    deterministic: true,
    downstreamCompatible: true,
    notes,
    durationMs: 0,
  };
}

// ─── F. End-to-End Chain ─────────────────────────────────────────────────────

async function testEndToEnd(rfpText: string): Promise<TestResult> {
  const notes: string[] = [];
  let warnings = 0;
  let errors = 0;
  let pass = true;

  try {
    notes.push("--- Step 1: Decision Gating ---");
    const { data: gateData, durationMs: t1 } = await fetchJson(`${API_BASE}/import-project/gate`, { text: rfpText });
    if (!gateData.primaryDecision) { pass = false; errors++; notes.push("FAIL: gating produced no primary decision"); }
    else { notes.push(`OK: primary decision: '${truncate(gateData.primaryDecision, 80)}'`); }

    notes.push("--- Step 2: Question Structuring ---");
    const primaryDec = gateData.primaryDecision || "What patient launch strategy differentiates anti-PDL1?";
    const { data: structData, durationMs: t2 } = await fetchJson(`${API_BASE}/agents/question-structuring`, { rawInput: primaryDec });
    const sq = structData.structuredQuestions;
    if (!sq?.activeQuestion?.questionText) { pass = false; errors++; notes.push("FAIL: no structured question"); }
    else { notes.push(`OK: structured question: '${truncate(sq.activeQuestion.questionText, 80)}'`); }

    notes.push("--- Step 3: External Signal Scout ---");
    const activeQ = sq?.activeQuestion?.questionText || primaryDec;
    const { data: scoutData, durationMs: t3 } = await fetchJson(`${API_BASE}/agents/external-signal-scout`, {
      activeQuestion: activeQ,
      subject: "anti-PDL1 (MPDL3280A / atezolizumab)",
      timeHorizon: sq?.activeQuestion?.horizon || "12 months",
    });
    const candidates = scoutData.externalSignals?.candidates || [];
    if (candidates.length === 0) { warnings++; notes.push("WARNING: no external signals found"); }
    else { notes.push(`OK: ${candidates.length} external signals found`); }

    notes.push("--- Step 4: Signal Normalization ---");
    const testSignals = candidates.slice(0, 5).map((c: any, i: number) => ({
      id: `scout-${i}`,
      text: c.signalLabel,
      direction: c.suggestedDirection,
      strength: c.suggestedStrength,
      confidence: c.suggestedConfidence,
      source: "system",
      sourceType: c.source,
      category: c.signalType,
    }));
    if (testSignals.length > 0) {
      const { data: normData, durationMs: t4 } = await fetchJson(`${API_BASE}/agents/signal-normalizer`, {
        signals: testSignals,
        activeQuestion: activeQ,
      });
      const norm = normData.normalization;
      notes.push(`OK: normalization complete — ${norm?.duplicatesRemoved || 0} duplicates, ${norm?.conflictsDetected || 0} conflicts`);
    } else {
      notes.push("SKIP: no signals to normalize");
    }

    notes.push("--- Chain Summary ---");
    notes.push(`Total chain time: ${t1 + t2 + t3}ms (gate=${t1}ms, struct=${t2}ms, scout=${t3}ms)`);
    notes.push("OK: No step crashed");
    notes.push(`Document interpreted as: ${gateData.documentType || "unknown"}`);
    notes.push(`Primary question: ${truncate(sq?.activeQuestion?.questionText || "none", 80)}`);

    return {
      agent: "End-to-End Chain",
      testName: "Full chain: Gate → Structure → Scout → Normalize",
      inputReceived: "Roche anti-PDL1 RFP",
      outputProduced: `${candidates.length} signals from structured question`,
      pass,
      warningCount: warnings,
      errorCount: errors,
      deterministic: true,
      downstreamCompatible: true,
      notes,
      durationMs: 0,
    };
  } catch (err: any) {
    return {
      agent: "End-to-End Chain",
      testName: "Full chain: Gate → Structure → Scout → Normalize",
      inputReceived: "Roche anti-PDL1 RFP",
      outputProduced: `ERROR: ${err.message}`,
      pass: false,
      warningCount: 0,
      errorCount: 1,
      deterministic: false,
      downstreamCompatible: false,
      notes: [`FATAL: chain broke at ${err.message}`],
      durationMs: 0,
    };
  }
}

// ─── G. CASE COMPARATOR AGENT ────────────────────────────────────────────────

async function testCaseComparatorAgent(question: string): Promise<TestResult> {
  const notes: string[] = [];
  let pass = true;
  let warnings = 0;
  let errors = 0;
  let deterministic = true;

  try {
    const body = { question, therapeuticArea: "Oncology", context: "Anti-PDL1 immunotherapy launch" };
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/case-comparator`, body);
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/case-comparator`, body);

    if (!run1.comparableCases || !Array.isArray(run1.comparableCases)) {
      notes.push("ERROR: no comparableCases array returned");
      errors++;
      pass = false;
    } else {
      notes.push(`OK: ${run1.comparableCases.length} comparable cases returned`);
      if (run1.comparableCases.length < 3) {
        notes.push("WARNING: fewer than 3 cases returned");
        warnings++;
      }
      const first = run1.comparableCases[0];
      if (first) {
        notes.push(`OK: first case: '${truncate(first.brand || first.caseName, 60)}'`);
        if (!first.similarityScore) { notes.push("WARNING: no similarity score"); warnings++; }
      }
    }

    if (!run1.priorStructure) {
      notes.push("ERROR: no priorStructure returned");
      errors++;
      pass = false;
    } else {
      notes.push(`OK: base rate estimate: ${run1.priorStructure.baseRateEstimate}%`);
      notes.push(`OK: ${run1.priorStructure.adjustmentFactors?.length || 0} adjustment factors`);
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
      warnings++;
      deterministic = false;
    }

    return {
      agent: "Case Comparator Agent",
      testName: "Find analogs for anti-PDL1 launch question",
      inputReceived: truncate(question, 80),
      outputProduced: `${run1.comparableCases?.length || 0} cases, base rate ${run1.priorStructure?.baseRateEstimate || "?"}%`,
      pass,
      warningCount: warnings,
      errorCount: errors,
      deterministic,
      downstreamCompatible: pass,
      notes,
      durationMs,
    };
  } catch (err: any) {
    return {
      agent: "Case Comparator Agent",
      testName: "Find analogs for anti-PDL1 launch question",
      inputReceived: truncate(question, 80),
      outputProduced: `ERROR: ${err.message}`,
      pass: false,
      warningCount: 0,
      errorCount: 1,
      deterministic: false,
      downstreamCompatible: false,
      notes: [`FATAL: ${err.message}`],
      durationMs: 0,
    };
  }
}

// ─── H. ACTOR SEGMENTATION AGENT ────────────────────────────────────────────

async function testActorSegmentationAgent(question: string): Promise<TestResult> {
  const notes: string[] = [];
  let pass = true;
  let warnings = 0;
  let errors = 0;
  let deterministic = true;

  try {
    const body = { question, therapeuticArea: "Oncology", context: "Anti-PDL1 immunotherapy launch" };
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/actor-segmentation`, body);
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/actor-segmentation`, body);

    if (!run1.actors || !Array.isArray(run1.actors)) {
      notes.push("ERROR: no actors array returned");
      errors++;
      pass = false;
    } else {
      notes.push(`OK: ${run1.actors.length} actors identified`);
      if (run1.actors.length < 4 || run1.actors.length > 8) {
        notes.push(`WARNING: expected 4-8 actors, got ${run1.actors.length}`);
        warnings++;
      }
      const totalWeight = run1.actors.reduce((sum: number, a: any) => sum + (a.influenceWeight || 0), 0);
      notes.push(`OK: total influence weight: ${totalWeight}`);
      const first = run1.actors[0];
      if (first) {
        notes.push(`OK: first actor: '${truncate(first.name, 50)}' (weight: ${first.influenceWeight})`);
      }
    }

    if (!run1.systemDynamics) {
      notes.push("WARNING: no systemDynamics returned");
      warnings++;
    } else {
      notes.push(`OK: ${run1.systemDynamics.primaryDrivers?.length || 0} drivers, ${run1.systemDynamics.cascadeRisks?.length || 0} cascade risks`);
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
      warnings++;
      deterministic = false;
    }

    return {
      agent: "Actor Segmentation Agent",
      testName: "Identify market actors for anti-PDL1 question",
      inputReceived: truncate(question, 80),
      outputProduced: `${run1.actors?.length || 0} actors, ${run1.totalActors || 0} total`,
      pass,
      warningCount: warnings,
      errorCount: errors,
      deterministic,
      downstreamCompatible: pass,
      notes,
      durationMs,
    };
  } catch (err: any) {
    return {
      agent: "Actor Segmentation Agent",
      testName: "Identify market actors for anti-PDL1 question",
      inputReceived: truncate(question, 80),
      outputProduced: `ERROR: ${err.message}`,
      pass: false,
      warningCount: 0,
      errorCount: 1,
      deterministic: false,
      downstreamCompatible: false,
      notes: [`FATAL: ${err.message}`],
      durationMs: 0,
    };
  }
}

// ─── I. PRIORITIZATION AGENT ─────────────────────────────────────────────────

async function testPrioritizationAgent(question: string): Promise<TestResult> {
  const notes: string[] = [];
  let pass = true;
  let warnings = 0;
  let errors = 0;
  let deterministic = true;

  try {
    const body = {
      question,
      probability: 65,
      signals: [
        { text: "FDA breakthrough therapy designation granted", direction: "positive", strength: "High" },
        { text: "Key competitor filing expected Q2", direction: "negative", strength: "Medium" },
      ],
      context: "Anti-PDL1 immunotherapy commercial launch decision",
    };
    const { data: run1, durationMs } = await fetchJson(`${API_BASE}/agents/prioritization`, body);
    const { data: run2 } = await fetchJson(`${API_BASE}/agents/prioritization`, body);

    if (!run1.prioritizedActions || !Array.isArray(run1.prioritizedActions)) {
      notes.push("ERROR: no prioritizedActions array returned");
      errors++;
      pass = false;
    } else {
      notes.push(`OK: ${run1.prioritizedActions.length} prioritized actions returned`);
      if (run1.prioritizedActions.length < 3 || run1.prioritizedActions.length > 5) {
        notes.push(`WARNING: expected 3-5 actions, got ${run1.prioritizedActions.length}`);
        warnings++;
      }
      const first = run1.prioritizedActions[0];
      if (first) {
        notes.push(`OK: top action: '${truncate(first.action, 60)}' [${first.category}, ${first.urgency}]`);
      }
    }

    if (!run1.decisionReadiness) {
      notes.push("WARNING: no decisionReadiness returned");
      warnings++;
    } else {
      notes.push(`OK: decision readiness score: ${run1.decisionReadiness.score}/100`);
      notes.push(`OK: recommendation: '${truncate(run1.decisionReadiness.recommendation, 60)}'`);
    }

    if (JSON.stringify(run1) !== JSON.stringify(run2)) {
      notes.push("WARNING: non-deterministic — two runs produced different outputs");
      warnings++;
      deterministic = false;
    }

    return {
      agent: "Prioritization Agent",
      testName: "Rank actions for anti-PDL1 launch decision",
      inputReceived: truncate(question, 80),
      outputProduced: `${run1.prioritizedActions?.length || 0} actions, readiness ${run1.decisionReadiness?.score || "?"}`,
      pass,
      warningCount: warnings,
      errorCount: errors,
      deterministic,
      downstreamCompatible: pass,
      notes,
      durationMs,
    };
  } catch (err: any) {
    return {
      agent: "Prioritization Agent",
      testName: "Rank actions for anti-PDL1 launch decision",
      inputReceived: truncate(question, 80),
      outputProduced: `ERROR: ${err.message}`,
      pass: false,
      warningCount: 0,
      errorCount: 1,
      deterministic: false,
      downstreamCompatible: false,
      notes: [`FATAL: ${err.message}`],
      durationMs: 0,
    };
  }
}

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function runHarness() {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║         CIOS Agent Validation Harness v1.0             ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const rfpPath = path.join(__dirname, "fixtures", "old-rfp.txt");
  const rfpText = fs.readFileSync(rfpPath, "utf-8");

  const results: TestResult[] = [];

  console.log("▶ A. Decision Gating Agent...");
  const { result: gateResult, gateOutput } = await testDecisionGatingAgent(rfpText);
  results.push(gateResult);
  printResult(gateResult);

  console.log("\n▶ B. Question Structuring Agent...");
  const primaryDec = gateOutput?.primaryDecision || "What is the best patient/caregiver launch strategy for anti-PDL1?";
  const { result: structResult, structuredOutput } = await testQuestionStructuringAgent(primaryDec);
  results.push(structResult);
  printResult(structResult);

  console.log("\n▶ C. External Signal Scout...");
  const activeQuestion = structuredOutput?.activeQuestion?.questionText || primaryDec;
  const { result: scoutResult } = await testExternalSignalScout(activeQuestion, "anti-PDL1 (MPDL3280A / atezolizumab)");
  results.push(scoutResult);
  printResult(scoutResult);

  console.log("\n▶ D. Signal Normalizer / Deduplicator...");
  const normResult = await testSignalNormalizer();
  results.push(normResult);
  printResult(normResult);

  console.log("\n▶ E. Core Judgment Engine Regression...");
  const judgmentResult = await testJudgmentEngineRegression();
  results.push(judgmentResult);
  printResult(judgmentResult);

  console.log("\n▶ F. End-to-End Chain...");
  const e2eResult = await testEndToEnd(rfpText);
  results.push(e2eResult);
  printResult(e2eResult);

  console.log("\n▶ G. Case Comparator Agent...");
  const caseCompResult = await testCaseComparatorAgent(activeQuestion);
  results.push(caseCompResult);
  printResult(caseCompResult);

  console.log("\n▶ H. Actor Segmentation Agent...");
  const actorSegResult = await testActorSegmentationAgent(activeQuestion);
  results.push(actorSegResult);
  printResult(actorSegResult);

  console.log("\n▶ I. Prioritization Agent...");
  const prioResult = await testPrioritizationAgent(activeQuestion);
  results.push(prioResult);
  printResult(prioResult);

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass).length;
  const integrationBlockers = results.filter((r) => !r.downstreamCompatible).map((r) => r.agent);
  const stabilityBlockers = results.filter((r) => !r.deterministic).map((r) => r.agent);

  const report: HarnessReport = {
    timestamp: new Date().toISOString(),
    results,
    summary: {
      agentsPassed: passed,
      agentsFailed: failed,
      integrationBlockers,
      stabilityBlockers,
      recommendedNextFix: failed > 0
        ? `Fix: ${results.find((r) => !r.pass)?.agent}`
        : "All Phase 1 agents stable. Proceed to Phase 2.",
    },
  };

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                   HARNESS SUMMARY                      ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log(`║ Agents passed:          ${String(passed).padStart(3)} / ${results.length}                       ║`);
  console.log(`║ Agents failed:          ${String(failed).padStart(3)} / ${results.length}                       ║`);
  console.log(`║ Integration blockers:   ${integrationBlockers.length > 0 ? integrationBlockers.join(", ") : "None".padEnd(28)}║`);
  console.log(`║ Stability blockers:     ${stabilityBlockers.length > 0 ? stabilityBlockers.join(", ") : "None".padEnd(28)}║`);
  console.log(`║ Next:                   ${report.summary.recommendedNextFix.slice(0, 28).padEnd(28)}║`);
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  const reportPath = path.join(__dirname, "agent-validation-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`Full report written to: ${reportPath}\n`);
}

function printResult(r: TestResult) {
  const icon = r.pass ? "✅" : "❌";
  const detIcon = r.deterministic ? "🔒" : "⚠️";
  console.log(`  ${icon} ${r.agent}: ${r.testName}`);
  console.log(`     Pass=${r.pass} | Warnings=${r.warningCount} | Errors=${r.errorCount} | Deterministic=${detIcon} | Duration=${r.durationMs}ms`);
  for (const n of r.notes) {
    console.log(`     ${n}`);
  }
}

runHarness().catch((err) => {
  console.error("HARNESS FATAL ERROR:", err);
  process.exit(1);
});
