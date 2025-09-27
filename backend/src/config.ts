import "dotenv/config";

export const CFG = {
  rpcUrl: process.env.RPC_URL!,
  usdc: process.env.USDC_ADDR!,
  escrow: process.env.ESCROW_ADDR!,
  settlement: process.env.SETTLEMENT_ADDR!,
  relayerPk: process.env.RELAYER_PK!,
  platformProvider: process.env.PLATFORM_PROVIDER_ADDR!,
  port: Number(process.env.PORT || 8080),
};
