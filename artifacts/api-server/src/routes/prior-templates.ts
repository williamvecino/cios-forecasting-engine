import { Router } from "express";
import { db } from "@workspace/db";
import { priorTemplatesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/prior-templates", async (_req, res) => {
  try {
    const templates = await db.select().from(priorTemplatesTable);
    res.json(templates);
  } catch (err) {
    console.error("Failed to fetch prior templates:", err);
    res.status(500).json({ error: "Failed to fetch prior templates" });
  }
});

router.get("/prior-templates/:id", async (req, res) => {
  try {
    const [template] = await db.select().from(priorTemplatesTable).where(eq(priorTemplatesTable.id, req.params.id));
    if (!template) return res.status(404).json({ error: "Template not found" });
    res.json(template);
  } catch (err) {
    console.error("Failed to fetch prior template:", err);
    res.status(500).json({ error: "Failed to fetch prior template" });
  }
});

export default router;
