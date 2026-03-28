import http from "http";
import fs from "fs";

interface TestCase {
  name: string;
  inputType: "text" | "pdf";
  text?: string;
  pdfPath?: string;
  expectedArchetype: string;
  forbiddenArchetype?: string;
  expectedEnvironment?: string;
  questionMustContain?: string[];
  questionMustNotContain?: string[];
}

const TEST_CASES: TestCase[] = [
  {
    name: "Oncology Launch RFP (Roche PD-L1)",
    inputType: "pdf",
    pdfPath: "/home/runner/workspace/attached_assets/Roche_PD-L1_RFP_(2)_1774712449217.pdf",
    expectedArchetype: "Launch Strategy",
    forbiddenArchetype: "Vendor Selection",
    expectedEnvironment: "Commercial Launch",
    questionMustContain: ["launch"],
    questionMustNotContain: ["vendor", "agency", "hire"],
  },
  {
    name: "Digital Transformation RFP",
    inputType: "text",
    text: `REQUEST FOR PROPOSAL: Enterprise Digital Transformation
    
    ACME Pharmaceuticals seeks a strategic partner to implement a company-wide digital transformation initiative. The project encompasses:
    
    1. EHR Integration: Deploy and integrate Veeva CRM across 15 regional offices
    2. Data Lake Implementation: Consolidate clinical, commercial, and operational data into a unified analytics platform
    3. AI/ML Pipeline: Build predictive models for patient identification and HCP targeting
    4. Change Management: Train 2,000+ field representatives on new digital tools
    
    Timeline: 18-month phased deployment starting Q3 2025
    Budget: $45M approved, with potential $15M expansion for Phase 2
    
    Evaluation criteria:
    - Technical architecture and scalability (30%)
    - Implementation methodology and timeline (25%)
    - Change management approach (20%)
    - Cost and value proposition (15%)
    - Team qualifications (10%)
    
    The primary objective is achieving 85% user adoption within 12 months of go-live and demonstrating measurable improvements in field force effectiveness.`,
    expectedArchetype: "Capability Gap",
    forbiddenArchetype: "Vendor Selection",
    questionMustNotContain: ["vendor", "agency", "partner selection"],
  },
  {
    name: "Market Research Brief",
    inputType: "text",
    text: `MARKET RESEARCH BRIEF: Competitive Landscape Analysis — JAK Inhibitors in Atopic Dermatitis
    
    Background: The JAK inhibitor market for atopic dermatitis is rapidly evolving. Dupixent (dupilumab) currently holds 68% market share among biologics. Three new JAK inhibitors are expected to launch within 18 months:
    
    - Abrocitinib (Pfizer) — approved, gaining traction with dermatologists
    - Upadacitinib (AbbVie) — strong efficacy data, oral formulation advantage
    - Baricitinib (Lilly) — approved in EU, US filing pending
    
    Our product (JAK-X) has Phase 3 data showing superior EASI-75 scores vs. placebo and competitive positioning vs. existing JAK inhibitors. Key differentiator: once-weekly dosing vs. daily for competitors.
    
    Questions to address:
    1. What is the realistic market share capture for JAK-X at 12 and 24 months post-launch?
    2. How will the safety narrative (JAK class warnings) affect prescribing behavior?
    3. Which HCP segments will be early adopters vs. resistant?
    4. What pricing corridor will optimize access while maintaining share?`,
    expectedArchetype: "Competitive Positioning",
    questionMustContain: ["market", "share"],
    questionMustNotContain: ["vendor", "agency"],
  },
  {
    name: "Clinical Trial Recruitment Plan",
    inputType: "text",
    text: `CLINICAL TRIAL RECRUITMENT STRATEGY — Protocol XYZ-301
    
    Study: Phase 3 randomized controlled trial of compound XYZ-789 in treatment-resistant depression (TRD)
    Target enrollment: 1,200 patients across 85 sites in North America and Europe
    Current status: 340 patients enrolled (28% of target) at Month 8 of 18-month enrollment window
    
    Recruitment challenges identified:
    - Strict inclusion criteria limiting eligible population (estimated 15% screen failure rate, actual 38%)
    - Competing trials from Janssen (esketamine extension) and Sage (zuranolone) drawing from same patient pool
    - Site activation delays: 22 of 85 sites not yet enrolling
    - Patient reluctance due to TRD population characteristics (treatment fatigue, skepticism)
    
    Proposed interventions:
    1. Expand geographic footprint: Add 20 sites in underrepresented regions
    2. Digital recruitment: Deploy social media and EHR-triggered outreach
    3. Protocol amendment: Relax 2 inclusion criteria to reduce screen failure to <25%
    4. Site performance management: Implement enrollment dashboards and monthly site reviews
    
    Risk: If enrollment target not met by Month 14, study timeline shifts 6+ months, jeopardizing competitive positioning against zuranolone.`,
    expectedArchetype: "Capability Gap",
    questionMustNotContain: ["vendor", "agency"],
  },
  {
    name: "Competitive Response Memo",
    inputType: "text",
    text: `CONFIDENTIAL — COMPETITIVE RESPONSE MEMO
    
    TO: US Commercial Leadership
    FROM: Competitive Intelligence
    DATE: March 2025
    RE: Immediate competitive threat — Competitor X filing for accelerated approval in NSCLC 2L
    
    SITUATION:
    Competitor X has filed for accelerated approval of their bispecific antibody (CX-401) in second-line NSCLC. FDA granted Priority Review with a PDUFA date of September 2025. This is 9 months ahead of our expected approval for our competing therapy (OUR-201).
    
    IMPACT ASSESSMENT:
    - If approved, CX-401 will be first-to-market in the bispecific NSCLC space
    - Early KOL feedback suggests strong interest based on Phase 2 ORR of 42% (our Phase 3 shows 38% but with better duration of response)
    - CX-401 pricing expected at $18,000/month — aggressive for the class
    - 60% of target oncologists say they will try CX-401 within 6 months of launch
    
    RECOMMENDED RESPONSE:
    1. Accelerate our Phase 3 data publication — target ASCO 2025 late-breaking abstract
    2. Pre-position duration of response narrative with KOLs
    3. Prepare competitive sell sheets for field force
    4. Engage payer strategy team to differentiate on total cost of care
    
    DECISION REQUIRED: Do we accelerate our filing timeline by 3 months (risk: incomplete safety database) or maintain current timeline and compete on data strength?`,
    expectedArchetype: "Competitive Positioning",
    questionMustContain: ["compet"],
    questionMustNotContain: ["vendor", "agency"],
  },
  {
    name: "Operational Readiness Checklist",
    inputType: "text",
    text: `LAUNCH READINESS ASSESSMENT — PRODUCT ABC
    
    Status: T-minus 90 days to PDUFA date
    
    SUPPLY CHAIN (Status: AMBER)
    ☑ API manufacturing validated at Scale
    ☑ Drug product manufacturing — 3 commercial batches complete
    ☐ Packaging line qualification — delayed 2 weeks, new completion: April 15
    ☐ Cold chain distribution network — 12 of 18 specialty pharmacies contracted
    ☐ Safety stock target: 6 months — current inventory: 3.5 months
    
    COMMERCIAL READINESS (Status: GREEN)
    ☑ Sales force hired and trained (180 reps across 6 regions)
    ☑ KOL advisory boards complete (3 rounds)
    ☑ Medical education materials approved
    ☐ Payer contracts: 2 of top 5 PBMs signed, 3 in negotiation
    
    MEDICAL AFFAIRS (Status: GREEN)
    ☑ Launch publication plan: 8 manuscripts in pipeline
    ☑ MSL field deployment: 45 MSLs covering top 200 accounts
    
    REGULATORY (Status: RED)
    ☐ FDA information request outstanding — response due April 1
    ☐ REMS program design — pending advisory committee input
    
    OVERALL ASSESSMENT: Conditional GO with 3 critical items requiring resolution before launch commit decision.`,
    expectedArchetype: "Launch Strategy",
    questionMustNotContain: ["vendor", "agency"],
  },
];

