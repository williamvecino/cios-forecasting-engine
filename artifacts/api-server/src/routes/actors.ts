import { Router } from "express";
import { db } from "@workspace/db";
import { actorsTable, specialtyActorSetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

router.get("/actors", async (_req, res) => {
  const actors = await db.select().from(actorsTable).orderBy(actorsTable.slotIndex);
  res.json(actors);
});

router.put("/actors/:actorId", async (req, res) => {
  const body = req.body;
  const [updated] = await db.update(actorsTable)
    .set({
      influenceWeight: body.influenceWeight,
      positiveResponseFactor: body.positiveResponseFactor,
      negativeResponseFactor: body.negativeResponseFactor,
      roleInSystem: body.roleInSystem,
    })
    .where(eq(actorsTable.id, req.params.actorId))
    .returning();
  if (!updated) return res.status(404).json({ error: "Not found" });
  res.json(updated);
});

router.get("/specialty-profiles", async (_req, res) => {
  const rows = await db.select().from(specialtyActorSetsTable).orderBy(
    specialtyActorSetsTable.primarySpecialtyProfile,
    specialtyActorSetsTable.actorSlot
  );

  const profileMap: Record<string, typeof rows> = {};
  for (const row of rows) {
    if (!profileMap[row.primarySpecialtyProfile]) {
      profileMap[row.primarySpecialtyProfile] = [];
    }
    profileMap[row.primarySpecialtyProfile].push(row);
  }

  const result = Object.entries(profileMap).map(([profileName, actors]) => ({
    profileName,
    actors: actors.map((a) => ({
      slot: a.actorSlot,
      displayActor: a.displayActor,
      canonicalActor: a.canonicalActor,
      roleInSystem: a.roleInSystem,
      baseInfluenceWeight: a.baseInfluenceWeight,
      basePositiveResponseFactor: a.basePositiveResponseFactor,
      baseNegativeResponseFactor: a.baseNegativeResponseFactor,
      outcomeOrientation: a.outcomeOrientation,
    })),
  }));

  res.json(result);
});

export default router;
