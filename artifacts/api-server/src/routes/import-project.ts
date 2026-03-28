import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";

const router = Router();

interface ImportProjectRequest {
  text?: string;
  fileBase64?: string;
  fileName?: string;
  mimeType?: string;
}

async function extractTextFromFile(
  base64: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");

  if (
    mimeType === "application/pdf" ||
    fileName.toLowerCase().endsWith(".pdf")
  ) {
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text.slice(0, 15000);
    } catch (e) {
      console.error("PDF parse failed:", e);
      return "";
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    fileName.toLowerCase().endsWith(".docx")
  ) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 15000);
    } catch (e) {
      console.error("DOCX parse failed:", e);
      return "";
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    fileName.toLowerCase().endsWith(".pptx")
  ) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const slideTexts: string[] = [];
      const slideFiles = Object.keys(zip.files)
        .filter((f) => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"))
        .sort();
      for (const sf of slideFiles) {
        const xml = await zip.files[sf].async("text");
        const texts = xml.match(/<a:t>(.*?)<\/a:t>/g) || [];
        const slideText = texts
          .map((t) => t.replace(/<\/?a:t>/g, ""))
          .join(" ");
        if (slideText.trim()) slideTexts.push(slideText.trim());
      }
      return slideTexts.join("\n\n").slice(0, 15000);
    } catch (e) {
      console.error("PPTX parse failed:", e);
      return "";
    }
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    fileName.toLowerCase().endsWith(".xlsx") ||
    mimeType === "application/vnd.ms-excel" ||
    fileName.toLowerCase().endsWith(".xls")
  ) {
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(buffer, { type: "buffer" });
      const texts: string[] = [];
      for (const name of workbook.SheetNames.slice(0, 5)) {
        const sheet = workbook.Sheets[name];
        const csv = XLSX.utils.sheet_to_csv(sheet);
        texts.push(`[Sheet: ${name}]\n${csv}`);
      }
      return texts.join("\n\n").slice(0, 15000);
    } catch (e) {
      console.error("Excel parse failed:", e);
      return "";
    }
  }

  if (
    mimeType === "text/csv" ||
    fileName.toLowerCase().endsWith(".csv") ||
    mimeType === "text/plain" ||
    fileName.toLowerCase().endsWith(".txt") ||
    fileName.toLowerCase().endsWith(".md")
  ) {
    return buffer.toString("utf-8").slice(0, 15000);
  }

  return buffer.toString("utf-8").slice(0, 15000);
}

function isImageFile(mimeType: string, fileName: string): boolean {
  const imageMimes = ["image/jpeg", "image/png", "image/jpg", "image/webp"];
  const imageExts = [".jpg", ".jpeg", ".png", ".webp"];
  const ext = "." + fileName.split(".").pop()?.toLowerCase();
  return imageMimes.includes(mimeType) || imageExts.includes(ext);
}

type DecisionContext =
  | "clinical_adoption"
  | "operational_deployment"
  | "regulatory_approval"
  | "commercial_launch"
  | "technology_implementation";

interface EnvironmentClassification {
  context: DecisionContext;
  label: string;
  rationale: string;
}

const CONTEXT_LABELS: Record<DecisionContext, string> = {
  clinical_adoption: "Clinical Adoption",
  operational_deployment: "Operational Deployment",
  regulatory_approval: "Regulatory Approval",
  commercial_launch: "Commercial Launch",
  technology_implementation: "Technology Implementation",
};

