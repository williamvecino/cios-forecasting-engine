import { Router } from "express";
import { db } from "@workspace/db";
import { signalPrecedentLibraryTable } from "@workspace/db";
import { getPrecedentLibrary, seedPrecedentLibrary, lookupPrecedentLr, ENGINE_VERSION, PRECEDENT_LIBRARY_VERSION, SIGNAL_SET_VERSION, CALCULATION_RULE_VERSION } from "../lib/precedent-lookup.js";

const router = Router();

router.get("/precedent-library", async (_req, res) => {
  try {
    const rows = await db.select().from(signalPrecedentLibraryTable);
    if (rows.length === 0) {
      const library = getPrecedentLibrary();
      return res.json({
        source: "in-memory",
        engineVersion: ENGINE_VERSION,
        libraryVersion: PRECEDENT_LIBRARY_VERSION,
        signalSetVersion: SIGNAL_SET_VERSION,
        calculationRuleVersion: CALCULATION_RULE_VERSION,
        entries: library,
      });
    }
    return res.json({
      source: "database",
      engineVersion: ENGINE_VERSION,
      libraryVersion: PRECEDENT_LIBRARY_VERSION,
      signalSetVersion: SIGNAL_SET_VERSION,
      calculationRuleVersion: CALCULATION_RULE_VERSION,
      entries: rows,
    });
  } catch (err) {
    console.error("[precedent-library] GET failed:", err);
    return res.status(500).json({ error: "Failed to fetch precedent library" });
  }
});

router.post("/precedent-library/seed", async (_req, res) => {
  try {
    await seedPrecedentLibrary();
    const rows = await db.select().from(signalPrecedentLibraryTable);
    return res.json({
      seeded: true,
      count: rows.length,
      engineVersion: ENGINE_VERSION,
      libraryVersion: PRECEDENT_LIBRARY_VERSION,
    });
  } catch (err) {
    console.error("[precedent-library] seed failed:", err);
    return res.status(500).json({ error: "Failed to seed precedent library" });
  }
});

router.get("/precedent-library/lookup", async (req, res) => {
  const signalType = (req.query.signalType as string) ?? "";
  const direction = (req.query.direction as string) ?? "negative";
  if (!signalType) {
    return res.status(400).json({ error: "signalType query parameter required" });
  }
  const result = lookupPrecedentLr(signalType, direction);
  return res.json(result);
});

router.get("/engine-version", async (_req, res) => {
  return res.json({
    engine: ENGINE_VERSION,
    precedentLibrary: PRECEDENT_LIBRARY_VERSION,
    signalSet: SIGNAL_SET_VERSION,
    calculationRules: CALCULATION_RULE_VERSION,
  });
});

export default router;
