import * as fs from "fs";
import * as path from "path";

const API = process.env.API_URL || "http://localhost:8080";
const DIR = path.join(path.dirname(new URL(import.meta.url).pathname), "fixtures");

interface Result {
  name: string;
  passed: boolean;
  ms: number;
  confidence?: string;
  low?: boolean;
  qText?: string;
  signals?: number;
  error?: string;
}

const results: Result[] = [];

async function testImport(name: string, body: Record<string, string>): Promise<void> {
  const start = Date.now();
  try {
    const res = await fetch(`${API}/api/import-project`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ms = Date.now() - start;
    const ok = res.status === 200 && ((data.question?.text) || (data.signals?.length > 0));
    const r: Result = {
      name, passed: ok, ms,
      confidence: data.confidence,
      low: data.lowConfidence,
      qText: data.question?.text?.slice(0, 80),
      signals: data.signals?.length || 0,
      error: ok ? undefined : (data.error || `status=${res.status}`),
    };
    results.push(r);
    const icon = ok ? "✓" : "✗";
    const lc = data.lowConfidence ? " ⚠LOW" : "";
    console.log(`  ${icon} ${name} (${ms}ms) conf=${data.confidence || "N/A"}${lc} signals=${data.signals?.length || 0}`);
    if (!ok) console.log(`    ERROR: ${r.error}`);
  } catch (e: any) {
    results.push({ name, passed: false, ms: Date.now() - start, error: e.message });
    console.log(`  ✗ ${name} ERROR: ${e.message}`);
  }
}

async function testAnalyze(name: string, body: { text?: string; question?: string }): Promise<void> {
  const start = Date.now();
  try {
    const res = await fetch(`${API}/api/import-project/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const ms = Date.now() - start;
    const ok = res.status === 200 && (data.signals?.length > 0);
    const r: Result = {
      name: `[analyze] ${name}`, passed: ok, ms,
      low: data.lowConfidence,
      signals: data.signals?.length || 0,
      error: ok ? undefined : (data.error || `status=${res.status}`),
    };
    results.push(r);
    const icon = ok ? "✓" : "✗";
    const lc = data.lowConfidence ? " ⚠LOW" : "";
    console.log(`  ${icon} [analyze] ${name} (${ms}ms) signals=${data.signals?.length || 0}${lc}`);
    if (!ok) console.log(`    ERROR: ${r.error}`);
  } catch (e: any) {
    results.push({ name: `[analyze] ${name}`, passed: false, ms: Date.now() - start, error: e.message });
    console.log(`  ✗ [analyze] ${name} ERROR: ${e.message}`);
  }
}

async function run() {
  console.log("╔═══════════════════════════════════════════════════════╗");
  console.log("║   EXTRACTION VALIDATION — Edge Cases + Analyze       ║");
  console.log("╚═══════════════════════════════════════════════════════╝\n");

  console.log("--- Edge cases (import-project) ---");
  await testImport("empty text", { text: "" });
  await testImport("single word", { text: "oncology" });
  await testImport("empty file", {
    fileBase64: Buffer.from("").toString("base64"),
    fileName: "empty.txt",
    mimeType: "text/plain",
  });
  await testImport("gibberish file", {
    fileBase64: fs.readFileSync(path.join(DIR, "gibberish.txt")).toString("base64"),
    fileName: "gibberish.txt",
    mimeType: "text/plain",
  });

  console.log("\n--- Analyze endpoint ---");
  await testAnalyze("clean text + question", {
    text: fs.readFileSync(path.join(DIR, "clean-text.txt"), "utf-8"),
    question: "Will ARIKAYCE achieve 80% formulary coverage?",
  });
  await testAnalyze("messy email + question", {
    text: fs.readFileSync(path.join(DIR, "messy-email.txt"), "utf-8"),
    question: "Will PD-L1 strategy achieve competitive positioning?",
  });
  await testAnalyze("minimal content", { text: "Drug launch Q3" });
  await testAnalyze("gibberish", { text: "asdfghjkl zxcvbnm qwerty" });

  console.log("\n═══════════════════════════════════════════════════════");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`Total: ${results.length}  Passed: ${passed}  Failed: ${failed}`);

  const deadEnds = results.filter((r) => !r.passed);
  if (deadEnds.length > 0) {
    console.log("\n⚠ FAILURES:");
    for (const r of deadEnds) console.log(`  ${r.name}: ${r.error}`);
  } else {
    console.log("\n✓ All paths produce output — no workflow dead-ends.");
  }

  const lowConf = results.filter((r) => r.low);
  if (lowConf.length > 0) {
    console.log(`\nLow confidence drafts (${lowConf.length}): all produced cases ✓`);
  }
  console.log("");

  if (failed > 0) process.exit(1);
}

run().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
