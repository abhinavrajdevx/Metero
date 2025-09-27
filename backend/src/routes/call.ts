cimport { Router } from "express";
import { IOUs, Services } from "../stores.js";
import { preflightVerify } from "../verifyDebit.js";
import { v4 as uuidv4 } from "uuid";

export const call = Router();

/**
 * User calls a service:
 * body: { input, debit, signature }
 */
call.post("/call/:serviceId", async (req, res) => {
  try {
    const serviceId = String(req.params.serviceId);
    const svc = Services.get(serviceId);
    if (!svc) return res.status(404).json({ error: "service not found" });

    const { input, debit, signature } = req.body || {};
    if (!debit || !signature) return res.status(400).json({ error: "debit & signature required" });

    // 1) Verify debit/signature/nonce/epoch/deadline/budget/amount==price
    const typedDebit = await preflightVerify(debit, signature, input, svc);

    // 2) Persist IOU (pending)
    const id = uuidv4();
    IOUs.set(id, { id, debit: typedDebit, signature, status: "pending", createdAt: Date.now() });

    // 3) Execute the service (MVP: echo or pretend result; plug your provider webhook here)
    const result = { echo: input ?? null, note: "Service executed (MVP stub)" };

    return res.json({ ok: true, iouId: id, receipt: { amount: String(typedDebit.amount), nonce: String(typedDebit.nonce) }, result });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message ?? "bad request" });
  }
});
