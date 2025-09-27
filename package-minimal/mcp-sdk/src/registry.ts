import { ethers } from "ethers";
import type { ChainConfig, Hex, ServiceMeta } from "./types.js";
import { RPC_URL } from "./constants.js";

const REG_ABI = [
  // Example interface — adapt to your real Registry contract
  "function providerWs(address) view returns (string)",
  "function getService(bytes32) view returns (tuple(address provider,string title,string description,uint8 unit,uint256 pricePerUnit6))",
  "function tokenAllowed(address) view returns (bool)"
];

export class Registry {
  private contract: ethers.Contract;
  constructor(registryAddr: Hex) {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    this.contract = new ethers.Contract(registryAddr, REG_ABI, provider);
  }

  async providerWs(providerAddr: Hex): Promise<string> {
    return this.contract.providerWs(providerAddr);
  }

  async service(serviceId: Hex): Promise<ServiceMeta> {
    const [provider, title, description, unitNum, pricePerUnit6] = await this.contract.getService(serviceId);
    const unit = (["call","chars","pages"] as const)[Number(unitNum) ?? 0];
    return {
      providerAddr: provider,
      serviceId,
      title,
      description,
      unit,
      pricePerUnit6: BigInt(pricePerUnit6)
    };
  }

  // optional: check token allow-list
  async tokenAllowed(token: Hex): Promise<boolean> {
    return this.contract.tokenAllowed(token);
  }
}
