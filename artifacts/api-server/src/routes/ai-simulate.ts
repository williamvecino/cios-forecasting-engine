import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";
import { getProfileForQuestion, buildVocabularyConstraintPrompt } from "../lib/case-type-router.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface SimulateRequest {
  segment: string;
  archetype?: string | null;
  materialText?: string;
  materialBase64?: string;
  materialFileName?: string;
  materialMimeType?: string;
  questionText: string;
  subject: string;
  timeHorizon?: string;
  probability?: number | null;
  constrainedProbability?: number | null;
  gates?: { gate_label: string; status: string; constrains_probability_to: number; reasoning: string }[];
  barriers?: { title: string; rationale: string; severity_or_priority: string }[];
  triggers?: { title: string; rationale: string }[];
  signals?: { text: string; direction: string; importance: string }[];
}

interface MaterialFeature {
  feature: string;
  strength: "strong" | "moderate" | "weak" | "absent";
  detail: string;
}

function isImageMime(mime: string): boolean {
  return ["image/jpeg", "image/png", "image/jpg", "image/webp"].includes(mime);
}

function isImageFile(fileName: string): boolean {
  return [".jpg", ".jpeg", ".png", ".webp"].includes(
    "." + fileName.split(".").pop()?.toLowerCase()
  );
}

async function extractTextFromFile(base64: string, mimeType: string, fileName: string): Promise<string> {
  const buffer = Buffer.from(base64, "base64");

  if (mimeType === "application/pdf" || fileName.toLowerCase().endsWith(".pdf")) {
    let parser: any = null;
    try {
      const { PDFParse } = await import("pdf-parse");
      parser = new PDFParse({ data: buffer });
      await parser.load();
      const textResult = await parser.getText();
      const text = (textResult.text || "").slice(0, 15000);
      try { await parser.destroy(); } catch (cleanupErr) { console.error("PDF parser cleanup error (non-fatal):", cleanupErr); }
      parser = null;
      return text;
    } catch {
      if (parser) { try { await parser.destroy(); } catch {} }
      return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000) || "[PDF extraction failed]";
    }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" || fileName.toLowerCase().endsWith(".pptx")) {
    try {
      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      const slideTexts: string[] = [];
      const slideFiles = Object.keys(zip.files)
        .filter(f => f.startsWith("ppt/slides/slide") && f.endsWith(".xml"))
        .sort();
      for (const sf of slideFiles) {
        const xml = await zip.files[sf].async("text");
        const texts = xml.match(/<a:t>([^<]*)<\/a:t>/g);
        if (texts) {
          slideTexts.push(texts.map(t => t.replace(/<\/?a:t>/g, "")).join(" "));
        }
      }
      return slideTexts.join("\n\n").slice(0, 15000);
    } catch { return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000); }
  }

  if (mimeType === "application/vnd.ms-powerpoint" || fileName.toLowerCase().endsWith(".ppt")) {
    try {
      const pptToText = await import("ppt-to-text");
      const text = pptToText.extractText(buffer);
      return (typeof text === "string" ? text : String(text)).slice(0, 15000);
    } catch { return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000); }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.toLowerCase().endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 15000);
    } catch { return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000); }
  }

  if (mimeType === "application/msword" || fileName.toLowerCase().endsWith(".doc")) {
    try {
      const WordExtractor = (await import("word-extractor")).default;
      const extractor = new WordExtractor();
      const doc = await extractor.extract(buffer);
      const body = doc.getBody() || "";
      return body.slice(0, 15000);
    } catch { return buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r\t]/g, " ").replace(/\s{3,}/g, " ").slice(0, 15000); }
  }

  return buffer.toString("utf-8").slice(0, 15000);
}

const REACTION_FEATURES = [
  "efficacy_strength",
  "survival_benefit",
  "safety_reassurance",
  "real_world_evidence",
  "guideline_relevance",
  "access_support",
  "heor_cost_effectiveness",
  "workflow_convenience",
  "operational_support",
  "comparative_evidence",
  "implementation_burden",
  "patient_support_adherence",
];

