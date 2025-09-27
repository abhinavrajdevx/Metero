export type Service = {
  serviceId: string;          // 0x keccak(providerAddr:slug)
  providerAddr: string;
  slug: string;
  title: string;
  description?: string;
  unit: "call" | "chars" | "pages";
  pricePerUnit6: bigint;      // USDC 6dp
  token: string;              // USDC addr
};

export type Provider = {
  providerAddr: string;
  name: string;
  apiKey: string;             // plain for MVP (hash in prod)
};

export type Debit = {
  payer: string;
  provider: string;
  serviceId: string;          // bytes32 (0x…)
  amount: bigint;             // 6dp
  token: string;
  nonce: bigint;
  epoch: bigint;
  deadline: bigint;
};

export type IOU = {
  id: string;
  debit: Debit;
  signature: string;
  status: "pending" | "settled" | "expired" | "rejected";
  createdAt: number;
};
