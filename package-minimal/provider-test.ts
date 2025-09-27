import { McpServer } from "mcp-sdk";

const provider = new McpServer({
  allowDirectConnection: true,
  saveIOU: async ({ debit, signature }) => {
    console.log("IOU saved:", debit.nonce.toString(), debit.amount.toString(), signature.slice(0,10));
  }
});

// define your service
const serviceId = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcd" as any;
provider.bindService({
  serviceId,
  unit: "call",
  pricePerUnit6: 100_000n,
  handler: async (input) => {
    const text = String(input?.text ?? "");
    const result = { summary: text.slice(0, 40) };
    return { result, usageUnits: 1n };
  }
});

// start
provider.start(9090);
