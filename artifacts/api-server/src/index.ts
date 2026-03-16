import app from "./app";
import { seedAnalogLibrary } from "./lib/seed-data.js";

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
  seedAnalogLibrary().catch((err) =>
    console.error("[startup] Analog library seed failed:", err)
  );
});
