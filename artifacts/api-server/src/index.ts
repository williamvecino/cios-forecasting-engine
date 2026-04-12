import app from "./app";
import { seedAnalogLibrary, seedActorsIfEmpty } from "./lib/seed-data.js";

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
