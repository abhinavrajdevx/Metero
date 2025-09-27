import { WebSocket } from "ws";
import { ethers } from "ethers";
import type {
  MCPInit,
  ServiceMeta,
  Debit,
  ClientRequest,
  Hex,
} from "./types.js";
import { Registry } from "./registry.js";
import { quotePrice6 } from "./utils.js";
import { signDebit } from "./eip712.js";
import { getEasPointers } from "./eas.js";
import { RPC_URL } from "./constants.js";

const SETTLEMENT_ABI = [
  "function nextNonce(address,address) view returns (uint256)",
  "function epoch(address) view returns (uint64)",
];

export class MCP {
  readonly evmAddress: Hex;
  readonly signer?: ethers.Signer;
  readonly useRelayer: boolean;
  readonly relayerBaseUrl?: string;
  readonly registry?: Registry; // optional: if you have a separate registry contract

  constructor(cfg: MCPInit & { registryAddress?: Hex }) {
    this.evmAddress = cfg.evmAddress;
    this.signer = cfg.signer;
    this.useRelayer = !!cfg.useRelayer;
    this.relayerBaseUrl = cfg.relayerBaseUrl;
    if (cfg.registryAddress)
      this.registry = new Registry(cfg.registryAddress);
  }

  async getService(serviceId: Hex, metaOverride?: Partial<ServiceMeta>) {
    let meta: ServiceMeta;
    if (this.registry) {
      meta = await this.registry.service(serviceId);
      meta = { ...meta, ...metaOverride };
    } else if (
      metaOverride?.providerAddr &&
      metaOverride?.pricePerUnit6 &&
      metaOverride?.unit
    ) {
      // fallback if no registry: user passes minimal meta
      meta = {
        providerAddr: metaOverride.providerAddr,
        serviceId,
        title: metaOverride.title ?? "service",
        description: metaOverride.description ?? "",
        unit: metaOverride.unit,
        pricePerUnit6: metaOverride.pricePerUnit6,
        requestSchema: metaOverride.requestSchema,
      } as ServiceMeta;
    } else {
      throw new Error("No registry configured and no meta override provided");
    }

    // discover provider's WS URI from registry (or from override)
    const wsUri = this.registry
      ? await this.registry.providerWs(meta.providerAddr)
      : (metaOverride as any)?.wsUri;

    if (!wsUri) throw new Error("No provider WS URI found");

    const easPointers = await getEasPointers();
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const settlement = new ethers.Contract(
      easPointers.settlement,
      SETTLEMENT_ABI,
      provider
    );

    const self = this;
    return {
      meta,
      async price(input: any): Promise<bigint> {
        return quotePrice6(meta, input);
      },
      async request(args: {
        request: any;
        deadlineSec?: number;
      }): Promise<any> {
        if (!self.signer) throw new Error("signer required for client");
        const payer = (await self.signer.getAddress()) as Hex;
        const providerAddr = meta.providerAddr as Hex;
        const amount = quotePrice6(meta, args.request);
        const token = easPointers.usdc as Hex;
        const nonceRaw = await settlement.nextNonce(payer, providerAddr);
        const epochRaw = await settlement.epoch(payer);

        const debit: Debit = {
          payer,
          provider: providerAddr,
          serviceId: meta.serviceId,
          amount,
          token,
          nonce: BigInt(nonceRaw),
          epoch: BigInt(epochRaw),
          deadline: BigInt(
            Math.floor(Date.now() / 1000) + (args.deadlineSec ?? 30 * 60)
          ),
        };

        const signature = await signDebit(self.signer, easPointers.settlement, debit);

        if (self.useRelayer) {
          // call your relayer HTTP (optional mode)
          const r = await fetch(
            `${self.relayerBaseUrl}/call/${meta.serviceId}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ input: args.request, debit, signature }),
            }
          );
          const jr = await r.json();
          if (!jr.ok) throw new Error(jr.error || "relayer error");
          return jr.result;
        } else {
          // direct WS message to provider
          const payload: ClientRequest = {
            request: args.request,
            price: amount,
            signature,
            debit,
          };
          const res = await wsRpc(wsUri, "mcp.call", payload);
          if (!res?.ok) throw new Error(res?.error || "provider error");
          return res.result;
        }
      },
    };
  }
}

// ultra-minimal WS RPC
async function wsRpc(wsUri: string, method: string, params: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const ws = new WebSocket(wsUri);
    ws.on("open", () => {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    });
    ws.on("message", (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        if (msg.id === id) {
          resolve(msg.result ?? msg.error);
          ws.close();
        }
      } catch (e) {
        reject(e);
        ws.close();
      }
    });
    ws.on("error", reject);
    setTimeout(() => {
      reject(new Error("ws timeout"));
      ws.close();
    }, 10000);
  });
}
