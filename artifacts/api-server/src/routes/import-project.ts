import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";
import { db } from "@workspace/db";
import { decisionClassificationsTable } from "@workspace/db/schema";
import { randomUUID } from "crypto";

const router = Router();

async function persistClassification(
  archetype: ArchetypeClassification,
  options: { caseId?: string; sourceFileName?: string; ingestionPath: string },
): Promise<void> {
  try {
    await db.insert(decisionClassificationsTable).values({
      classificationId: randomUUID(),
      caseId: options.caseId || null,
      documentType: archetype.documentType,
      domain: archetype.label,
      primaryArchetype: archetype.primaryArchetype,
      alternativeArchetype: archetype.alternativeArchetype || null,
      secondaryArchetypes: JSON.stringify(archetype.secondaryArchetypes),
      primaryDecision: archetype.decisionFraming,
      secondaryDecisions: JSON.stringify(archetype.secondaryDecisions),
      evidenceSpans: JSON.stringify(archetype.evidenceSpans),
      confidence: archetype.confidenceLevel,
      confidenceRationale: archetype.confidenceRationale,
      guardrailApplied: archetype.guardrailApplied ? "true" : "false",
      guardrailReason: archetype.guardrailReason || null,
      sourceFileName: options.sourceFileName || null,
      ingestionPath: options.ingestionPath,
    });
  } catch (e) {
    console.error("[classification-persist] Failed to persist classification (non-fatal):", e);
  }
}

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
    let parser: any = null;
    try {
      const { PDFParse } = await import("pdf-parse");
      parser = new PDFParse({ data: buffer });
      await parser.load();
      const textResult = await parser.getText();
      const text = (textResult.text || "").slice(0, 15000);
      try { await parser.destroy(); } catch (cleanupErr) { console.error("PDF parser cleanup error (non-fatal):", cleanupErr); }
      return text;
    } catch (e) {
      console.error("PDF parse failed:", e);
      try { if (parser) await parser.destroy(); } catch (_) {}
      return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000);
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
    mimeType === "application/msword" ||
    fileName.toLowerCase().endsWith(".doc")
  ) {
    try {
      const WordExtractor = (await import("word-extractor")).default;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      const body = doc.getBody() || "";
      const headers = doc.getHeaders({ includeFootnoteText: false })?.join("\n") || "";
      const text = [headers, body].filter(Boolean).join("\n\n");
      return text.slice(0, 15000);
    } catch (e) {
      console.error("DOC parse failed:", e);
      return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000);
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
    mimeType === "application/vnd.ms-powerpoint" ||
    fileName.toLowerCase().endsWith(".ppt")
  ) {
    try {
      const pptToText = await import("ppt-to-text");
      const text = pptToText.extractText(buffer);
      return (typeof text === "string" ? text : String(text)).slice(0, 15000);
    } catch (e) {
      console.error("PPT parse failed:", e);
      return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000);
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

type DecisionArchetype =
  | "launch_strategy"
  | "adoption_risk"
  | "market_access"
  | "competitive_positioning"
  | "operational_readiness"
  | "resource_allocation"
  | "stakeholder_behavior"
  | "capability_gap"
  | "vendor_selection"
  | "portfolio_strategy"
  | "evidence_positioning";

interface ArchetypeClassification {
  primaryArchetype: DecisionArchetype;
  label: string;
  secondaryArchetypes: string[];
  decisionFraming: string;
  guardrailApplied: boolean;
  guardrailReason?: string;
  documentType: string;
  evidenceSpans: string[];
  secondaryDecisions: string[];
  alternativeArchetype?: string;
  confidenceLevel: "high" | "moderate" | "low";
  confidenceRationale: string;
}

const DECISION_ARCHETYPES: Record<DecisionArchetype, { label: string; markers: string; notThisIf: string }> = {
  launch_strategy: {
    label: "Launch Strategy",
    markers: "Launch timing, go-to-market planning, launch sequencing, market entry, geographic rollout, launch readiness assessment, pre-launch preparation, brand strategy, commercial readiness, indication prioritization for launch",
    notThisIf: "The document is primarily about ongoing market competition without a launch event, or about operational/supply chain readiness in isolation",
  },
  adoption_risk: {
    label: "Adoption Risk",
    markers: "Provider uptake uncertainty, prescribing behavior change, switching barriers, clinical inertia, KOL sentiment, treatment algorithm positioning, formulary placement impact on prescribing, real-world adoption patterns",
    notThisIf: "The focus is on market share/revenue (competitive_positioning) or launch timing (launch_strategy) rather than whether providers will actually use the product",
  },
  market_access: {
    label: "Market Access",
    markers: "Payer negotiations, reimbursement strategy, formulary positioning, prior authorization, step therapy, patient affordability, value-based contracting, HEOR evidence requirements, coverage decisions, cost-effectiveness thresholds",
    notThisIf: "Payer dynamics are mentioned as background context for a launch or adoption decision",
  },
  competitive_positioning: {
    label: "Competitive Positioning",
    markers: "Head-to-head differentiation, market share defense/capture, competitive response planning, mechanism-of-action comparison, label differentiation, pipeline threats, generic/biosimilar entry, competitive intelligence, share of voice",
    notThisIf: "Competition is mentioned as one factor among many in a broader launch or adoption decision",
  },
  operational_readiness: {
    label: "Operational Readiness",
    markers: "Manufacturing scale-up, supply chain qualification, distribution logistics, cold chain, facility build-out, staffing plans, process implementation, quality systems, go/no-go for production, inventory management",
    notThisIf: "Operational factors are mentioned as supporting details for a commercial launch decision",
  },
  resource_allocation: {
    label: "Resource Allocation",
    markers: "Budget prioritization, headcount allocation, field force sizing, investment trade-offs, portfolio resource distribution, program funding decisions, capacity constraints across programs",
    notThisIf: "Resource needs are mentioned as part of launch planning (launch_strategy) or operational readiness",
  },
  stakeholder_behavior: {
    label: "Stakeholder Behavior",
    markers: "Patient behavior patterns, physician decision-making, institutional buying committees, advocacy group influence, patient journey mapping, referral patterns, care pathway decisions, patient preference studies",
    notThisIf: "Stakeholder behavior is discussed as part of adoption forecasting (adoption_risk) rather than as the primary analytical focus",
  },
  capability_gap: {
    label: "Capability Gap",
    markers: "Organizational capability assessment, skills gap analysis, infrastructure gaps, technology readiness, talent acquisition needs, training requirements, partnership/outsourcing decisions to fill gaps, build-vs-buy decisions",
    notThisIf: "The document is primarily a vendor/agency evaluation (vendor_selection) or resource allocation decision",
  },
  vendor_selection: {
    label: "Vendor Selection",
    markers: "Vendor evaluation criteria, agency pitch/selection, RFP responses being evaluated, supplier comparison, outsourcing partner selection, explicit vendor shortlisting, contract award decision",
    notThisIf: "The document is an RFP ISSUED BY the organization seeking capabilities — that typically indicates capability_gap, launch_strategy, or the strategic problem the vendor would solve, NOT vendor selection itself. Vendor selection applies only when the PRIMARY decision is literally 'which vendor/agency should we choose' and the document contains explicit evaluation criteria, scoring, or shortlisting.",
  },
  portfolio_strategy: {
    label: "Portfolio Strategy",
    markers: "Pipeline prioritization, indication sequencing, lifecycle management, asset valuation, portfolio optimization, development-stage trade-offs, therapeutic area strategy, in-licensing/out-licensing, M&A target evaluation",
    notThisIf: "The focus is on a single product's launch or adoption rather than cross-portfolio decisions",
  },
  evidence_positioning: {
    label: "Evidence Positioning",
    markers: "Publication strategy, data dissemination planning, congress strategy, medical affairs evidence plan, real-world evidence generation, ISR strategy, guideline influence, evidence gap analysis, clinical narrative development",
    notThisIf: "Evidence is mentioned as supporting a launch or adoption decision rather than being the primary strategic question",
  },
};

const ARCHETYPE_LABELS: Record<DecisionArchetype, string> = Object.fromEntries(
  Object.entries(DECISION_ARCHETYPES).map(([k, v]) => [k, v.label])
) as Record<DecisionArchetype, string>;

async function classifyDecisionArchetype(
  text: string,
  environmentLabel: string,
  imageBase64?: string | null,
  imageMimeType?: string | null,
): Promise<ArchetypeClassification> {
  const archetypeDescriptions = Object.entries(DECISION_ARCHETYPES)
    .map(([key, val]) => `${key} (${val.label})\n   MARKERS: ${val.markers}\n   NOT THIS IF: ${val.notThisIf}`)
    .join("\n\n");

  const classifyPrompt = `You are a decision archetype classifier for a strategic judgment system. Your job is to identify WHAT TYPE OF DECISION these materials represent — not to generate a question, not to summarize, just to classify the decision type.

DECISION ENVIRONMENT: ${environmentLabel}

DECISION ARCHETYPES — read ALL descriptions carefully before classifying:

${archetypeDescriptions}

MANDATORY CHECKS — apply ALL four before classifying:

CHECK 1 — WRAPPER vs DECISION:
What is the document format (RFP, slide deck, memo, paper, brief, email)?
What is the ACTUAL business decision embedded within that format?
The document format is the WRAPPER. The business decision is what matters.

CHECK 2 — EXPLICIT ASK vs IMPLIED ASK:
What is directly requested in the document?
What is strategically implied by the content?
Prefer the strategic implication over the surface request.

CHECK 3 — PRIMARY vs SECONDARY DECISIONS:
One main decision. Others are subordinate and should be listed as secondary decisions.

CHECK 4 — EVIDENCE SUPPORT:
Extract 3-5 exact phrases or sentences from the document that prove your classification.
These evidence spans must come directly from the materials.

CLASSIFICATION RULES:
1. Read the materials deeply. Identify what DECISION the organization is actually trying to make.
2. Distinguish between the SURFACE FORMAT of the document and the ACTUAL DECISION it represents.
3. An RFP that describes a strategic problem is NOT a vendor selection decision — it is the strategic decision described in the RFP. The vendor/agency is a means, not the end.
4. Choose the archetype that best captures the PRIMARY decision. List up to 2 secondary archetypes.
5. Write a "decisionFraming" sentence that captures the real decision in executive language.
6. If two archetypes compete, prefer the one tied to the core business objective, not the procurement format.
7. Name one plausible alternative archetype if confidence is not high.

CRITICAL GUARDRAIL:
If you are tempted to classify as "vendor_selection", STOP and verify:
- Does the document contain explicit vendor evaluation criteria, scoring matrices, or shortlists?
- Is the document COMPARING vendors/agencies against each other?
- Or is the document describing a STRATEGIC PROBLEM that a vendor would help solve?
If the document describes a strategic problem, classify under THAT archetype, not vendor_selection.

Respond in JSON:
{
  "documentType": "RFP | Strategy Memo | Research Brief | Clinical Paper | Competitive Update | Operational Plan | Slide Deck | Meeting Notes | Email | Report | Other",
  "primaryArchetype": "one of the archetype keys",
  "secondaryArchetypes": ["up to 2 other relevant archetypes"],
  "decisionFraming": "One sentence describing the real decision in executive language",
  "secondaryDecisions": ["Up to 3 subordinate decisions that flow from the primary"],
  "alternativeArchetype": "one archetype key that could also apply, or null",
  "evidenceSpans": ["Exact phrase 1 from document supporting this classification", "Exact phrase 2", "Exact phrase 3"],
  "confidence": "high | moderate | low",
  "confidenceRationale": "One sentence explaining why this confidence level was assigned",
  "vendorSelectionExplicit": false
}`;

  const messages: any[] = [{ role: "system", content: classifyPrompt }];
  const contentSnippet = text ? text.slice(0, 4000) : "";
  let userMsg = contentSnippet
    ? `MATERIALS EXCERPT:\n---\n${contentSnippet}\n---`
    : "No text materials available.";

  if (imageBase64 && imageMimeType && !contentSnippet) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userMsg },
        { type: "image_url", image_url: { url: `data:${imageMimeType};base64,${imageBase64}`, detail: "low" } },
      ],
    });
  } else {
    messages.push({ role: "user", content: userMsg });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0,
      max_tokens: 800,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty archetype response");
    const parsed = JSON.parse(content);

    let primary: DecisionArchetype = parsed.primaryArchetype;
    let guardrailApplied = false;
    let guardrailReason: string | undefined;

    const vendorExplicit = parsed.vendorSelectionExplicit === true;

    if (primary === "vendor_selection" && !vendorExplicit) {
      const secondaries = (parsed.secondaryArchetypes || []) as string[];
      const fallback = (secondaries.find((a: string) => a !== "vendor_selection" && DECISION_ARCHETYPES[a as DecisionArchetype]) as DecisionArchetype) || "launch_strategy";
      guardrailReason = `Vendor selection downgraded: document describes a strategic problem, not explicit vendor evaluation. Reclassified from vendor_selection to ${ARCHETYPE_LABELS[fallback]}.`;
      primary = fallback;
      guardrailApplied = true;
      console.log(`[archetype-guardrail] ${guardrailReason}`);
    }

    if (!DECISION_ARCHETYPES[primary]) {
      primary = "launch_strategy";
      guardrailApplied = true;
      guardrailReason = `Unknown archetype "${parsed.primaryArchetype}" — defaulted to launch_strategy.`;
    }

    let evidenceSpans = Array.isArray(parsed.evidenceSpans) ? parsed.evidenceSpans.filter((s: any) => typeof s === "string" && s.length > 5) : [];
    const secondaryDecisions = Array.isArray(parsed.secondaryDecisions) ? parsed.secondaryDecisions.filter((s: any) => typeof s === "string" && s.length > 5) : [];
    let confLevel = (["high", "moderate", "low"].includes(parsed.confidence)) ? parsed.confidence : "moderate";

    if (evidenceSpans.length < 2) {
      confLevel = "low";
      if (evidenceSpans.length === 0) {
        evidenceSpans = ["Classification based on overall document context — no specific evidence phrases extracted"];
      }
      console.log(`[archetype-gate] Insufficient evidence spans (${evidenceSpans.length}) — confidence downgraded to low`);
    }
    const altArchetype = parsed.alternativeArchetype && DECISION_ARCHETYPES[parsed.alternativeArchetype as DecisionArchetype]
      ? ARCHETYPE_LABELS[parsed.alternativeArchetype as DecisionArchetype]
      : undefined;

    return {
      primaryArchetype: primary,
      label: ARCHETYPE_LABELS[primary],
      secondaryArchetypes: (parsed.secondaryArchetypes || []).filter((a: string) => DECISION_ARCHETYPES[a as DecisionArchetype]),
      decisionFraming: parsed.decisionFraming || "",
      guardrailApplied,
      guardrailReason,
      documentType: parsed.documentType || "Unknown",
      evidenceSpans,
      secondaryDecisions,
      alternativeArchetype: altArchetype,
      confidenceLevel: confLevel,
      confidenceRationale: parsed.confidenceRationale || "",
    };
  } catch (e) {
    console.error("Decision archetype classification failed, defaulting:", e);
    return {
      primaryArchetype: "launch_strategy",
      label: "Launch Strategy",
      secondaryArchetypes: [],
      decisionFraming: "",
      guardrailApplied: false,
      documentType: "Unknown",
      evidenceSpans: [],
      secondaryDecisions: [],
      confidenceLevel: "low" as const,
      confidenceRationale: "Classification failed — using default archetype",
    };
  }
}

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

    const isLowContent = (!extractedText && !imageBase64) || (extractedText && extractedText.length < 20 && !imageBase64);

    if (isLowContent && body.fileBase64 && body.fileName) {
      const rawFallback = Buffer.from(body.fileBase64, "base64")
        .toString("utf-8")
        .replace(/[^\x20-\x7E\n\r\t]/g, " ")
        .replace(/\s{3,}/g, " ")
        .trim()
        .slice(0, 15000);
      if (rawFallback.length > 30) {
        extractedText = rawFallback;
        console.log(`[import-project] Using raw text fallback (${rawFallback.length} chars)`);
      }
    }

    if (!extractedText && !imageBase64) {
      extractedText = body.fileName
        ? `Document: ${body.fileName}. Content could not be extracted automatically.`
        : "Unreadable document submitted for analysis.";
    }

    const env = await classifyEnvironment(extractedText, "", imageBase64, imageMimeType);
    console.log(`[import-project] Environment classified: ${env.label} — ${env.rationale}`);

    const archetype = await classifyDecisionArchetype(extractedText, env.label, imageBase64, imageMimeType);
    console.log(`[import-project] Decision archetype: ${archetype.label} — ${archetype.decisionFraming}${archetype.guardrailApplied ? ` [GUARDRAIL: ${archetype.guardrailReason}]` : ""}`);

    const lib = SIGNAL_LIBRARIES[env.context];

    const archetypeInstruction = `
DECISION ARCHETYPE CLASSIFICATION (use this to frame the question):
Primary Archetype: ${archetype.label}
${archetype.secondaryArchetypes.length > 0 ? `Secondary Archetypes: ${archetype.secondaryArchetypes.map(a => ARCHETYPE_LABELS[a as DecisionArchetype] || a).join(", ")}` : ""}
Decision Framing: ${archetype.decisionFraming}
${archetype.guardrailApplied ? `GUARDRAIL APPLIED: ${archetype.guardrailReason}` : ""}

MANDATORY FRAMING RULE: The decision question you generate MUST align with the "${archetype.label}" archetype. Frame the question around the strategic decision described by the archetype, NOT around surface-level document format.
${archetype.primaryArchetype !== "vendor_selection" ? `
VENDOR/AGENCY PROHIBITION: The archetype is "${archetype.label}", NOT "Vendor Selection". Do NOT frame the decision question as "which agency/vendor to select" or "how to choose an agency." Agency/vendor selection is a downstream operational decision, not the primary strategic question. The question must focus on the strategic outcome: e.g., "What strategy will maximize the probability of a successful launch?" not "Which agency should be selected to support the launch?"` : ""}`;

    const systemPrompt = `You are a decision intelligence analyst specializing in ${env.label} environments. You receive unstructured project materials and extract a structured forecasting case from them.

DETECTED DECISION ENVIRONMENT: ${env.label}
${env.rationale}
${archetypeInstruction}

Your job:
1. Identify the core DECISION QUESTION the materials are about — guided by the archetype classification above. The question must be about the STRATEGIC OUTCOME, not about procurement or vendor selection unless the archetype is explicitly "Vendor Selection"
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
- If the materials don't clearly indicate a decision question, YOU MUST STILL GENERATE ONE. Infer the most likely decision from the content using heuristic analysis. Ask: "What decision is this project trying to support?" or "What outcome is implied by these materials?" Generate the best candidate question and flag confidence as "Low".
- Even with sparse or poorly structured materials, ALWAYS extract or infer at least 3-5 candidate signals. Look for: competitive presence, clinical uncertainty, market access pressure, stakeholder complexity, positioning challenges, timing constraints.
- NEVER return empty signals. If extraction is weak, generate signals at "Weak" confidence with clear source descriptions noting they are inferred from limited content.
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
        { type: "text", text: `Analyze the following project image and extract a structured forecasting case.

