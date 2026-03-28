import { Router } from "express";
import { ARCHETYPE_LIBRARY } from "../lib/archetype-library";
import { assignArchetypesForSegmentation, assignArchetypes, type SegmentProfile } from "../lib/archetype-assignment";

const router = Router();

router.get("/archetypes/library", (_req, res) => {
  res.json(ARCHETYPE_LIBRARY);
});

router.post("/archetypes/assign", (req, res) => {
  try {
    const { segmentation, gates } = req.body;

    if (!segmentation) {
      res.status(400).json({ error: "segmentation is required" });
      return;
    }

    const assignments = assignArchetypesForSegmentation(segmentation, gates || []);
    res.json({ assignments });
  } catch (err: any) {
    console.error("[archetypes/assign] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to assign archetypes" });
  }
});

router.post("/archetypes/assign-single", (req, res) => {
  try {
    const { profile, gates } = req.body;

    if (!profile?.segment_name) {
      res.status(400).json({ error: "profile.segment_name is required" });
      return;
    }

    const assignment = assignArchetypes(profile as SegmentProfile, gates || []);
    res.json(assignment);
  } catch (err: any) {
    console.error("[archetypes/assign-single] Error:", err?.message || err);
    res.status(500).json({ error: "Failed to assign archetype" });
  }
});

export default router;