const SIGNAL_LIBRARIES: Record<DecisionContext, { categories: string[]; guidance: string }> = {
  clinical_adoption: {
    categories: ["evidence", "adoption", "guideline", "competition", "access", "timing"],
    guidance: `Focus on signals that drive or hinder clinical uptake:
- EVIDENCE: Trial results, real-world data, safety signals, efficacy comparisons, endpoint outcomes
- ADOPTION: Provider willingness, prescribing behavior, academic vs community uptake patterns, KOL sentiment
- GUIDELINE: Society recommendations, treatment algorithms, formulary positioning, pathway inclusion
- COMPETITION: Alternative therapies, mechanism-of-action differentiation, switching dynamics, pipeline threats
- ACCESS: Payer coverage, step therapy requirements, prior authorization burden, patient affordability
- TIMING: Regulatory milestones, label expansions, data readouts, congress presentations`,
  },
  operational_deployment: {
    categories: ["supply_chain", "infrastructure", "workforce", "process", "timing", "risk"],
    guidance: `Focus on signals that affect operational readiness and execution:
- SUPPLY_CHAIN: Manufacturing capacity, supplier qualification, device/component sourcing, inventory readiness
- INFRASTRUCTURE: Facility readiness, distribution networks, cold chain, IT systems, training programs
- WORKFORCE: Staffing adequacy, skill gaps, training completion, change management readiness
- PROCESS: Standard operating procedures, quality systems, compliance readiness, handoff protocols
- TIMING: Go-live dates, phased rollout plans, dependency chains, critical path milestones
- RISK: Single points of failure, contingency plans, regulatory inspections, recall history`,
  },
  regulatory_approval: {
    categories: ["evidence", "regulatory", "safety", "competition", "timing", "guideline"],
    guidance: `Focus on signals that affect likelihood and timing of regulatory decisions:
- EVIDENCE: Pivotal trial results, statistical significance, primary/secondary endpoints, subgroup analyses
- REGULATORY: FDA/EMA interactions, advisory committee signals, complete response history, PDUFA dates
- SAFETY: Adverse event profile, black box warnings, REMS requirements, post-marketing commitments
- COMPETITION: Competitor approvals, first-in-class vs follow-on dynamics, orphan drug exclusivity
- TIMING: Filing dates, review timelines, priority/breakthrough designations, rolling submissions
- GUIDELINE: Unmet medical need recognition, treatment landscape gaps, patient advocacy pressure`,
  },
  commercial_launch: {
    categories: ["access", "competition", "adoption", "evidence", "timing", "infrastructure"],
    guidance: `Focus on signals that affect market entry success and revenue trajectory:
- ACCESS: Payer negotiations, formulary status, copay programs, channel strategy, distribution exclusivity
- COMPETITION: Market share dynamics, competitive launches, pricing pressure, generic/biosimilar threats
- ADOPTION: Sales force readiness, KOL engagement, speaker programs, medical education, patient awareness
- EVIDENCE: Launch data packages, health economics studies, value dossiers, real-world evidence generation
- TIMING: Launch sequencing, geographic rollout, indication expansion timeline, lifecycle management
- INFRASTRUCTURE: Supply chain readiness, specialty pharmacy networks, hub/support services, sampling`,
  },
  technology_implementation: {
    categories: ["infrastructure", "adoption", "governance", "risk", "timing", "evidence"],
    guidance: `Focus on signals that affect technology deployment, integration, and organizational readiness:
- INFRASTRUCTURE: System compatibility, integration architecture, API readiness, data migration scope, security clearance status, environment provisioning, network/firewall requirements, cloud vs on-prem considerations
- ADOPTION: User readiness, change management progress, training completion, stakeholder buy-in, pilot results, workflow disruption risk, end-user resistance, champion identification
- GOVERNANCE: Budget approval status, procurement/vendor selection, IT governance review, compliance requirements, data privacy/security audit, executive sponsorship, contract terms, SLA requirements
- RISK: Vendor stability, single points of failure, data integrity concerns, downtime impact, rollback capability, dependency on external teams, scope creep, parallel operations burden
- TIMING: Implementation milestones, dependency chains, go-live windows, phased vs big-bang approach, resource availability, competing organizational priorities, blackout periods
- EVIDENCE: Proof of concept results, benchmark data, peer institution experience, ROI projections, vendor reference checks, comparable deployment outcomes`,
  },
};