IMAGE EXTRACTION PRIORITIES — apply in this order:
1. READ ALL VISIBLE TEXT first — headers, titles, body text, labels, captions, footnotes, watermarks
2. EXTRACT TABLE DATA — read every cell, preserve row/column structure, note column headers
3. READ CHART/GRAPH DATA — axis labels, data point values, legend entries, trend descriptions
4. CAPTURE SLIDE CONTENT — if this is a screenshot of a presentation, extract slide title, bullet points, speaker notes if visible
5. NOTE VISUAL CUES — color coding, highlighting, arrows, annotations, circled items, handwritten notes
6. IDENTIFY DOCUMENT TYPE — is this an RFP, strategy deck, clinical report, market analysis, email, meeting notes, competitive intelligence?

Do NOT skip readable text. If text is partially obscured or low resolution, extract what you can and note uncertainty.` },
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
    const confidence = parsed.confidence || (isLowContent ? "Low" : "Moderate");

    const question = parsed.question || {
      text: `What decision is implied by ${body.fileName || "the submitted materials"}?`,
      restatedQuestion: `What is the primary decision or outcome that ${body.fileName || "these materials"} are intended to support?`,
      subject: body.fileName?.replace(/\.[^.]+$/, "") || "Unknown",
      outcome: "Decision outcome not yet determined",
      timeHorizon: "12 months",
      questionType: "binary",
      entities: [],
      primaryConstraint: "Insufficient information to determine primary constraint",
      decisionType: "Decision",
    };

    const signals = (parsed.signals && parsed.signals.length > 0) ? parsed.signals : [
      { text: "Document content could not be fully parsed — manual review recommended", direction: "neutral", importance: "High", confidence: "Weak", category: "evidence", signal_source: "missing", source_description: "Inferred from limited extraction" },
      { text: "Decision context unclear from available materials", direction: "neutral", importance: "Medium", confidence: "Weak", category: "evidence", signal_source: "missing", source_description: "Inferred from limited extraction" },
      { text: "Stakeholder landscape and competitive dynamics not yet identified", direction: "neutral", importance: "Medium", confidence: "Weak", category: "competition", signal_source: "missing", source_description: "Inferred from limited extraction" },
    ];

    res.json({
      question,
      signals,
      missingSignals: parsed.missingSignals || [],
      suggestedCaseType: parsed.suggestedCaseType || parsed.question?.decisionType || "Decision",
      confidence,
      summary: parsed.summary || "",
      textLength: extractedText.length,
      lowConfidence: confidence === "Low" || !!isLowContent,
      environment: {
        context: env.context,
        label: env.label,
        rationale: env.rationale,
      },
      decisionArchetype: {
        primary: archetype.label,
        secondary: archetype.secondaryArchetypes.map(a => ARCHETYPE_LABELS[a as DecisionArchetype] || a),
        framing: archetype.decisionFraming,
        guardrailApplied: archetype.guardrailApplied,
        guardrailReason: archetype.guardrailReason || null,
        documentType: archetype.documentType,
        evidenceSpans: archetype.evidenceSpans,
        secondaryDecisions: archetype.secondaryDecisions,
        alternativeArchetype: archetype.alternativeArchetype || null,
        confidenceLevel: archetype.confidenceLevel,
        confidenceRationale: archetype.confidenceRationale,
      },
    });

    await persistClassification(archetype, {
      sourceFileName: body.fileName || "pasted_text",
      ingestionPath: "single-file",
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
      if (req.file) {
        const rawFallback = req.file.buffer
          .toString("utf-8")
          .replace(/[^\x20-\x7E\n\r\t]/g, " ")
          .replace(/\s{3,}/g, " ")
          .trim()
          .slice(0, 15000);
        if (rawFallback.length > 30) {
          extractedText = rawFallback;
        } else {
          extractedText = `Document: ${req.file.originalname}. Content could not be extracted automatically.`;
        }
      } else {
        extractedText = "Unreadable content submitted for analysis.";
      }
    }

    const env = await classifyEnvironment(extractedText, questionContext, imageBase64, imageMimeType);
    console.log(`Environment classified: ${env.label} — ${env.rationale}`);

    const systemPrompt = buildSignalExtractionPrompt(env, questionContext);

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (imageBase64 && imageMimeType) {
      const userContent: any[] = [
        { type: "text", text: `Analyze the following image and extract signals grounded in what you observe${questionContext ? ` that impact the question: "${questionContext}"` : ""}.

