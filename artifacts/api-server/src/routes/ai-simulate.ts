import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";
import multer from "multer";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

interface SimulateRequest {
  segment: string;
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
    try {
      const pdfParse = (await import("pdf-parse")).default;
      const result = await pdfParse(buffer);
      return result.text.slice(0, 15000);
    } catch { return "[PDF extraction failed]"; }
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
    } catch { return "[PPTX extraction failed]"; }
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || fileName.toLowerCase().endsWith(".docx")) {
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer });
      return result.value.slice(0, 15000);
    } catch { return "[DOCX extraction failed]"; }
  }

  return buffer.toString("utf-8").slice(0, 15000);
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

    const constraintContext = buildConstraintContext(body);

    const systemPrompt = `You are a behavioral reaction forecasting engine. You predict how a specific market segment will respond to specific materials given the current constraints on the decision.

You do NOT create new constraints. You use the existing gates, barriers, and triggers provided. Your job is to evaluate whether the presented material would change behavior for the specified segment, given what constrains the market right now.

RULES:
- Never use: "Bayesian", "posterior", "Brier", "likelihood ratio", "prior odds"
- "Probability" is allowed
- Ground every prediction in the constraints provided — never invent new barriers or triggers
- Be specific to the segment — different segments react differently to the same material
- The reaction must account for what currently limits adoption, not just whether the material is compelling

OUTPUT FORMAT (return valid JSON):
{
  "adoption_likelihood": <number 0-100>,
  "confidence": "High" | "Moderate" | "Low",
  "primary_reaction": "One to two sentences — how this segment will likely respond to this material given current constraints",
  "barrier_sensitivity": "One sentence — which existing constraint most limits this segment's response",
  "trigger_condition": "One sentence — what specific event or change would increase this segment's adoption probability, and by how much",
  "material_effectiveness": "One sentence — how well the material addresses what this segment needs to move"
}`;

    const userPrompt = `Simulate the adoption reaction for:

SEGMENT: ${body.segment}
SUBJECT: ${body.subject}
QUESTION: ${body.questionText}
TIME HORIZON: ${body.timeHorizon || "12 months"}
CURRENT PROBABILITY: ${body.constrainedProbability != null ? `${Math.round(body.constrainedProbability * 100)}%` : body.probability != null ? `${Math.round(body.probability * 100)}%` : "Not yet calculated"}

${constraintContext}

MATERIAL BEING TESTED:
${materialContent || "[See attached image]"}

Predict how the ${body.segment} segment will react to this material given the current constraints. Do not create new constraints — use only what is provided above.`;

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
    if (!content) {
      res.status(500).json({ error: "No response generated" });
      return;
    }

    const parsed = JSON.parse(content);

    let rawLikelihood = typeof parsed.adoption_likelihood === "number" ? Math.min(100, Math.max(0, Math.round(parsed.adoption_likelihood))) : 50;

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
      barrier_sensitivity: parsed.barrier_sensitivity || "",
      trigger_condition: parsed.trigger_condition || "",
      material_effectiveness: parsed.material_effectiveness || "",
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
