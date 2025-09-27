import { Router } from "express";
import { IOUs, Providers, pendingByProvider } from "./stores.js";
import { settlement, relayer } from "./eth.js";

export const claimWorker = Router();

/**
 * Provider triggers a claim (batch settle all their pending IOUs up to N)
 * Header: Authorization: Bearer <apiKey>
 */
claimWorker.post("/providers/claim", async (req, res) => {
  const apiKey = String(req.headers.authorization || "").replace(
    /^Bearer\s+/i,
    ""
  );
  const provider = Providers.get(apiKey);
  if (!provider) return res.status(401).json({ error: "bad api key" });

  try {
    const pending = pendingByProvider(provider.providerAddr).slice(0, 50);
    if (!pending.length) return res.json({ ok: true, txHash: null, count: 0 });

    const debits = pending.map((i) => i.debit);
    const sigs = pending.map((i) => i.signature);

    const tx = await (settlement as any)
      .connect(relayer)
      .settleBatch(debits as any, sigs);
    const rc = await tx.wait();

    // Mark settled
    for (const iou of pending) {
      IOUs.set(iou.id, { ...iou, status: "settled" });
    }
    return res.json({ ok: true, txHash: rc?.hash, count: pending.length });
  } catch (e: any) {
    return res
      .status(500)
      .json({ ok: false, error: e?.message ?? "settle failed" });
  }
});
