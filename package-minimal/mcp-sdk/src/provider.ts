import { WebSocketServer } from "ws";
import { ethers } from "ethers";
import type {
  ChainConfig,
  ProviderServiceDef,
  SaveIOUFn,
  ClientRequest,
  Hex,
} from "./types.js";
import { verifyDebitSig } from "./eip712.js";
import { quotePrice6 } from "./utils.js";
import { getEasPointers } from "./eas.js";
import { RPC_URL } from "./constants.js";

const SETTLEMENT_ABI = [
  "function nextNonce(address,address) view returns (uint256)",
  "function epoch(address) view returns (uint64)",
];
const REG_ESCROW_ABI = [
  "function balance(address) view returns (uint256)",
  "function unstakeAt(address) view returns (uint256)",
];

export class McpServer {
  private wss?: WebSocketServer;
  private services = new Map<Hex, ProviderServiceDef>();
  private allowDirect: boolean;
  private saveIOU?: SaveIOUFn;

  constructor(opts: { allowDirectConnection: boolean; saveIOU?: SaveIOUFn }) {
    this.allowDirect = opts.allowDirectConnection;
    this.saveIOU = opts.saveIOU;
  }

  bindService(def: ProviderServiceDef) {
    this.services.set(def.serviceId, def);
  }

  start(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => {
      ws.on("message", (data) => this.handle(ws, data));
    });
    console.log(`MCP provider WS listening :${port}`);
  }

  stop() {
    this.wss?.close();
  }

  private async handle(ws: any, data: any) {
    try {
      const msg = JSON.parse(data.toString());
      const { id, method, params } = msg;
      if (method !== "mcp.call") throw new Error("unknown method");

      const payload = params as ClientRequest;
      const def = this.services.get(payload.debit.serviceId);
      if (!def) throw new Error("service not found");

      // verify amount == quoted
      const quoted = quotePrice6(
        {
          providerAddr: payload.debit.provider,
          serviceId: payload.debit.serviceId,
          unit: def.unit,
          pricePerUnit6: def.pricePerUnit6,
        } as any,
        payload.request
      );
      if (payload.debit.amount !== quoted) throw new Error("amount mismatch");

      // verify signature + on-chain nonce/epoch + deadline/budget
      await this.verifyAll(payload);

      // store IOU if direct mode
      if (this.allowDirect) {
        if (!this.saveIOU) throw new Error("saveIOU not configured");
        await this.saveIOU({
          debit: payload.debit,
          signature: payload.signature,
        });
      }

      // run handler
      const { result } = await def.handler(payload.request);

      ws.send(
        JSON.stringify({ jsonrpc: "2.0", id, result: { ok: true, result } })
      );
    } catch (e: any) {
      try {
        const msg = JSON.parse(data.toString());
        const id = msg?.id;
        (ws as any).send(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { ok: false, error: e?.message || "error" },
          })
        );
      } catch {
        (ws as any).send(
          JSON.stringify({
            jsonrpc: "2.0",
            id: null,
            result: { ok: false, error: "bad request" },
          })
        );
      }
    }
  }

  private async verifyAll(payload: ClientRequest) {
    const { debit, signature } = payload;

    const pointers = await getEasPointers();
    // 1) sig recovery matches payer
    const recovered = await verifyDebitSig(
      pointers.settlement,
      debit,
      signature
    );
    if (recovered.toLowerCase() !== debit.payer.toLowerCase())
      throw new Error("bad signature");

    // 2) deadline not expired
    const now = BigInt(Math.floor(Date.now() / 1000));
    if (debit.deadline < now) throw new Error("signature expired");

    // 3) on-chain nonce & epoch
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const settlement = new ethers.Contract(
      pointers.settlement,
      SETTLEMENT_ABI,
      provider
    );
    const expectedNonce = await settlement.nextNonce(
      debit.payer,
      debit.provider
    );
    if (debit.nonce !== BigInt(expectedNonce)) throw new Error("bad nonce");

    const expectedEpoch = await settlement.epoch(debit.payer);
    if (debit.epoch !== BigInt(expectedEpoch))
      throw new Error("epoch mismatch");

    // 4) escrow budget & unstake window
    const escrow = new ethers.Contract(
      pointers.escrow,
      REG_ESCROW_ABI,
      provider
    );
    const stake = await escrow.balance(debit.payer);
    if (BigInt(stake) < debit.amount) throw new Error("insufficient escrow");
    const unstakeDeadline = await escrow.unstakeAt(debit.payer);
    if (BigInt(unstakeDeadline) !== 0n && now > BigInt(unstakeDeadline)) {
      throw new Error("past-unstake-deadline");
    }
  }
}