const FEATURE_LABELS: Record<string, string> = {
  efficacy_strength: "Efficacy Strength",
  survival_benefit: "Survival Benefit",
  safety_reassurance: "Safety Reassurance",
  real_world_evidence: "Real-World Evidence",
  guideline_relevance: "Guideline Relevance",
  access_support: "Access Support",
  heor_cost_effectiveness: "HEOR / Cost-Effectiveness",
  workflow_convenience: "Workflow Convenience",
  operational_support: "Operational Support",
  comparative_evidence: "Comparative Evidence",
  implementation_burden: "Implementation Burden",
  patient_support_adherence: "Patient Support / Adherence",
};

async function extractMaterialFeatures(
  materialContent: string,
  imagePayload: { base64: string; mimeType: string } | null,
  subject: string
): Promise<MaterialFeature[]> {
  const systemPrompt = `You are a material feature extractor for stakeholder reaction analysis. You do NOT summarize documents. You extract only the reaction-relevant features present in the material.

For each feature, assess whether the material contains it and how strongly:
- "strong" — clear, direct evidence or messaging on this dimension
- "moderate" — some relevant content, indirect or partial
- "weak" — barely mentioned or implied
- "absent" — not present in the material

FEATURES TO ASSESS:
${REACTION_FEATURES.map(f => `- "${f}": ${FEATURE_LABELS[f]}`).join("\n")}

RULES:
- Extract ONLY what is in the material. Do not infer what is missing.
- Do not summarize the document. Output a feature map.
- Each feature gets a one-sentence "detail" explaining what the material says about it.
- If absent, detail should say what is missing.

OUTPUT FORMAT (return valid JSON):
{
  "features": [
    { "feature": "<feature_key>", "strength": "strong|moderate|weak|absent", "detail": "One sentence" }
  ]
}`;

  const userPrompt = `Extract reaction-relevant features from this material about "${subject}":\n\n${materialContent || "[See attached image]"}`;

  const messages: any[] = [{ role: "system", content: systemPrompt }];

  if (imagePayload) {
    messages.push({
      role: "user",
      content: [
        { type: "text", text: userPrompt },
        { type: "image_url", image_url: { url: `data:${imagePayload.mimeType};base64,${imagePayload.base64}` } },
      ],
    });
  } else {
    messages.push({ role: "user", content: userPrompt });
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 2000,
    messages,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) return [];

  const parsed = JSON.parse(content);
  const featureMap = new Map<string, MaterialFeature>();

  for (const f of parsed.features || []) {
    if (REACTION_FEATURES.includes(f.feature) && ["strong", "moderate", "weak", "absent"].includes(f.strength)) {
      featureMap.set(f.feature, {
        feature: f.feature,
        strength: f.strength,
        detail: typeof f.detail === "string" ? f.detail : "",
      });
    }
  }

  const normalized: MaterialFeature[] = REACTION_FEATURES.map(key => {
    if (featureMap.has(key)) return featureMap.get(key)!;
    return {
      feature: key,
      strength: "absent" as const,
      detail: `Not addressed in the material`,
    };
  });

  return normalized;
}

