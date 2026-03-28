import * as fs from "fs";
import * as path from "path";

const API = process.env.API_URL || "http://localhost:8080";
const FIXTURES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

interface TestResult {
  name: string;
  inputType: string;
  endpoint: string;
  passed: boolean;
  checks: Record<string, { passed: boolean; detail: string }>;
  responseTime: number;
  confidence?: string;
  lowConfidence?: boolean;
  error?: string;
}

const results: TestResult[] = [];

function fileToBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString("base64");
}

function getMimeType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const map: Record<string, string> = {
    txt: "text/plain",
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    csv: "text/csv",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    md: "text/plain",
  };
  return map[ext] || "application/octet-stream";
}

function grade(checks: Record<string, { passed: boolean; detail: string }>): boolean {
  const criticalChecks = [
    "no_error_response",
    "has_question_or_signals",
    "has_confidence",
    "no_workflow_deadend",
  ];
  return criticalChecks.every((c) => checks[c]?.passed !== false);
}

async function testImportProject(
  name: string,
  inputType: string,
  body: Record<string, string>,
): Promise<TestResult> {
  const start = Date.now();
  const checks: Record<string, { passed: boolean; detail: string }> = {};

  try {
    const res = await fetch(`${API}/api/import-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const elapsed = Date.now() - start;
    const status = res.status;
    const data = await res.json().catch(() => null);

    checks["no_error_response"] = {
      passed: status === 200,
      detail: status === 200 ? `HTTP 200` : `HTTP ${status}: ${data?.error || "unknown"}`,
    };

    if (status !== 200 || !data) {
      checks["has_question_or_signals"] = { passed: false, detail: "No response body" };
      checks["has_confidence"] = { passed: false, detail: "No response body" };
      checks["no_workflow_deadend"] = { passed: false, detail: `Returned ${status} — workflow blocked` };
      const allPassed = grade(checks);
      return { name, inputType, endpoint: "/import-project", passed: allPassed, checks, responseTime: elapsed, error: data?.error };
    }

    checks["has_question"] = {
      passed: !!data.question && !!data.question.text,
      detail: data.question?.text ? `"${data.question.text.slice(0, 80)}..."` : "No question returned",
    };

    checks["question_has_subject"] = {
      passed: !!data.question?.subject,
      detail: data.question?.subject || "Missing",
    };

    checks["has_signals"] = {
      passed: Array.isArray(data.signals) && data.signals.length > 0,
      detail: `${data.signals?.length || 0} signals`,
    };

    checks["signals_have_direction"] = {
      passed: (data.signals || []).every((s: any) => ["positive", "negative", "neutral"].includes(s.direction)),
      detail: (data.signals || []).length > 0 ? "All signals have valid direction" : "No signals to validate",
    };

    checks["signals_have_importance"] = {
      passed: (data.signals || []).every((s: any) => ["High", "Medium", "Low"].includes(s.importance)),
      detail: (data.signals || []).length > 0 ? "All signals have valid importance" : "No signals to validate",
    };

    checks["has_question_or_signals"] = {
      passed: (!!data.question?.text) || (Array.isArray(data.signals) && data.signals.length > 0),
      detail: "At least question or signals present",
    };

    checks["has_confidence"] = {
      passed: !!data.confidence && ["High", "Moderate", "Low"].includes(data.confidence),
      detail: data.confidence || "Missing",
    };

    checks["has_environment"] = {
      passed: !!data.environment?.context && !!data.environment?.label,
      detail: data.environment?.label || "Missing",
    };

    checks["has_missing_signals"] = {
      passed: Array.isArray(data.missingSignals),
      detail: `${data.missingSignals?.length || 0} missing signals`,
    };

    checks["no_workflow_deadend"] = {
      passed: true,
      detail: "Extraction completed without blocking workflow",
    };

    checks["low_confidence_flagged_appropriately"] = {
      passed: data.lowConfidence !== undefined,
      detail: data.lowConfidence ? "Low confidence flagged" : "Normal confidence",
    };

    const allPassed = grade(checks);
    return {
      name, inputType, endpoint: "/import-project", passed: allPassed, checks, responseTime: elapsed,
      confidence: data.confidence, lowConfidence: data.lowConfidence,
    };
  } catch (err: any) {
    return {
      name, inputType, endpoint: "/import-project", passed: false, responseTime: Date.now() - start,
      checks: {
        no_error_response: { passed: false, detail: `Exception: ${err.message}` },
        has_question_or_signals: { passed: false, detail: "Exception thrown" },
        has_confidence: { passed: false, detail: "Exception thrown" },
        no_workflow_deadend: { passed: false, detail: "Exception blocked workflow" },
      },
      error: err.message,
    };
  }
}

async function testAnalyzeEndpoint(
  name: string,
  inputType: string,
  body: { text?: string; filePath?: string; question?: string },
): Promise<TestResult> {
  const start = Date.now();
  const checks: Record<string, { passed: boolean; detail: string }> = {};

  try {
    let res: Response;

    if (body.filePath) {
      const fileBuffer = fs.readFileSync(body.filePath);
      const fileName = path.basename(body.filePath);
      const blob = new Blob([fileBuffer], { type: getMimeType(fileName) });
      const formData = new globalThis.FormData();
      formData.append("file", blob, fileName);
      if (body.question) formData.append("question", body.question);

      res = await fetch(`${API}/api/import-project/analyze`, {
        method: "POST",
        body: formData,
      });
    } else {
      res = await fetch(`${API}/api/import-project/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: body.text, question: body.question }),
      });
    }

    const elapsed = Date.now() - start;
    const status = res.status;
    const data = await res.json().catch(() => null);

    checks["no_error_response"] = {
      passed: status === 200,
      detail: status === 200 ? `HTTP 200` : `HTTP ${status}: ${data?.error || "unknown"}`,
    };

    if (status !== 200 || !data) {
      checks["has_question_or_signals"] = { passed: false, detail: "No response body" };
      checks["has_confidence"] = { passed: true, detail: "N/A for analyze endpoint" };
      checks["no_workflow_deadend"] = { passed: false, detail: `Returned ${status} — workflow blocked` };
      const allPassed = grade(checks);
      return { name, inputType, endpoint: "/analyze", passed: allPassed, checks, responseTime: elapsed, error: data?.error };
    }

    checks["has_signals"] = {
      passed: Array.isArray(data.signals) && data.signals.length > 0,
      detail: `${data.signals?.length || 0} signals`,
    };

    checks["has_question_or_signals"] = {
      passed: Array.isArray(data.signals) && data.signals.length > 0,
      detail: checks["has_signals"].detail,
    };

    checks["has_confidence"] = { passed: true, detail: "N/A for analyze" };

    checks["has_environment"] = {
      passed: !!data.environment?.context,
      detail: data.environment?.label || "Missing",
    };

    checks["no_workflow_deadend"] = {
      passed: true,
      detail: "Extraction completed without blocking workflow",
    };

    const allPassed = grade(checks);
    return {
      name, inputType, endpoint: "/analyze", passed: allPassed, checks, responseTime: elapsed,
      lowConfidence: data.lowConfidence,
    };
  } catch (err: any) {
    return {
      name, inputType, endpoint: "/analyze", passed: false, responseTime: Date.now() - start,
      checks: {
        no_error_response: { passed: false, detail: `Exception: ${err.message}` },
        has_question_or_signals: { passed: false, detail: "Exception thrown" },
        has_confidence: { passed: true, detail: "N/A" },
        no_workflow_deadend: { passed: false, detail: "Exception blocked workflow" },
      },
      error: err.message,
    };
  }
}

