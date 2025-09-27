export type Hex = `0x${string}`;

export type ChainConfig = {
  rpcUrl: string;
  settlement: Hex; // Settlement contract address
  escrow: Hex; // Escrow contract address
  usdc: Hex; // Token allow-list (USDC)
};

export type MCPInit = {
  evmAddress: Hex; // payer (client) or provider address
  signer?: import("ethers").Signer; // client only (to sign EIP-712)
  useRelayer?: boolean; // optional: if true, call your REST relayer
  relayerBaseUrl?: string; // required when useRelayer=true
};

export type ServiceMeta = {
  providerAddr: Hex;
  serviceId: Hex; // bytes32
  title: string;
  description?: string;
  unit: "call" | "chars" | "pages";
  pricePerUnit6: bigint; // in 6dp
  requestSchema?: any; // JSON schema (optional)
};

export type Debit = {
  payer: Hex;
  provider: Hex;
  serviceId: Hex;
  amount: bigint; // 6dp
  token: Hex;
  nonce: bigint;
  epoch: bigint;
  deadline: bigint;
};

export type ClientRequest = {
  request: any; // user payload (validated by provider)
  price: bigint; // in 6dp
  signature: Hex; // EIP-712 signature by payer
  debit: Debit; // echo of signed debit
};

export type ProviderHandler = (
  input: any
) => Promise<{ result: any; usageUnits: bigint }>;

export type ProviderServiceDef = {
  serviceId: Hex;
  unit: "call" | "chars" | "pages";
  pricePerUnit6: bigint; // 6dp
  handler: ProviderHandler;
  requestSchema?: any;
  responseSchema?: any;
};

export type SaveIOUFn = (iou: {
  debit: Debit;
  signature: Hex;
}) => Promise<void>;

export type EasParams = {
  rpcUrl: string;
  easAddress: `0x${string}`;
};

export type Easpointer = {
  settlement: Hex;
  escrow: Hex;
  usdc: Hex;
};
