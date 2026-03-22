import { Router } from "express";
import { db, targetEntitiesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

const router = Router();

const VALID_TARGET_TYPES = ["market", "specialty", "subspecialty", "institution", "physician"];

router.get("/target-entities", async (_req, res) => {
  const entities = await db.select().from(targetEntitiesTable);
  res.json(entities);
});

router.get("/target-entities/:id", async (req, res) => {
  const rows = await db.select().from(targetEntitiesTable).where(eq(targetEntitiesTable.id, req.params.id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Target entity not found" });
  res.json(rows[0]);
});

router.post("/target-entities", async (req, res) => {
  const { targetType, targetName, specialty, subspecialty, institutionId, institutionName, physicianName, physicianNpi, geography, segmentTags } = req.body;

  if (!targetType || !VALID_TARGET_TYPES.includes(targetType)) {
    return res.status(400).json({ error: `targetType is required and must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
  }
  if (!targetName) {
    return res.status(400).json({ error: "targetName is required" });
  }

  const id = randomUUID();
  await db.insert(targetEntitiesTable).values({
    id,
    targetType,
    targetName,
    specialty: specialty ?? null,
    subspecialty: subspecialty ?? null,
    institutionId: institutionId ?? null,
    institutionName: institutionName ?? null,
    physicianName: physicianName ?? null,
    physicianNpi: physicianNpi ?? null,
    geography: geography ?? null,
    segmentTags: segmentTags ?? [],
  });

  const created = await db.select().from(targetEntitiesTable).where(eq(targetEntitiesTable.id, id)).limit(1);
  res.status(201).json(created[0]);
});

router.put("/target-entities/:id", async (req, res) => {
  const rows = await db.select().from(targetEntitiesTable).where(eq(targetEntitiesTable.id, req.params.id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Target entity not found" });

  const updates: Record<string, any> = {};
  const allowed = ["targetType", "targetName", "specialty", "subspecialty", "institutionId", "institutionName", "physicianName", "physicianNpi", "geography", "segmentTags", "isActive"];
  for (const key of allowed) {
    if (req.body[key] !== undefined) updates[key] = req.body[key];
  }
  if (updates.targetType && !VALID_TARGET_TYPES.includes(updates.targetType)) {
    return res.status(400).json({ error: `targetType must be one of: ${VALID_TARGET_TYPES.join(", ")}` });
  }

  await db.update(targetEntitiesTable).set(updates).where(eq(targetEntitiesTable.id, req.params.id));
  const updated = await db.select().from(targetEntitiesTable).where(eq(targetEntitiesTable.id, req.params.id)).limit(1);
  res.json(updated[0]);
});

router.delete("/target-entities/:id", async (req, res) => {
  const rows = await db.select().from(targetEntitiesTable).where(eq(targetEntitiesTable.id, req.params.id)).limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Target entity not found" });
  await db.delete(targetEntitiesTable).where(eq(targetEntitiesTable.id, req.params.id));
  res.json({ deleted: true });
});

export default router;
