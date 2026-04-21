import { Router } from "express";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

router.post("/strategy/prompt", async (req, res) => {
  try {
    const { prompt, maxTokens } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing required field: prompt" });
    }

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_completion_tokens: maxTokens || 800,
      temperature: 0.3,
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices[0]?.message?.content || "";
    res.json({ text });
  } catch (err: any) {
    console.error("[strategy-prompt]", err);
    res.status(500).json({ error: err.message || "Strategy prompt failed" });
  }
});

export default router;
