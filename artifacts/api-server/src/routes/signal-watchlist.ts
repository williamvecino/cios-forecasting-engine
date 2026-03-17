import { Router } from "express";
import { db, signalWatchlistTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const VALID_STATUSES = ["Upcoming", "Monitoring", "Occurred", "Closed"] as const;

const router = Router();

router.get("/signal-watchlist", async (_req, res) => {
  const entries = await db
    .select()
    .from(signalWatchlistTable)
    .orderBy(desc(signalWatchlistTable.expectedDate));
  res.json(entries);
});

router.get("/signal-watchlist/:watchEventId", async (req, res) => {
  const rows = await db
    .select()
    .from(signalWatchlistTable)
    .where(eq(signalWatchlistTable.watchEventId, req.params.watchEventId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Watchlist entry not found" });
  res.json(rows[0]);
});

router.get("/cases/:caseId/signal-watchlist", async (req, res) => {
  const entries = await db
    .select()
    .from(signalWatchlistTable)
    .where(eq(signalWatchlistTable.caseId, req.params.caseId))
    .orderBy(desc(signalWatchlistTable.expectedDate));
  res.json(entries);
});

router.post("/signal-watchlist", async (req, res) => {
  const body = req.body;

  if (!body.eventType || !body.eventName) {
    return res.status(400).json({ error: "eventType and eventName are required" });
  }

  const status = VALID_STATUSES.includes(body.status) ? body.status : "Upcoming";

  const [entry] = await db.insert(signalWatchlistTable).values({
    id: randomUUID(),
    watchEventId: `WE-${Date.now()}`,
    caseId: body.caseId || null,
    eventType: body.eventType,
    eventName: body.eventName,
    eventDescription: body.eventDescription || null,
    targetAssetOrCompetitor: body.targetAssetOrCompetitor || null,
    expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
    status,
    potentialSignalCategory: body.potentialSignalCategory || null,
    expectedDirection: body.expectedDirection || null,
    sourceLink: body.sourceLink || null,
    notes: body.notes || null,
  }).returning();

  res.status(201).json(entry);
});

router.patch("/signal-watchlist/:watchEventId", async (req, res) => {
  const { watchEventId } = req.params;
  const body = req.body;

  const rows = await db
    .select()
    .from(signalWatchlistTable)
    .where(eq(signalWatchlistTable.watchEventId, watchEventId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Watchlist entry not found" });

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.eventType) updates.eventType = body.eventType;
  if (body.eventName) updates.eventName = body.eventName;
  if (body.eventDescription !== undefined) updates.eventDescription = body.eventDescription;
  if (body.targetAssetOrCompetitor !== undefined) updates.targetAssetOrCompetitor = body.targetAssetOrCompetitor;
  if (body.expectedDate !== undefined) updates.expectedDate = body.expectedDate ? new Date(body.expectedDate) : null;
  if (body.status && VALID_STATUSES.includes(body.status)) updates.status = body.status;
  if (body.potentialSignalCategory !== undefined) updates.potentialSignalCategory = body.potentialSignalCategory;
  if (body.expectedDirection !== undefined) updates.expectedDirection = body.expectedDirection;
  if (body.sourceLink !== undefined) updates.sourceLink = body.sourceLink;
  if (body.notes !== undefined) updates.notes = body.notes;

  const [updated] = await db
    .update(signalWatchlistTable)
    .set(updates)
    .where(eq(signalWatchlistTable.watchEventId, watchEventId))
    .returning();

  res.json(updated);
});

router.delete("/signal-watchlist/:watchEventId", async (req, res) => {
  const { watchEventId } = req.params;
  const rows = await db
    .select()
    .from(signalWatchlistTable)
    .where(eq(signalWatchlistTable.watchEventId, watchEventId))
    .limit(1);
  if (!rows[0]) return res.status(404).json({ error: "Watchlist entry not found" });

  await db.delete(signalWatchlistTable).where(eq(signalWatchlistTable.watchEventId, watchEventId));
  res.json({ deleted: true, watchEventId });
});

export default router;
