import { Router } from "express";
import { randomUUID } from "crypto";
import { Providers, servicesByProvider, pendingByProvider } from "../stores.js";

export const providers = Router();

// Register a provider (super simple for MVP)
providers.post("/providers/register", (req, res) => {
  const { providerAddr, name } = req.body || {};
  if (!providerAddr || !name) return res.status(400).json({ error: "providerAddr & name required" });
  const apiKey = randomUUID().replace(/-/g, "");
  Providers.set(apiKey, { providerAddr, name, apiKey });
  res.json({ apiKey });
});

// List provider services
providers.get("/providers/me/services", (req, res) => {
  const apiKey = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const p = Providers.get(apiKey);
  if (!p) return res.status(401).json({ error: "bad api key" });
  res.json({ services: servicesByProvider(p.providerAddr) });
});

// Pending IOUs
providers.get("/providers/me/pending", (req, res) => {
  const apiKey = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const p = Providers.get(apiKey);
  if (!p) return res.status(401).json({ error: "bad api key" });
  res.json({ pending: pendingByProvider(p.providerAddr) });
});
