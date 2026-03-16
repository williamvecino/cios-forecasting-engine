import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import casesRouter from "./cases.js";
import signalsRouter from "./signals.js";
import actorsRouter from "./actors.js";
import forecastsRouter from "./forecasts.js";
import analogsRouter from "./analogs.js";
import calibrationRouter from "./calibration.js";
import scenariosRouter from "./scenarios.js";
import guidanceRouter from "./guidance.js";
import fieldRouter from "./field.js";
import watchlistRouter from "./watchlist.js";
import seedRouter from "./seed.js";
import discoverRouter from "./discover.js";
import simulationRouter from "./simulation.js";
import intelligenceRouter from "./intelligence.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(casesRouter);
router.use(signalsRouter);
router.use(actorsRouter);
router.use(forecastsRouter);
router.use(analogsRouter);
router.use(calibrationRouter);
router.use(scenariosRouter);
router.use(guidanceRouter);
router.use(fieldRouter);
router.use(watchlistRouter);
router.use(seedRouter);
router.use(discoverRouter);
router.use(simulationRouter);
router.use(intelligenceRouter);

export default router;
