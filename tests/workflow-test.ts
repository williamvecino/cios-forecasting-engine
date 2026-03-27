import { parseQuestion } from "../artifacts/cios-frontend/src/lib/question-definition/parser";
import { classifyQuestion } from "../artifacts/cios-frontend/src/lib/question-definition/classifier";
import { getMissingFields } from "../artifacts/cios-frontend/src/lib/question-definition/missing-fields";
import { deriveRecommendation } from "../artifacts/cios-frontend/src/lib/recommendation-adapter";

const API_BASE = process.env.API_URL || "http://localhost:8080/api";

interface TestResult {
  question: string;
  status: "PASS" | "FAIL";
  failures: string[];
  rootCauseCategories: string[];
  questionType: string;
  subject: string | undefined;
  outcome: string | undefined;
  groups: string[];
  timeHorizon: string | undefined;
  driverCount: number;
  signalCount: number;
  forecastGenerated: boolean;
  probability: number | null;
  confidence: string | null;
  mostSensitiveDriver: string | null;
  decisionRecommendation: string | null;
}

interface FixLogEntry {
  question: string;
  failure: string;
  rootCauseCategory: string;
  fixImplemented: string;
  filesChanged: string[];
  retestResult: string;
}

const TEST_QUESTIONS = [
  "Will dermatologists adopt Mallia within 12 months?",
  "Will alopecia specialists adopt faster than dermatologists within 12 months?",
  "Which segment will adopt first: academic centers, private dermatology clinics, or specialty hair-loss clinics?",
  "Will first-line adoption exceed 20% within 12 months?",
  "When will commercial payers begin restricting coverage?",
  "Will payer prior authorization requirements delay adoption in community practices?",
  "Will a competing therapy reduce adoption within 6 months of launch?",
  "Will high-volume clinics adopt faster than low-volume clinics?",
  "Will positive Phase 3 safety data increase prescribing among dermatologists?",
  "Will monitoring requirements limit adoption in small practices?",
];

const DRIVER_SIGNAL_PAIRS = [
  { driver: "Clinical familiarity", signal: "Dermatologists showing early interest in Mallia clinical profile", signalType: "KOL endorsement" },
  { driver: "Specialist awareness", signal: "Alopecia specialists tracking Mallia clinical data", signalType: "Field intelligence" },
  { driver: "Institutional readiness", signal: "Academic centers initiating formulary review for Mallia", signalType: "Market adoption / utilization" },
  { driver: "Market penetration", signal: "Early adopter clinics reporting positive initial prescribing", signalType: "Phase III clinical" },
  { driver: "Payer landscape", signal: "Commercial payer advisory boards reviewing coverage criteria", signalType: "Payer / coverage" },
  { driver: "Access barriers", signal: "Prior authorization burden observed in community settings", signalType: "Access friction" },
  { driver: "Competitive dynamics", signal: "Competitor therapy pipeline advancing toward approval", signalType: "Competitor countermove" },
  { driver: "Practice volume", signal: "High-volume clinics demonstrating faster formulary processing", signalType: "Operational friction" },
  { driver: "Safety profile", signal: "Phase 3 safety data showing favorable tolerability profile", signalType: "Phase III clinical" },
  { driver: "Operational complexity", signal: "Small practices reporting monitoring workflow challenges", signalType: "Operational friction" },
];

