import { Router } from "express";
import { AGENT_REGISTRY, AGENT_CHAIN_ORDER, getAgentChainSummary } from "../lib/agent-registry.js";

const router = Router();

router.get("/agent-registry", (_req, res) => {
  res.json({
    chain: getAgentChainSummary(),
    registry: Object.fromEntries(
      AGENT_CHAIN_ORDER.map((key) => [key, AGENT_REGISTRY[key]])
    ),
  });
});

export default router;