async function classifyEnvironment(
  text: string,
  questionContext: string,
  imageBase64?: string | null,
  imageMimeType?: string | null,
): Promise<EnvironmentClassification> {
  const classifyPrompt = `You are a decision environment classifier. Read the materials and question carefully, then determine which ONE decision context best describes the PRIMARY decision at stake.

DECISION CONTEXTS — read the discriminating markers carefully:

1. technology_implementation
   WHEN TO CHOOSE: The decision is about deploying, integrating, or rolling out a technology system, software platform, digital tool, data infrastructure, AI/ML system, CRM, EHR, analytics dashboard, or IT capability.
   KEY MARKERS: system integration, vendor selection, data migration, user adoption of software, IT governance, security clearance, API connectivity, platform rollout, digital transformation, workflow automation, budget approval for tech, go-live readiness, change management for systems, training on new tools.
   NOT THIS IF: The technology is a medical device being prescribed to patients (that's clinical_adoption) or a product being sold commercially (that's commercial_launch).

2. operational_deployment
   WHEN TO CHOOSE: The decision is about operational readiness — supply chain, manufacturing scale-up, distribution logistics, staffing, facility build-out, or process implementation.
   KEY MARKERS: manufacturing capacity, supplier qualification, distribution networks, cold chain logistics, staffing plans, facility readiness, device component sourcing, inventory management, quality systems, operational SOPs, go/no-go for production.
   NOT THIS IF: The operational concern is secondary to a market entry decision (that's commercial_launch) or a technology rollout (that's technology_implementation).

3. clinical_adoption
   WHEN TO CHOOSE: The decision is about whether healthcare providers will adopt a therapy, drug, biologic, medical device, diagnostic, or clinical protocol for patient care.
   KEY MARKERS: clinical trial data, efficacy endpoints, safety profiles, provider prescribing behavior, treatment guidelines, formulary inclusion, KOL recommendations, patient outcomes, switching from existing therapies, real-world evidence.
   NOT THIS IF: The focus is on pricing/market share (commercial_launch), regulatory filing (regulatory_approval), or deploying an IT system (technology_implementation).

4. commercial_launch
   WHEN TO CHOOSE: The decision is about market entry strategy — pricing, payer negotiations, market share targets, sales force deployment, competitive positioning, revenue forecasting.
   KEY MARKERS: launch timing, payer access, formulary negotiations, market share projections, sales force readiness, competitive landscape, pricing strategy, patient affordability programs, channel strategy, commercial KPIs.
   NOT THIS IF: The focus is purely on clinical uptake by providers (clinical_adoption) or manufacturing readiness (operational_deployment).

5. regulatory_approval
   WHEN TO CHOOSE: The decision is about regulatory filing, review, or approval outcomes — FDA, EMA, or other regulatory body decisions.
   KEY MARKERS: NDA/BLA/MAA filing, PDUFA dates, advisory committee meetings, complete response letters, label negotiations, post-marketing requirements, breakthrough/priority designations, regulatory interactions.
   NOT THIS IF: Regulatory status is mentioned as background context for a launch (commercial_launch) or adoption (clinical_adoption) decision.

CLASSIFICATION RULES:
- Read the ACTUAL content. Do not default to clinical or pharma assumptions.
- If the materials discuss deploying software, platforms, dashboards, CRM, EHR, data systems, or IT infrastructure → choose technology_implementation.
- If the materials discuss supply chain, manufacturing, distribution, or staffing readiness → choose operational_deployment.
- The question text (if provided) is the strongest signal for context. "Will the team deploy X system" → technology. "Will providers adopt X therapy" → clinical.
- When materials span multiple domains, choose the context of the PRIMARY decision, not the supporting details.

Respond in JSON:
{
  "context": "one of: technology_implementation, operational_deployment, clinical_adoption, commercial_launch, regulatory_approval",
  "rationale": "One sentence explaining why this context was chosen, referencing specific content from the materials"
}`;

  const messages: any[] = [{ role: "system", content: classifyPrompt }];
  const contentSnippet = text ? text.slice(0, 3000) : "";
  let userMsg = "";
  if (questionContext) {
    userMsg += `FORECAST QUESTION: "${questionContext}"\n\n`;
  }
  if (contentSnippet) {
    userMsg += `MATERIALS EXCERPT:\n---\n${contentSnippet}\n---`;
  }

  if (imageBase64 && imageMimeType && !contentSnippet) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userMsg || "Classify the decision environment for the following image:" },
        { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: "low" } },
      ],
    });
  } else {
    messages.push({ role: "user", content: userMsg || "No materials provided." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 200,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty classification response");
    const parsed = JSON.parse(content);
    const ctx = parsed.context as DecisionContext;
    if (!CONTEXT_LABELS[ctx]) throw new Error(`Unknown context: ${ctx}`);
    return {
      context: ctx,
      label: CONTEXT_LABELS[ctx],
      rationale: parsed.rationale || "",
    };
  } catch (e) {
    console.error("Environment classification failed, defaulting:", e);
    return {
      context: "commercial_launch",
      label: "Commercial Launch",
      rationale: "Default classification — could not determine specific context",
    };
  }
}

function buildSignalExtractionPrompt(
  env: EnvironmentClassification,
  questionContext: string,
): string {
  const lib = SIGNAL_LIBRARIES[env.context];

  const questionInstruction = questionContext
    ? `\n\nACTIVE FORECAST QUESTION: "${questionContext}"\n\nEvery signal you extract MUST be framed in terms of how it impacts this specific question. Phrase each signal as a concrete observation that either supports, slows, or is neutral to the outcome described in the question. Drop any information that has no bearing on this question.`
    : "";

  return `You are a decision intelligence analyst specializing in ${env.label} environments. You receive unstructured materials and extract coherent, decision-relevant signals from them.

DETECTED DECISION ENVIRONMENT: ${env.label}
${env.rationale}
${questionInstruction}

SIGNAL CATEGORIES FOR THIS ENVIRONMENT:
${lib.guidance}

CRITICAL RULES:
- SIGNALS MUST COME FROM THE ENVIRONMENT, NOT FROM A TEMPLATE. Every signal must reference a specific fact, observation, or data point actually present in the materials.
- Do NOT generate generic signals that could apply to any situation. If the materials don't contain evidence for a category, skip that category entirely.
- Each signal must be a clear, self-contained statement — not a raw data excerpt
- Synthesize related data points into coherent signals
- Signals must be specific and actionable

SIGNAL CLASSIFICATION — every signal must be classified into one of three groups:
- "internal": Controllable drivers — things the organization can act on (staffing, readiness, execution, internal processes)
- "external": Environment signals outside direct control (regulatory actions, competitor moves, market conditions, payer decisions, published evidence)
- "missing": Critical unknowns — information gaps that create forecast risk (unresolved decisions, pending data, unknown outcomes)

SIGNAL FIELDS:
- text: Clear, coherent signal statement grounded in the materials
- direction: "positive" (supports/accelerates the outcome), "negative" (slows/blocks), or "neutral" (informational context)
- importance: "High", "Medium", or "Low" — calibrate using the IMPORTANCE RULES below
- confidence: "Strong" (verified/published data), "Moderate" (credible but uncertain), "Weak" (speculative/anecdotal)
- category: one of [${lib.categories.join(", ")}]
- signal_source: "internal", "external", or "missing"
- source_description: Specific reference to where in the materials this signal was found

IMPORTANCE CALIBRATION RULES — apply these strictly:
- If a signal describes an ADOPTION CONSTRAINT, EXECUTION BOTTLENECK, or SUPPLY DEPENDENCY → importance = "High"
- If a signal describes a PAYER RESTRICTION, ACCESS BARRIER, or REGULATORY GATE → importance = "High"
- If a signal describes a RESOURCE SHORTFALL (staffing, capacity, readiness below target) → importance = "High"
- If a signal describes COMPETITIVE THREAT with direct impact on the forecast question → importance = "High"
- If a signal provides CONTEXT without directly constraining or enabling the outcome → importance = "Medium"
- If a signal is PERIPHERAL (investor events, general industry news, minor data points) → importance = "Low"
- NEVER mark a signal as Low if it describes something that could block or materially delay the outcome

Extract 3-15 signals. Favor quality over quantity. Every signal must be traceable to the input materials.

Respond in JSON:
{
  "signals": [
    {
      "text": "Signal statement grounded in the materials",
      "direction": "positive|negative|neutral",
      "importance": "High|Medium|Low",
      "confidence": "Strong|Moderate|Weak",
      "category": "one of the categories listed above",
      "signal_source": "internal|external|missing",
      "source_description": "Where in the materials this was found"
    }
  ],
  "summary": "2-3 sentence summary of what was analyzed"
}`;
}

router.post("/import-project", async (req, res) => {
  try {
    const body = req.body as ImportProjectRequest;

    const MAX_BASE64_SIZE = 15 * 1024 * 1024;
    const MAX_TEXT_SIZE = 100000;

    let extractedText = "";
    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;

    if (body.text && body.text.trim().length > 0) {
      if (body.text.length > MAX_TEXT_SIZE) {
        res.status(400).json({ error: "Pasted text is too long. Maximum 100,000 characters." });
        return;
      }
      extractedText = body.text.trim().slice(0, 15000);
    } else if (body.fileBase64 && body.fileName) {
      if (body.fileBase64.length > MAX_BASE64_SIZE) {
        res.status(400).json({ error: "File is too large. Maximum file size is 10 MB." });
        return;
      }

      const mime = body.mimeType || "application/octet-stream";
      if (isImageFile(mime, body.fileName)) {
        imageBase64 = body.fileBase64;
        imageMimeType = mime.startsWith("image/") ? mime : "image/jpeg";
      } else {
        extractedText = await extractTextFromFile(
          body.fileBase64,
          mime,
          body.fileName,
        );
      }
    }

    if (!extractedText && !imageBase64) {
      res.status(400).json({
        error:
          "Could not extract enough content from the provided input. Please try pasting the content directly or uploading a different file.",
      });
      return;
    }

    if (extractedText && extractedText.length < 20 && !imageBase64) {
      res.status(400).json({
        error:
          "Could not extract enough text from the provided input. Please try pasting the content directly or uploading a different file.",
      });
      return;
    }

    const env = await classifyEnvironment(extractedText, "", imageBase64, imageMimeType);
    console.log(`[import-project] Environment classified: ${env.label} — ${env.rationale}`);
    const lib = SIGNAL_LIBRARIES[env.context];

    const systemPrompt = `You are a decision intelligence analyst specializing in ${env.label} environments. You receive unstructured project materials and extract a structured forecasting case from them.

DETECTED DECISION ENVIRONMENT: ${env.label}
${env.rationale}

Your job:
1. Identify the core DECISION QUESTION the materials are about
2. Extract KEY SIGNALS — concrete facts, data points, or observations from the materials
3. Identify MISSING SIGNALS — things the team should investigate but aren't in the materials
4. Determine the subject (brand/therapy/product), outcome, time horizon, and question type

SIGNAL CATEGORIES FOR THIS ENVIRONMENT:
${lib.guidance}

SIGNAL SOURCE CLASSIFICATION — every signal must be classified:
- "internal": Controllable drivers the organization can act on (staffing, readiness, execution, field force, manufacturing, launch preparation)
- "external": Environment signals outside direct control (regulatory actions, competitor moves, market conditions, payer decisions, published evidence)
- "missing": Critical unknowns that create forecast risk (unresolved decisions, pending data, unknown outcomes)

IMPORTANCE CALIBRATION — apply strictly:
- ADOPTION CONSTRAINT, EXECUTION BOTTLENECK, or SUPPLY DEPENDENCY → "High"
- PAYER RESTRICTION, ACCESS BARRIER, or REGULATORY GATE → "High"
- RESOURCE SHORTFALL (staffing, capacity, readiness below target) → "High"
- COMPETITIVE THREAT with direct impact → "High"
- HEALTH ECONOMICS / COST-EFFECTIVENESS evidence → "Medium"
- SUPPORTING CONTEXT without directly constraining or enabling the outcome → "Medium"
- PERIPHERAL (investor events, general industry news) → "Low"
- NEVER mark a signal as Low if it could block or materially delay the outcome

CRITICAL RULES:
- SIGNALS MUST COME FROM THE ENVIRONMENT, NOT FROM A TEMPLATE. Every signal must reference a specific fact, observation, or data point actually present in the materials.
- Do NOT generate generic signals that could apply to any situation. If the materials don't contain evidence for a category, skip that category entirely.
- The decision question must be a clear, specific binary or comparative question suitable for forecasting
- Each signal must be a coherent, self-contained statement — not a raw data excerpt
- Missing signals should be specific investigable items, not vague suggestions
- If the materials don't clearly indicate a decision question, infer the most likely one based on the content
- For image inputs: carefully read all visible text, data, charts, tables, and annotations

Respond in JSON format:
{
  "question": {
    "text": "The decision question in plain language",
    "restatedQuestion": "A formal restatement of the question",
    "subject": "The brand/therapy/product name",
    "outcome": "What outcome is being evaluated",
    "timeHorizon": "e.g. 12 months, 24 months",
    "questionType": "binary or comparative",
    "entities": [],
    "primaryConstraint": "The most likely barrier",
    "decisionType": "Launch timing / Adoption / Market entry / etc."
  },
  "signals": [
    {
      "text": "Signal statement grounded in the materials",
      "direction": "positive|negative|neutral",
      "importance": "High|Medium|Low",
      "confidence": "Strong|Moderate|Weak",
      "category": "one of [${lib.categories.join(", ")}]",
      "signal_source": "internal|external|missing",
      "source_description": "Where in the materials this was found",
      "rationale": "Why this matters for the decision"
    }
  ],
  "missingSignals": [
    {
      "text": "What needs to be investigated",
      "importance": "High|Medium|Low",
      "category": "one of [${lib.categories.join(", ")}]",
      "reason": "Why this is needed for the decision"
    }
  ],
  "suggestedCaseType": "One of: Launch timing, Market adoption, Competitive entry, Regulatory approval, Guideline inclusion, Payer access, Portfolio strategy, Clinical development, or another short descriptor",
  "confidence": "One of: High, Moderate, Low — based on how much relevant information the materials contain and how clearly the decision question can be inferred",
  "summary": "A 2-3 sentence summary of what the materials contain"
}`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
    ];

    if (imageBase64 && imageMimeType) {
      const userContent: any[] = [
        { type: "text", text: "Analyze the following project image and extract a structured forecasting case:" },
        {
          type: "image_url",
          image_url: {
            url: `data:${imageMimeType};base64,${imageBase64}`,
            detail: "high",
          },
        },
      ];
      if (extractedText) {
        userContent.push({
          type: "text",
          text: `\n\nAdditional text context:\n---\n${extractedText}\n---`,
        });
      }
      messages.push({ role: "user", content: userContent });
    } else {
      messages.push({
        role: "user",
        content: `Analyze the following project materials and extract a structured forecasting case:\n\n---\n${extractedText}\n---`,
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI analysis returned empty response" });
      return;
    }

    const parsed = JSON.parse(content);
    res.json({
      question: parsed.question || null,
      signals: parsed.signals || [],
      missingSignals: parsed.missingSignals || [],
      suggestedCaseType: parsed.suggestedCaseType || parsed.question?.decisionType || "Decision",
      confidence: parsed.confidence || "Moderate",
      summary: parsed.summary || "",
      textLength: extractedText.length,
      environment: {
        context: env.context,
        label: env.label,
        rationale: env.rationale,
      },
    });
  } catch (err) {
    console.error("Import project error:", err);
    res.status(500).json({ error: "Failed to analyze project materials" });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/import-project/analyze", upload.single("file"), async (req, res) => {
  try {
    let extractedText = "";
    let imageBase64: string | null = null;
    let imageMimeType: string | null = null;
    const questionContext = req.body?.question || "";

    if (req.file) {
      const file = req.file;
      const mime = file.mimetype || "application/octet-stream";
      const base64 = file.buffer.toString("base64");

      if (isImageFile(mime, file.originalname)) {
        imageBase64 = base64;
        imageMimeType = mime.startsWith("image/") ? mime : "image/jpeg";
      } else {
        extractedText = await extractTextFromFile(base64, mime, file.originalname);
      }
    } else if (req.body?.text) {
      extractedText = req.body.text.trim().slice(0, 15000);
    }

    if (!extractedText && !imageBase64) {
      res.status(400).json({ error: "Could not extract content from the provided input." });
      return;
    }

    const env = await classifyEnvironment(extractedText, questionContext, imageBase64, imageMimeType);
    console.log(`Environment classified: ${env.label} — ${env.rationale}`);

    const systemPrompt = buildSignalExtractionPrompt(env, questionContext);

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (imageBase64 && imageMimeType) {
      const userContent: any[] = [
        { type: "text", text: `Analyze the following image and extract signals grounded in what you observe${questionContext ? ` that impact the question: "${questionContext}"` : ""}:` },
        {
          type: "image_url",
          image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: "high" },
        },
      ];
      if (extractedText) {
        userContent.push({ type: "text", text: `\n\nAdditional context:\n---\n${extractedText}\n---` });
      }
      messages.push({ role: "user", content: userContent });
    } else {
      messages.push({
        role: "user",
        content: `Extract signals from the following materials. Every signal must reference specific content from these materials — do not generate template signals:\n\n---\n${extractedText}\n---`,
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI analysis returned empty response" });
      return;
    }

    const parsed = JSON.parse(content);
    res.json({
      signals: parsed.signals || [],
      summary: parsed.summary || "",
      environment: {
        context: env.context,
        label: env.label,
        rationale: env.rationale,
      },
    });
  } catch (err) {
    console.error("Import analyze error:", err);
    res.status(500).json({ error: "Failed to analyze content" });
  }
});

export default router;
