import express from "express";
import { CFG } from "./config.js";
import { health } from "./routes/health.js";
import { providers } from "./routes/providers.js";
import { services } from "./routes/services.js";
import { call } from "./routes/call.js";
import { claimWorker } from "./claimWorker.js";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use(health);
app.use(providers);
app.use(services);
app.use(call);
app.use(claimWorker);

app.listen(CFG.port, () => {
  console.log(`API listening on :${CFG.port}`);
});