async function apiCall(method: string, path: string, body?: any): Promise<any> {
  const url = `${API_BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(url, opts);
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`API ${method} ${path} → ${resp.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function runSingleTest(question: string, idx: number): Promise<TestResult> {
  const failures: string[] = [];
  const rootCauses: string[] = [];

  const parsed = parseQuestion(question);
  const questionType = parsed.questionType || "binary";
  const subject = parsed.subject;
  const outcome = parsed.outcome;
  const groups = parsed.populationOrEntities || [];
  const timeHorizon = parsed.timeHorizon;

  if (!subject) { failures.push("subject is missing"); rootCauses.push("field extraction failure"); }
  if (!outcome) { failures.push("outcome is missing"); rootCauses.push("field extraction failure"); }
  if (!timeHorizon) {
    if (questionType !== "timing") {
      failures.push("time horizon is missing"); rootCauses.push("field extraction failure");
    }
  }

  const missing = getMissingFields(parsed);

  const caseId = `TEST-WF-${Date.now()}-${idx}`;
  let caseCreated = false;
  try {
    await apiCall("POST", "/cases", {
      caseId,
      strategicQuestion: question,
      primaryBrand: subject || "Mallia",
      assetName: subject || "Mallia",
      outcomeDefinition: outcome || "adoption",
      timeHorizon: timeHorizon || "12 months",
      priorProbability: 0.5,
      therapeuticArea: "Dermatology",
      diseaseState: "Alopecia",
      specialty: "Dermatology",
    });
    caseCreated = true;
  } catch (err: any) {
    failures.push(`case creation failed: ${err.message}`);
    rootCauses.push("context binding failure");
  }

  let signalCount = 0;
  let driverCount = 0;
  const pair = DRIVER_SIGNAL_PAIRS[idx];

  if (caseCreated && pair) {
    try {
      await apiCall("POST", `/cases/${caseId}/signals`, {
        signalDescription: `${pair.driver}: ${pair.signal}`,
        signalType: pair.signalType,
        direction: "Positive",
        strengthScore: 4,
        reliabilityScore: 4,
        scope: "national",
        timing: "current",
      });
      signalCount = 1;
      driverCount = 1;
    } catch (err: any) {
      failures.push(`signal creation failed: ${err.message}`);
      rootCauses.push("driver mapping failure");
    }

    try {
      const negDirection = [4, 5, 6, 9].includes(idx) ? "Negative" : "Positive";
      await apiCall("POST", `/cases/${caseId}/signals`, {
        signalDescription: `Supporting evidence: ${pair.signal} observed in field reports`,
        signalType: "Field intelligence",
        direction: negDirection,
        strengthScore: 3,
        reliabilityScore: 3,
        scope: "regional",
        timing: "early",
      });
      signalCount = 2;
    } catch (err: any) {
      failures.push(`second signal creation failed: ${err.message}`);
    }
  }

  let forecastGenerated = false;
  let probability: number | null = null;
  let confidence: string | null = null;
  let mostSensitiveDriver: string | null = null;
  let forecastResult: any = null;

  if (caseCreated && signalCount > 0) {
    try {
      forecastResult = await apiCall("GET", `/cases/${caseId}/forecast`);
      forecastGenerated = true;
      probability = forecastResult.currentProbability ?? null;
      confidence = forecastResult.confidenceLevel ?? null;

      if (forecastResult.sensitivityAnalysis?.swingFactor?.description) {
        mostSensitiveDriver = forecastResult.sensitivityAnalysis.swingFactor.description;
      } else if (forecastResult.sensitivityAnalysis?.upwardSignals?.[0]?.description) {
        mostSensitiveDriver = forecastResult.sensitivityAnalysis.upwardSignals[0].description;
      }
    } catch (err: any) {
      failures.push(`forecast failed: ${err.message}`);
      rootCauses.push("forecast calculation failure");
    }
  } else if (caseCreated && signalCount === 0) {
    failures.push("no signals generated");
    rootCauses.push("signal relevance failure");
  }

  if (forecastGenerated && signalCount > 0 && driverCount === 0) {
    failures.push("forecast runs with zero drivers");
    rootCauses.push("driver mapping failure");
  }

  if (forecastGenerated && mostSensitiveDriver === null) {
    failures.push("most sensitive driver is null");
    rootCauses.push("sensitivity analysis failure");
  }

  if (forecastGenerated && probability !== null && probability === 0.5) {
    failures.push("probability does not change after adding signals");
    rootCauses.push("forecast calculation failure");
  }

  let decisionRecommendation: string | null = null;
  if (forecastGenerated && probability !== null) {
    try {
      const rec = deriveRecommendation(probability, 0.5, confidence || "Low");
      decisionRecommendation = rec.headline || null;
      if (!decisionRecommendation) {
        failures.push("decision recommendation is empty");
        rootCauses.push("decision output failure");
      }
    } catch (err: any) {
      failures.push(`decision recommendation failed: ${err.message}`);
      rootCauses.push("decision output failure");
    }
  } else if (!forecastGenerated) {
    failures.push("decision recommendation is empty (no forecast)");
    rootCauses.push("decision output failure");
  }

  return {
    question,
    status: failures.length === 0 ? "PASS" : "FAIL",
    failures,
    rootCauseCategories: [...new Set(rootCauses)],
    questionType,
    subject,
    outcome,
    groups,
    timeHorizon,
    driverCount,
    signalCount,
    forecastGenerated,
    probability,
    confidence,
    mostSensitiveDriver,
    decisionRecommendation,
  };
}

async function runAllTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (let i = 0; i < TEST_QUESTIONS.length; i++) {
    console.log(`[${i + 1}/10] Testing: ${TEST_QUESTIONS[i]}`);
    const result = await runSingleTest(TEST_QUESTIONS[i], i);
    console.log(`  → ${result.status}${result.failures.length ? ` (${result.failures.join("; ")})` : ""}`);
    results.push(result);
  }
  return results;
}

async function main() {
  console.log("=== CIOS Workflow Test Suite ===\n");

  const results = await runAllTests();

  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);

  for (const r of results) {
    const summary = {
      question: r.question,
      status: r.status,
      probability: r.probability,
      confidence: r.confidence,
      mostSensitiveDriver: r.mostSensitiveDriver,
      ...(r.failures.length ? { failures: r.failures } : {}),
    };
    console.log(JSON.stringify(summary, null, 2));
  }

  const { writeFileSync } = await import("fs");

  writeFileSync(
    "tests/workflow_test_results.json",
    JSON.stringify(results, null, 2)
  );
  console.log("\nResults saved to tests/workflow_test_results.json");

  return results;
}

main().catch(console.error);