IMAGE EXTRACTION PRIORITIES:
1. READ ALL VISIBLE TEXT — headers, labels, body text, table cells, chart axes, footnotes
2. EXTRACT TABLE/CHART DATA — preserve structure, note values and trends
3. CAPTURE SLIDE/DOCUMENT CONTENT — titles, bullets, annotations
4. NOTE VISUAL CUES — highlighting, arrows, color coding
Do NOT skip readable text. Extract what you can even from low-resolution areas.` },
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
      res.json({
        signals: [
          { text: "Document content could not be fully analyzed — manual review recommended", direction: "neutral", importance: "High", confidence: "Weak", category: "evidence", signal_source: "missing", source_description: "Fallback — AI returned empty" },
        ],
        summary: "Extraction produced limited results. Manual review recommended.",
        lowConfidence: true,
        environment: { context: env.context, label: env.label, rationale: env.rationale },
      });
      return;
    }

    const parsed = JSON.parse(content);
    const signals = (parsed.signals && parsed.signals.length > 0) ? parsed.signals : [
      { text: "No signals could be extracted from the provided materials", direction: "neutral", importance: "High", confidence: "Weak", category: "evidence", signal_source: "missing", source_description: "Inferred from limited extraction" },
    ];
    res.json({
      signals,
      summary: parsed.summary || "",
      lowConfidence: !extractedText || extractedText.length < 100,
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

interface FileExtractionResult {
  fileName: string;
  textLength: number;
  extractedText: string;
  imageBase64: string | null;
  imageMimeType: string | null;
  confidence: "High" | "Moderate" | "Low";
  isImage: boolean;
}

async function extractSingleFile(file: Express.Multer.File): Promise<FileExtractionResult> {
  const mime = file.mimetype || "application/octet-stream";
  const fileName = file.originalname;
  let extractedText = "";
  let imageBase64: string | null = null;
  let imageMimeType: string | null = null;

  if (isImageFile(mime, fileName)) {
    imageBase64 = file.buffer.toString("base64");
    imageMimeType = mime.startsWith("image/") ? mime : "image/jpeg";
  } else {
    extractedText = await extractTextFromFile(file.buffer.toString("base64"), mime, fileName);
  }

  if (!extractedText && !imageBase64) {
    const rawFallback = file.buffer
      .toString("utf-8")
      .replace(/[^\x20-\x7E\n\r\t]/g, " ")
      .replace(/\s{3,}/g, " ")
      .trim()
      .slice(0, 15000);
    if (rawFallback.length > 30) {
      extractedText = rawFallback;
    } else {
      extractedText = `Document: ${fileName}. Content could not be extracted automatically.`;
    }
  }

  let confidence: "High" | "Moderate" | "Low" = "High";
  if (imageBase64) {
    confidence = "Moderate";
  } else if (extractedText.length < 100) {
    confidence = "Low";
  } else if (extractedText.length < 500) {
    confidence = "Moderate";
  }

  return {
    fileName,
    textLength: extractedText.length,
    extractedText,
    imageBase64,
    imageMimeType,
    confidence,
    isImage: !!imageBase64,
  };
}

const bundleUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post("/import-project/bundle", bundleUpload.array("files", 20), async (req, res) => {
  try {
    const files = req.files as Express.Multer.File[];
    const pastedText = req.body?.text || "";

    if ((!files || files.length === 0) && !pastedText.trim()) {
      res.status(400).json({ error: "No files or text provided." });
      return;
    }

    const fileResults: FileExtractionResult[] = [];

    if (files && files.length > 0) {
      const extractions = await Promise.all(files.map(f => extractSingleFile(f)));
      fileResults.push(...extractions);
    }

    if (pastedText.trim()) {
      fileResults.push({
        fileName: "Pasted Text",
        textLength: pastedText.trim().length,
        extractedText: pastedText.trim().slice(0, 15000),
        imageBase64: null,
        imageMimeType: null,
        confidence: pastedText.trim().length > 200 ? "High" : pastedText.trim().length > 50 ? "Moderate" : "Low",
        isImage: false,
      });
    }

    console.log(`[bundle] Processing ${fileResults.length} sources: ${fileResults.map(f => `${f.fileName} (${f.textLength} chars, ${f.confidence})`).join(", ")}`);

    const imageFiles = fileResults.filter(f => f.isImage && f.imageBase64);
    if (imageFiles.length > 0) {
      console.log(`[bundle] Pre-extracting text from ${imageFiles.length} image(s) via vision...`);
      const imageExtractions = await Promise.all(imageFiles.map(async (img) => {
        try {
          const ocrResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{
              role: "user",
              content: [
                { type: "text", text: `Extract ALL readable text from this image. Focus on: headers, body text, table cells, chart labels, bullet points, footnotes, annotations. Preserve structure with line breaks. Return ONLY the extracted text, no commentary.` },
                { type: "image_url", image_url: { url: `data:${img.imageMimeType};base64,${img.imageBase64}`, detail: "high" } },
              ],
            }],
            max_tokens: 3000,
            temperature: 0,
          });
          const ocrText = ocrResponse.choices[0]?.message?.content || "";
          if (ocrText.length > 20) {
            img.extractedText = `[Image OCR from ${img.fileName}]\n${ocrText}`;
            img.textLength = img.extractedText.length;
            img.confidence = ocrText.length > 500 ? "High" : "Moderate";
          }
        } catch (e) {
          console.error(`[bundle] Image OCR failed for ${img.fileName}:`, e);
        }
      }));
    }

    const textSources = fileResults.filter(f => f.extractedText);
    const totalBudget = 25000;
    const perFileBudget = textSources.length > 0 ? Math.floor(totalBudget / textSources.length) : totalBudget;

    const allText = textSources
      .map(f => `[SOURCE: ${f.fileName}]\n${f.extractedText.slice(0, Math.max(perFileBudget, 2000))}`)
      .join("\n\n---\n\n");

    const combinedText = allText.slice(0, totalBudget);

    const primaryImage = imageFiles.find(img => !img.extractedText || img.extractedText.length < 100) || null;

    const env = await classifyEnvironment(
      combinedText,
      "",
      primaryImage?.imageBase64 || null,
      primaryImage?.imageMimeType || null,
    );
    console.log(`[bundle] Environment classified: ${env.label} — ${env.rationale}`);

    const archetype = await classifyDecisionArchetype(combinedText, env.label, primaryImage?.imageBase64 || null, primaryImage?.imageMimeType || null);
    console.log(`[bundle] Decision archetype: ${archetype.label} — ${archetype.decisionFraming}${archetype.guardrailApplied ? ` [GUARDRAIL: ${archetype.guardrailReason}]` : ""}`);

    const lib = SIGNAL_LIBRARIES[env.context];

    const fileManifest = fileResults.map(f => `- ${f.fileName}: ${f.textLength} characters extracted, confidence: ${f.confidence}`).join("\n");

    const bundleArchetypeInstruction = `
