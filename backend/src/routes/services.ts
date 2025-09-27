import { Router } from "express";
import { ethers } from "ethers";
import { Providers, Services } from "../stores.js";
import { Service } from "../types.js";
import { CFG } from "../config.js";

export const services = Router();

// Add a service
services.post("/services", (req, res) => {
  const apiKey = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const provider = Providers.get(apiKey);
  if (!provider) return res.status(401).json({ error: "bad api key" });

  const { slug, title, description, unit = "call", pricePerUnit6 } = req.body || {};
  if (!slug || !title || !pricePerUnit6) return res.status(400).json({ error: "slug, title, pricePerUnit6 required" });

  const serviceId = ethers.keccak256(ethers.toUtf8Bytes(`${provider.providerAddr}:${slug}`));
  const svc: Service = {
    serviceId,
    providerAddr: provider.providerAddr,
    slug,
    title,
    description,
    unit,
    pricePerUnit6: BigInt(pricePerUnit6),
    token: CFG.usdc,
  };
  Services.set(serviceId, svc);
  res.json({ serviceId });
});

// Get service info
services.get("/services/:serviceId", (req, res) => {
  const svc = Services.get(String(req.params.serviceId));
  if (!svc) return res.status(404).json({ error: "not found" });
  res.json(svc);
});
