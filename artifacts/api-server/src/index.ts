import app from "./app";
import { seedAnalogLibrary, seedActorsIfEmpty } from "./lib/seed-data.js";
import {
  ENGINE_VERSION,
  PRECEDENT_LIBRARY_VERSION,
  SIGNAL_SET_VERSION,
  CALCULATION_RULE_VERSION,
} from "./lib/precedent-lookup.js";

if (process.argv.includes("--version")) {
  console.log(`cios-forecasting-engine`);
  console.log(`  Engine:             ${ENGINE_VERSION}`);
  console.log(`  Precedent Library:  ${PRECEDENT_LIBRARY_VERSION}`);
  console.log(`  Signal Set:         ${SIGNAL_SET_VERSION}`);
  console.log(`  Calculation Rules:  ${CALCULATION_RULE_VERSION}`);
  process.exit(0);
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
  seedActorsIfEmpty().catch((err) =>
    console.error("[startup] Actor seed failed:", err)
  );
  seedAnalogLibrary().catch((err) =>
    console.error("[startup] Analog library seed failed:", err)
  );
});