async function run() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║       EXTRACTION VALIDATION FRAMEWORK — Test Suite          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const fixtureFiles = fs.readdirSync(FIXTURES_DIR).filter((f) => !f.endsWith(".ts"));
  console.log(`Found ${fixtureFiles.length} fixture files: ${fixtureFiles.join(", ")}\n`);

  console.log("━━━ SECTION 1: /import-project — Full case extraction ━━━\n");

  const importTests: Array<{ name: string; inputType: string; body: Record<string, string> }> = [
    {
      name: "Typed question (clean text)",
      inputType: "typed_question",
      body: { text: "Will ARIKAYCE achieve target formulary placement across top-20 health plans within 12 months given current payer resistance and limited specialty pharmacy network?" },
    },
    {
      name: "Pasted text — clean document",
      inputType: "pasted_text",
      body: { text: fs.readFileSync(path.join(FIXTURES_DIR, "clean-text.txt"), "utf-8") },
    },
    {
      name: "Pasted text — messy email chain",
      inputType: "pasted_text",
      body: { text: fs.readFileSync(path.join(FIXTURES_DIR, "messy-email.txt"), "utf-8") },
    },
    {
      name: "Pasted text — scientific abstract",
      inputType: "pasted_text",
      body: { text: fs.readFileSync(path.join(FIXTURES_DIR, "scientific-abstract.txt"), "utf-8") },
    },
    {
      name: "Pasted text — market research deck",
      inputType: "pasted_text",
      body: { text: fs.readFileSync(path.join(FIXTURES_DIR, "market-research.txt"), "utf-8") },
    },
    {
      name: "Pasted text — old RFP",
      inputType: "pasted_text",
      body: { text: fs.readFileSync(path.join(FIXTURES_DIR, "old-rfp.txt"), "utf-8") },
    },
    {
      name: "File upload — XLSX spreadsheet",
      inputType: "xlsx",
      body: {
        fileBase64: fileToBase64(path.join(FIXTURES_DIR, "spreadsheet-data.xlsx")),
        fileName: "spreadsheet-data.xlsx",
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      },
    },
    {
      name: "File upload — CSV clinical trial data",
      inputType: "csv",
      body: {
        fileBase64: fileToBase64(path.join(FIXTURES_DIR, "csv-data.csv")),
        fileName: "csv-data.csv",
        mimeType: "text/csv",
      },
    },
    {
      name: "Edge case — minimal content (3 words)",
      inputType: "minimal_text",
      body: { text: "Drug launch Q3" },
    },
    {
      name: "Edge case — gibberish input",
      inputType: "gibberish",
      body: { text: "asdfghjkl zxcvbnm qwerty 12345 !@#$%" },
    },
    {
      name: "Edge case — empty text",
      inputType: "empty",
      body: { text: "" },
    },
    {
      name: "Edge case — single word",
      inputType: "minimal_text",
      body: { text: "oncology" },
    },
    {
      name: "File upload — empty file",
      inputType: "empty_file",
      body: {
        fileBase64: fileToBase64(path.join(FIXTURES_DIR, "empty.txt")),
        fileName: "empty.txt",
        mimeType: "text/plain",
      },
    },
    {
      name: "File upload — gibberish file",
      inputType: "gibberish_file",
      body: {
        fileBase64: fileToBase64(path.join(FIXTURES_DIR, "gibberish.txt")),
        fileName: "gibberish.txt",
        mimeType: "text/plain",
      },
    },
  ];

  for (const t of importTests) {
    process.stdout.write(`  Testing: ${t.name}...`);
    const result = await testImportProject(t.name, t.inputType, t.body);
    results.push(result);
    const icon = result.passed ? "✓" : "✗";
    const conf = result.confidence ? ` [${result.confidence}]` : "";
    const lc = result.lowConfidence ? " ⚠LOW" : "";
    console.log(` ${icon} (${result.responseTime}ms)${conf}${lc}`);
    if (!result.passed) {
      for (const [k, v] of Object.entries(result.checks)) {
        if (!v.passed) console.log(`    ✗ ${k}: ${v.detail}`);
      }
    }
  }

  console.log("\n━━━ SECTION 2: /import-project/analyze — Signal extraction ━━━\n");

  const analyzeTests: Array<{ name: string; inputType: string; body: { text?: string; filePath?: string; question?: string } }> = [
    {
      name: "Analyze — clean text with question context",
      inputType: "pasted_text",
      body: {
        text: fs.readFileSync(path.join(FIXTURES_DIR, "clean-text.txt"), "utf-8"),
        question: "Will ARIKAYCE achieve 80% formulary coverage?",
      },
    },
    {
      name: "Analyze — messy email with question context",
      inputType: "pasted_text",
      body: {
        text: fs.readFileSync(path.join(FIXTURES_DIR, "messy-email.txt"), "utf-8"),
        question: "Will PD-L1 strategy achieve competitive positioning?",
      },
    },
    {
      name: "Analyze — scientific abstract",
      inputType: "pasted_text",
      body: {
        text: fs.readFileSync(path.join(FIXTURES_DIR, "scientific-abstract.txt"), "utf-8"),
        question: "Will XYZ-2847 receive regulatory approval for NSCLC?",
      },
    },
    {
      name: "Analyze — XLSX file upload",
      inputType: "xlsx",
      body: {
        filePath: path.join(FIXTURES_DIR, "spreadsheet-data.xlsx"),
        question: "Will DrugA achieve dominant market share?",
      },
    },
    {
      name: "Analyze — CSV file upload",
      inputType: "csv",
      body: {
        filePath: path.join(FIXTURES_DIR, "csv-data.csv"),
        question: "Will clinical trial enrollment targets be met?",
      },
    },
    {
      name: "Analyze — minimal content",
      inputType: "minimal_text",
      body: { text: "Drug launch Q3" },
    },
    {
      name: "Analyze — gibberish input",
      inputType: "gibberish",
      body: { text: "asdfghjkl zxcvbnm qwerty" },
    },
  ];

  for (const t of analyzeTests) {
    process.stdout.write(`  Testing: ${t.name}...`);
    const result = await testAnalyzeEndpoint(t.name, t.inputType, t.body);
    results.push(result);
    const icon = result.passed ? "✓" : "✗";
    const lc = result.lowConfidence ? " ⚠LOW" : "";
    console.log(` ${icon} (${result.responseTime}ms)${lc}`);
    if (!result.passed) {
      for (const [k, v] of Object.entries(result.checks)) {
        if (!v.passed) console.log(`    ✗ ${k}: ${v.detail}`);
      }
    }
  }

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("                      RESULTS SUMMARY");
  console.log("══════════════════════════════════════════════════════════════\n");

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total}  |  Passed: ${passed}  |  Failed: ${failed}\n`);

  const byType: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!byType[r.inputType]) byType[r.inputType] = [];
    byType[r.inputType].push(r);
  }

  console.log("By Input Type:");
  for (const [type, typeResults] of Object.entries(byType)) {
    const tp = typeResults.filter((r) => r.passed).length;
    const tf = typeResults.filter((r) => !r.passed).length;
    console.log(`  ${type}: ${tp}/${typeResults.length} passed${tf > 0 ? ` (${tf} FAILED)` : ""}`);
  }

  console.log("\nBy Endpoint:");
  const byEndpoint: Record<string, TestResult[]> = {};
  for (const r of results) {
    if (!byEndpoint[r.endpoint]) byEndpoint[r.endpoint] = [];
    byEndpoint[r.endpoint].push(r);
  }
  for (const [ep, epResults] of Object.entries(byEndpoint)) {
    const ep_p = epResults.filter((r) => r.passed).length;
    console.log(`  ${ep}: ${ep_p}/${epResults.length} passed`);
  }

  console.log("\nConfidence Distribution (import-project):");
  const confDist: Record<string, number> = {};
  for (const r of results.filter((r) => r.confidence)) {
    confDist[r.confidence!] = (confDist[r.confidence!] || 0) + 1;
  }
  for (const [c, n] of Object.entries(confDist)) {
    console.log(`  ${c}: ${n}`);
  }

  const lowConfResults = results.filter((r) => r.lowConfidence);
  if (lowConfResults.length > 0) {
    console.log(`\nLow Confidence Extractions (${lowConfResults.length}):`);
    for (const r of lowConfResults) {
      const stillPassed = r.passed ? "✓ produced draft case" : "✗ FAILED to produce draft case";
      console.log(`  ${r.name}: ${stillPassed}`);
    }
  }

  if (failed > 0) {
    console.log("\n⚠ FAILED TESTS:");
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`\n  ${r.name} [${r.endpoint}]`);
      for (const [k, v] of Object.entries(r.checks)) {
        if (!v.passed) console.log(`    ✗ ${k}: ${v.detail}`);
      }
    }
  }

  const deadEnds = results.filter((r) => r.checks["no_workflow_deadend"]?.passed === false);
  if (deadEnds.length > 0) {
    console.log("\n🚨 WORKFLOW DEAD-ENDS DETECTED:");
    for (const r of deadEnds) {
      console.log(`  ${r.name}: ${r.checks["no_workflow_deadend"].detail}`);
    }
  } else {
    console.log("\n✓ No workflow dead-ends detected — all paths produce output.");
  }

  console.log("\n══════════════════════════════════════════════════════════════\n");

  const outputPath = path.join(path.dirname(FIXTURES_DIR), "extraction-validation-results.json");
  fs.writeFileSync(outputPath, JSON.stringify({ timestamp: new Date().toISOString(), summary: { total, passed, failed }, results }, null, 2));
  console.log(`Full results written to: ${outputPath}`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});