function importProject(body: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "localhost",
        port: 8080,
        path: "/api/import-project",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let d = "";
        res.on("data", (c: string) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(new Error(`Parse error: ${d.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function runTest(tc: TestCase): Promise<{ pass: boolean; details: string }> {
  let body: string;

  if (tc.inputType === "pdf" && tc.pdfPath) {
    const pdfData = fs.readFileSync(tc.pdfPath);
    body = JSON.stringify({
      fileBase64: pdfData.toString("base64"),
      fileName: tc.pdfPath.split("/").pop(),
      mimeType: "application/pdf",
    });
  } else {
    body = JSON.stringify({ text: tc.text });
  }

  const result = await importProject(body);
  const failures: string[] = [];
  const questionLower = (result.question?.text || "").toLowerCase();
  const archetype = result.decisionArchetype?.primary || "MISSING";

  if (archetype !== tc.expectedArchetype) {
    failures.push(`Archetype: expected "${tc.expectedArchetype}", got "${archetype}"`);
  }

  if (tc.forbiddenArchetype && archetype === tc.forbiddenArchetype) {
    failures.push(`Forbidden archetype "${tc.forbiddenArchetype}" was assigned`);
  }

  if (tc.expectedEnvironment && result.environment?.label !== tc.expectedEnvironment) {
    failures.push(`Environment: expected "${tc.expectedEnvironment}", got "${result.environment?.label}"`);
  }

  if (tc.questionMustContain) {
    for (const term of tc.questionMustContain) {
      if (!questionLower.includes(term.toLowerCase())) {
        failures.push(`Question missing required term "${term}": "${result.question?.text}"`);
      }
    }
  }

  if (tc.questionMustNotContain) {
    for (const term of tc.questionMustNotContain) {
      if (questionLower.includes(term.toLowerCase())) {
        failures.push(`Question contains forbidden term "${term}": "${result.question?.text}"`);
      }
    }
  }

  if (!result.question?.text || result.question.text.length < 20) {
    failures.push(`Question too short or missing: "${result.question?.text}"`);
  }

  if (!result.signals || result.signals.length === 0) {
    failures.push("No signals extracted");
  }

  const details = [
    `Question: ${result.question?.text}`,
    `Archetype: ${archetype} (expected: ${tc.expectedArchetype})`,
    `Environment: ${result.environment?.label}`,
    `Framing: ${result.decisionArchetype?.framing}`,
    `Guardrail: ${result.decisionArchetype?.guardrailApplied ? result.decisionArchetype.guardrailReason : "none"}`,
    `Signals: ${result.signals?.length}`,
    `Confidence: ${result.confidence}`,
    failures.length > 0 ? `FAILURES:\n  ${failures.join("\n  ")}` : "ALL CHECKS PASSED",
  ].join("\n  ");

  return { pass: failures.length === 0, details };
}

async function main() {
  console.log("=== DECISION CLASSIFICATION VALIDATION SUITE ===\n");

  let passed = 0;
  let failed = 0;
  const results: any[] = [];

  for (const tc of TEST_CASES) {
    console.log(`--- ${tc.name} ---`);
    try {
      const result = await runTest(tc);
      results.push({ name: tc.name, ...result });
      if (result.pass) {
        console.log(`  ✓ PASS`);
        passed++;
      } else {
        console.log(`  ✗ FAIL`);
        failed++;
      }
      console.log(`  ${result.details}\n`);
    } catch (e: any) {
      console.log(`  ✗ ERROR: ${e.message}\n`);
      failed++;
      results.push({ name: tc.name, pass: false, details: `ERROR: ${e.message}` });
    }
  }

  console.log(`\n=== RESULTS: ${passed}/${passed + failed} passed ===`);

  fs.writeFileSync(
    "/home/runner/workspace/artifacts/api-server/src/tests/decision-classification-results.json",
    JSON.stringify({ timestamp: new Date().toISOString(), passed, failed, total: passed + failed, results }, null, 2),
  );
}

main().catch(console.error);