DECISION ARCHETYPE CLASSIFICATION (use this to frame the question):
Primary Archetype: ${archetype.label}
${archetype.secondaryArchetypes.length > 0 ? `Secondary Archetypes: ${archetype.secondaryArchetypes.map(a => ARCHETYPE_LABELS[a as DecisionArchetype] || a).join(", ")}` : ""}
Decision Framing: ${archetype.decisionFraming}
${archetype.guardrailApplied ? `GUARDRAIL APPLIED: ${archetype.guardrailReason}` : ""}

MANDATORY FRAMING RULE: The decision question you synthesize MUST align with the "${archetype.label}" archetype. Frame the question around the strategic decision, NOT around surface-level document format.
${archetype.primaryArchetype !== "vendor_selection" ? `
VENDOR/AGENCY PROHIBITION: The archetype is "${archetype.label}", NOT "Vendor Selection". Do NOT frame the decision question as "which agency/vendor to select" or "how to choose an agency." Agency/vendor selection is a downstream operational decision, not the primary strategic question. The question must focus on the strategic outcome.` : ""}`;

    const systemPrompt = `You are a decision intelligence analyst specializing in ${env.label} environments. You receive a BUNDLE of project materials from multiple sources and must synthesize them into ONE unified forecasting case.

DETECTED DECISION ENVIRONMENT: ${env.label}
${env.rationale}
${bundleArchetypeInstruction}

