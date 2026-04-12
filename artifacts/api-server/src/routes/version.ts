import { Router } from "express";
import {
  ENGINE_VERSION,
  PRECEDENT_LIBRARY_VERSION,
  SIGNAL_SET_VERSION,
  CALCULATION_RULE_VERSION,
} from "../lib/precedent-lookup.js";

const router = Router();

router.get("/version", (_req, res) => {
  res.json({
    app: "cios-forecasting-engine",
    engineVersion: ENGINE_VERSION,
    precedentLibraryVersion: PRECEDENT_LIBRARY_VERSION,
    signalSetVersion: SIGNAL_SET_VERSION,
    calculationRuleVersion: CALCULATION_RULE_VERSION,
  });
});

export default router;