router.post("/ai-simulate/reaction", upload.single("file"), async (req, res) => {
  try {
    let body: SimulateRequest;

    if (req.file) {
      const jsonData = req.body.data ? JSON.parse(req.body.data) : {};
      const base64 = req.file.buffer.toString("base64");
      body = {
        ...jsonData,
        materialBase64: base64,
        materialFileName: req.file.originalname,
        materialMimeType: req.file.mimetype,
      };
    } else {
      body = req.body as SimulateRequest;
    }

    if (!body.segment || !body.questionText || !body.subject) {
      res.status(400).json({ error: "segment, questionText, and subject are required" });
      return;
    }

    let materialContent = "";
    let imagePayload: { base64: string; mimeType: string } | null = null;

    if (body.materialText) {
      materialContent = body.materialText.slice(0, 15000);
    }

    if (body.materialBase64 && body.materialFileName && body.materialMimeType) {
      if (isImageMime(body.materialMimeType) || isImageFile(body.materialFileName)) {
        imagePayload = { base64: body.materialBase64, mimeType: body.materialMimeType };
      } else {
        materialContent = await extractTextFromFile(body.materialBase64, body.materialMimeType, body.materialFileName);
      }
    }

    const features = await extractMaterialFeatures(materialContent, imagePayload, body.subject);

    const featureMapText = features
      .filter(f => f.strength !== "absent")
      .map(f => `- ${FEATURE_LABELS[f.feature] || f.feature} [${f.strength}]: ${f.detail}`)
      .join("\n");

    const absentFeatures = features
      .filter(f => f.strength === "absent")
      .map(f => FEATURE_LABELS[f.feature] || f.feature);

    const constraintContext = buildConstraintContext(body);

    const caseTypeProfile = getProfileForQuestion(body.questionText);
    const isRegulatory = caseTypeProfile.caseType === "regulatory_approval";
    const vocabConstraints = buildVocabularyConstraintPrompt(caseTypeProfile);

    const archetypeContext = body.archetype ? `
ASSIGNED ARCHETYPE: ${body.archetype}
Use this archetype's known behavioral pattern to predict the reaction:${isRegulatory ? `
- Regulatory Evaluator: focuses on benefit-risk evidence quality and completeness
- Safety Specialist: prioritizes risk signal resolution and post-marketing plan adequacy
- Advisory Expert: weighs clinical significance and unmet need against safety uncertainty
- Patient Representative: advocates based on disease burden and access to treatment
- Regulatory Strategist: evaluates submission completeness and review pathway alignment` : `
- Evidence-Driven Innovator: moves on strong clinical data, low guideline dependence
- Operational Pragmatist: interested but blocked by workflow/staffing/infrastructure burden
- Guideline Follower: waits for NCCN/society/institutional endorsement before acting
- Financial Gatekeeper: delays until coverage is stable, access friction is low
- Skeptical Conservative: resists until post-launch real-world evidence accumulates`}
The archetype determines HOW this ${isRegulatory ? "stakeholder evaluates" : "segment decides"}, not just ${isRegulatory ? "their recommendation" : "WHETHER they adopt"}.` : "";

    const outcomeField = isRegulatory ? "decision_likelihood" : "adoption_likelihood";
    const outcomeLabel = isRegulatory ? "favorable decision" : "adoption";

    const systemPrompt = `You are a behavioral reaction scoring engine. You predict how a specific ${isRegulatory ? "regulatory stakeholder" : "market segment"} will respond to material features under current constraints.
${isRegulatory ? "\nThis is a REGULATORY APPROVAL case. Frame all predictions in terms of regulatory decision-making, not commercial adoption.\n" : ""}
You are given a FEATURE MAP extracted from the material — not the material itself. Score the reaction based on what the features contain and what they lack, combined with this ${isRegulatory ? "stakeholder's" : "segment's"} archetype-driven decision style.
${archetypeContext}${vocabConstraints}
RULES:
- Never use: "Bayesian", "posterior", "Brier", "likelihood ratio", "prior odds"
- "Probability" is allowed
- Ground every prediction in the constraints and features provided — never invent new barriers or triggers
- State clearly what the material changes and what it does not change
- Identify the primary remaining barrier after accounting for material impact
- Identify the strongest trigger that would increase movement for this ${isRegulatory ? "stakeholder" : "segment"}

OUTPUT FORMAT (return valid JSON):
{
  "${outcomeField}": <number 0-100>,
  "confidence": "High" | "Moderate" | "Low",
  "primary_reaction": "How this ${isRegulatory ? "stakeholder" : "segment"} will likely respond — grounded in the feature map and constraints",
  "what_this_changes": "What the material improves or strengthens for this ${isRegulatory ? "stakeholder" : "segment"}",
  "what_this_does_not_change": "What remains unchanged or unaddressed by this material",
  "primary_remaining_barrier": "The single most limiting constraint after this material is considered",
  "strongest_trigger_for_movement": "The specific event or change that would most increase ${outcomeLabel} for this ${isRegulatory ? "stakeholder" : "segment"}",
  "material_effectiveness": "How well the material addresses what this ${isRegulatory ? "stakeholder" : "segment"} needs to ${isRegulatory ? "support a favorable decision" : "move"}"
}`;

    const userPrompt = `Score the adoption reaction for:

SEGMENT: ${body.segment}${body.archetype ? `\nARCHETYPE: ${body.archetype}` : ""}
SUBJECT: ${body.subject}
QUESTION: ${body.questionText}
TIME HORIZON: ${body.timeHorizon || "12 months"}
CURRENT PROBABILITY: ${body.constrainedProbability != null ? `${Math.round(body.constrainedProbability * 100)}%` : body.probability != null ? `${Math.round(body.probability * 100)}%` : "Not yet calculated"}

${constraintContext}

EXTRACTED MATERIAL FEATURES:
${featureMapText || "No reaction-relevant features extracted."}

NOT PRESENT IN MATERIAL:
${absentFeatures.length > 0 ? absentFeatures.join(", ") : "All features covered."}

Score how the ${body.segment} segment will react given these features and current constraints. Do not create new constraints.`;

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ];

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: 2000,
      messages,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      res.status(500).json({ error: "No response generated" });
      return;
    }

    const parsed = JSON.parse(content);

    const likelihoodValue = parsed.adoption_likelihood ?? parsed.decision_likelihood;
    let rawLikelihood = typeof likelihoodValue === "number" ? Math.min(100, Math.max(0, Math.round(likelihoodValue))) : 50;

    if (body.constrainedProbability != null) {
      const cap = Math.round(body.constrainedProbability * 100) + 15;
      if (rawLikelihood > cap) {
        rawLikelihood = cap;
      }
    }

    const validated = {
      adoption_likelihood: rawLikelihood,
      confidence: ["High", "Moderate", "Low"].includes(parsed.confidence) ? parsed.confidence : "Moderate",
      primary_reaction: parsed.primary_reaction || "",
      what_this_changes: parsed.what_this_changes || "",
      what_this_does_not_change: parsed.what_this_does_not_change || "",
      primary_remaining_barrier: parsed.primary_remaining_barrier || "",
      strongest_trigger_for_movement: parsed.strongest_trigger_for_movement || "",
      material_effectiveness: parsed.material_effectiveness || "",
      material_features: features,
    };

    res.json(validated);
  } catch (err: any) {
    console.error("[ai-simulate] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to run simulation" });
  }
});

function buildConstraintContext(body: SimulateRequest): string {
  const parts: string[] = [];

  if (body.gates?.length) {
    parts.push("CURRENT GATES:");
    body.gates.forEach(g => {
      parts.push(`- ${g.gate_label} [${g.status}] — constrains to ${Math.round(g.constrains_probability_to * 100)}%: ${g.reasoning}`);
    });
  }

  if (body.barriers?.length) {
    parts.push("\nACTIVE BARRIERS:");
    body.barriers.forEach(b => {
      parts.push(`- [${b.severity_or_priority}] ${b.title}: ${b.rationale}`);
    });
  }

  if (body.triggers?.length) {
    parts.push("\nTRIGGER EVENTS:");
    body.triggers.forEach(t => {
      parts.push(`- ${t.title}: ${t.rationale}`);
    });
  }

  if (body.signals?.length) {
    parts.push("\nACTIVE SIGNALS:");
    body.signals.forEach(s => {
      parts.push(`- [${s.direction}] [${s.importance}] ${s.text}`);
    });
  }

  return parts.length > 0 ? parts.join("\n") : "No constraint data available.";
}

export default router;