FILE MANIFEST:
${fileManifest}

Your job:
1. Read ALL source materials and synthesize the core DECISION QUESTION across the bundle — guided by the archetype classification above. The question must be about the STRATEGIC OUTCOME, not about procurement or vendor selection unless the archetype is explicitly "Vendor Selection"
2. Extract KEY SIGNALS from EACH source — tag every signal with its source file
3. Identify CONTRADICTIONS between files — surface these as opposing signals with clear source attribution
4. Identify MISSING SIGNALS — gaps the team should investigate
5. Determine the subject, outcome, time horizon, and question type
6. Infer which file is the PRIMARY source based on content richness and decision relevance

SIGNAL CATEGORIES FOR THIS ENVIRONMENT:
${lib.guidance}

BUNDLE-SPECIFIC RULES:
- Each signal MUST include "source_file" identifying which file it came from
- If two files contain contradictory information, extract BOTH as signals with opposing directions and flag them
- The decision question should reflect the COMBINED understanding from all files, not just one
- Weight richer, more decision-relevant files higher when inferring the question
- If files cover different aspects of the same decision (e.g., one has clinical data, another has market data), integrate them
- NEVER let one weak or unreadable file degrade the quality of extraction from other files

SIGNAL SOURCE CLASSIFICATION:
- "internal": Controllable drivers
- "external": Environment signals outside direct control
- "missing": Critical unknowns

