import { Router } from "express";
import { seedDatabase } from "../lib/seed-data.js";

const router = Router();

router.post("/seed", async (_req, res) => {
  const result = await seedDatabase();
  res.json(result);
});

export default router;
