import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

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

    const systemPrompt = `You are a pharmaceutical market intelligence analyst. You receive unstructured project materials — emails, RFPs, market summaries, meeting notes, reports, spreadsheets, screenshots, charts, or images — and you must extract a structured forecasting case from them.

Your job:
1. Identify the core DECISION QUESTION the materials are about
2. Extract KEY SIGNALS — concrete facts, data points, or observations from the materials
3. Identify MISSING SIGNALS — things the team should investigate but aren't in the materials
4. Determine the subject (brand/therapy/product), outcome, time horizon, and question type

RULES:
- The decision question must be a clear, specific binary or comparative question suitable for Bayesian forecasting
- Signals must be factual, specific, and sourced from the materials
- Each signal needs: text (what was found), direction (positive/negative/neutral — does it support or slow the outcome), importance (High/Medium/Low), confidence (Strong/Moderate/Weak), category (evidence/access/competition/guideline/timing/adoption), and a brief source description
- Missing signals should be specific investigable items, not vague suggestions
- If the materials don't clearly indicate a decision question, infer the most likely one based on the content
- For image inputs: carefully read all visible text, data, charts, tables, and annotations in the image

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
      "text": "Signal description",
      "direction": "positive|negative|neutral",
      "importance": "High|Medium|Low",
      "confidence": "Strong|Moderate|Weak",
      "category": "evidence|access|competition|guideline|timing|adoption",
      "source_description": "Where in the materials this was found",
      "rationale": "Why this matters for the decision"
    }
  ],
  "missingSignals": [
    {
      "text": "What needs to be investigated",
      "importance": "High|Medium|Low",
      "category": "evidence|access|competition|guideline|timing|adoption",
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
    });
  } catch (err) {
    console.error("Import project error:", err);
    res.status(500).json({ error: "Failed to analyze project materials" });
  }
});

export default router;
