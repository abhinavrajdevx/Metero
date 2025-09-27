import hre from "hardhat";
import { ADDRS } from "./addresses";
const { ethers } = hre;

async function main() {
  const [deployer, user, provider] = await ethers.getSigners();

  const usdc = await ethers.getContractAt("MockUSDC", ADDRS.USDC);
  const escrow = await ethers.getContractAt("Escrow", ADDRS.ESCROW);
  const settlement = await ethers.getContractAt("Settlement", ADDRS.SETTLE);

  // 0) seed user + stake 100 USDC
  await (await usdc.mint(await user.getAddress(), 200_000000n)).wait();
  await (await usdc.connect(user).approve(ADDRS.ESCROW, 100_000000n)).wait();
  await (await escrow.connect(user).deposit(100_000000n)).wait();

  // 1) build Debit (amount in 6dp)
  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = {
    name: "MCPSettlement",
    version: "1",
    chainId,
    verifyingContract: ADDRS.SETTLE,
  };
  const types = {
    Debit: [
      { name: "payer", type: "address" },
      { name: "provider", type: "address" },
      { name: "serviceId", type: "bytes32" },
      { name: "amount", type: "uint256" },
      { name: "token", type: "address" },
      { name: "nonce", type: "uint256" },
      { name: "epoch", type: "uint64" },
      { name: "deadline", type: "uint64" },
    ],
  };

  const payer = await user.getAddress();
  const prov  = await provider.getAddress();
  const token = ADDRS.USDC;
  const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
  const nonce = await settlement.nextNonce(payer, prov);      // per (payer,provider)
  const epoch = await settlement.epoch(payer);                // session id (likely 0 on fresh chain)
  const deadline = BigInt(Math.floor(Date.now()/1000) + 30*60);

  const debit = {
    payer,
    provider: prov,
    serviceId,
    amount: 20_000000n,   // 20 USDC in 6dp
    token,
    nonce: BigInt(nonce),
    epoch: BigInt(epoch),
    deadline,
  };

  // 2) user signs typed data
  const signature = await user.signTypedData(domain, types, debit);

  // 3) verify locally (like your server middleware would)
  const recovered = ethers.verifyTypedData(domain, types as any, debit, signature);
  if (recovered.toLowerCase() !== payer.toLowerCase()) throw new Error("bad signature");

  // 4) settle on-chain (anyone can relay; provider pays gas here)
  const tx = await settlement.connect(provider).settleBatch([debit], [signature]);
  const rc = await tx.wait();

  console.log("settled tx:", rc?.hash);
  console.log("user escrow:", (await escrow.balance(payer)).toString());
  console.log("provider usdc:", (await usdc.balanceOf(prov)).toString());
  console.log("nextNonce:", (await settlement.nextNonce(payer, prov)).toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