IMPORTANCE CALIBRATION — apply strictly:
- ADOPTION CONSTRAINT, EXECUTION BOTTLENECK, SUPPLY DEPENDENCY → "High"
- PAYER RESTRICTION, ACCESS BARRIER, REGULATORY GATE → "High"
- RESOURCE SHORTFALL → "High"
- COMPETITIVE THREAT with direct impact → "High"
- SUPPORTING CONTEXT → "Medium"
- PERIPHERAL → "Low"

CRITICAL RULES:
- SIGNALS MUST COME FROM THE MATERIALS, NOT FROM A TEMPLATE
- The decision question must be clear, specific, and suitable for forecasting
- Even with sparse materials, extract at least 3-5 candidate signals
- NEVER return empty signals
- For image inputs: extract all visible text, data, charts, tables, and annotations

Respond in JSON:
{
  "question": {
    "text": "The decision question in plain language",
    "restatedQuestion": "A formal restatement",
    "subject": "The brand/therapy/product name",
    "outcome": "What outcome is being evaluated",
    "timeHorizon": "e.g. 12 months",
    "questionType": "binary or comparative",
    "entities": [],
    "primaryConstraint": "The most likely barrier",
    "decisionType": "Launch timing / Adoption / etc."
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
      "source_file": "Which file this signal came from",
      "rationale": "Why this matters"
    }
  ],
  "missingSignals": [
    {
      "text": "What needs to be investigated",
      "importance": "High|Medium|Low",
      "category": "one of [${lib.categories.join(", ")}]",
      "reason": "Why needed"
    }
  ],
  "contradictions": [
    {
      "description": "What the contradiction is",
      "file_a": "First file name",
      "file_b": "Second file name",
      "resolution_suggestion": "How to resolve"
    }
  ],
  "primaryFile": "Name of the file inferred as most decision-relevant",
  "suggestedCaseType": "Short descriptor",
  "confidence": "High|Moderate|Low",
  "summary": "2-3 sentence summary of the combined materials"
}`;

    const messages: any[] = [{ role: "system", content: systemPrompt }];

    if (primaryImage && !combinedText) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: "Analyze the following bundle of project materials:" },
          {
            type: "image_url",
            image_url: { url: `data:${primaryImage.imageMimeType};base64,${primaryImage.imageBase64}`, detail: "high" },
          },
        ],
      });
    } else if (primaryImage && combinedText) {
      messages.push({
        role: "user",
        content: [
          { type: "text", text: `Analyze the following bundle of project materials and extract a unified forecasting case:\n\n---\n${combinedText}\n---` },
          {
            type: "image_url",
            image_url: { url: `data:${primaryImage.imageMimeType};base64,${primaryImage.imageBase64}`, detail: "high" },
          },
        ],
      });
    } else {
      messages.push({
        role: "user",
        content: `Analyze the following bundle of project materials and extract a unified forecasting case:\n\n---\n${combinedText}\n---`,
      });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      response_format: { type: "json_object" },
      temperature: 0.3,
      max_tokens: 6000,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "AI analysis returned empty response" });
      return;
    }

    const parsed = JSON.parse(content);

    const overallConfidence = parsed.confidence || (
      fileResults.every(f => f.confidence === "Low") ? "Low" :
        fileResults.some(f => f.confidence === "High") ? "Moderate" : "Moderate"
    );

    const question = parsed.question || {
      text: `What decision is implied by the submitted materials?`,
      restatedQuestion: `What is the primary decision these materials are intended to support?`,
      subject: "Unknown",
      outcome: "Decision outcome not yet determined",
      timeHorizon: "12 months",
      questionType: "binary",
      entities: [],
      primaryConstraint: "Insufficient information",
      decisionType: "Decision",
    };

    const signals = (parsed.signals && parsed.signals.length > 0) ? parsed.signals : [
      { text: "Bundle content could not be fully parsed — manual review recommended", direction: "neutral", importance: "High", confidence: "Weak", category: "evidence", signal_source: "missing", source_description: "Inferred from limited extraction", source_file: "Bundle" },
    ];

    res.json({
      question,
      signals,
      missingSignals: parsed.missingSignals || [],
      contradictions: parsed.contradictions || [],
      primaryFile: parsed.primaryFile || fileResults[0]?.fileName || "Unknown",
      suggestedCaseType: parsed.suggestedCaseType || "Decision",
      confidence: overallConfidence,
      summary: parsed.summary || "",
      lowConfidence: overallConfidence === "Low",
      environment: {
        context: env.context,
        label: env.label,
        rationale: env.rationale,
      },
      decisionArchetype: {
        primary: archetype.label,
        secondary: archetype.secondaryArchetypes.map(a => ARCHETYPE_LABELS[a as DecisionArchetype] || a),
        framing: archetype.decisionFraming,
        guardrailApplied: archetype.guardrailApplied,
        guardrailReason: archetype.guardrailReason || null,
        documentType: archetype.documentType,
        evidenceSpans: archetype.evidenceSpans,
        secondaryDecisions: archetype.secondaryDecisions,
        alternativeArchetype: archetype.alternativeArchetype || null,
        confidenceLevel: archetype.confidenceLevel,
        confidenceRationale: archetype.confidenceRationale,
      },
      fileManifest: fileResults.map(f => ({
        fileName: f.fileName,
        textLength: f.textLength,
        confidence: f.confidence,
        isImage: f.isImage,
      })),
    });

    await persistClassification(archetype, {
      sourceFileName: fileResults.map(f => f.fileName).join(", "),
      ingestionPath: "bundle",
    });
  } catch (err) {
    console.error("Bundle import error:", err);
    res.status(500).json({ error: "Failed to analyze project bundle" });
  }
});

export default router;
