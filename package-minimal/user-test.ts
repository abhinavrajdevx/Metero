import { MCP } from "mcp-sdk";
import { ethers } from "ethers";

async function main() {
  const RPC_URL = "http://127.0.0.1:8545";
  const payerPk =
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"; // hardhat local 3rd account
  const signer = new ethers.Wallet(
    payerPk,
    new ethers.JsonRpcProvider(RPC_URL)
  );

  const mcp = new MCP({
    evmAddress: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
    signer,
    useRelayer: false, // DIRECT mode!
    // registryAddress: "0xRegistry...", // optional (if you deploy one)
  });

  const service = await mcp.getService(
    "0x04785b390a3f0f742cd4cdad4a10155b7ce8082e9670fc50b11c6e83753c14bf" as any,
    {
      providerAddr: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as any,
      unit: "call",
      pricePerUnit6: 100_000n, // $0.10
      wsUri: "ws://localhost:9090",
    } as any
  );

  // Make a request
  const result = await service.request({ request: { text: "hello MCP" } });
  console.log("result:", result);
}

main();
