import { Router } from "express";
import { seedDatabase } from "../lib/seed-data.js";

const router = Router();

router.post("/seed", async (req, res) => {
  const force = req.query.force === "true" || req.body?.force === true;
  const result = await seedDatabase(force);
  res.json(result);
});

export default router;
