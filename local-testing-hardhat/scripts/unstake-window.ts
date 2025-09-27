import hre from "hardhat";
import { ADDRS } from "./addresses";
const { ethers, network } = hre;

async function main() {
  const [deployer, user, provider] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("MockUSDC", ADDRS.USDC);
  const escrow = await ethers.getContractAt("Escrow", ADDRS.ESCROW);
  const settlement = await ethers.getContractAt("Settlement", ADDRS.SETTLE);

  await (await usdc.mint(await user.getAddress(), 300_000000n)).wait();
  await (await usdc.connect(user).approve(ADDRS.ESCROW, 150_000000n)).wait();
  await (await escrow.connect(user).deposit(150_000000n)).wait();

  const chainId = (await ethers.provider.getNetwork()).chainId;
  const domain = { name: "MCPSettlement", version: "1", chainId, verifyingContract: ADDRS.SETTLE };
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
  const epoch = await settlement.epoch(payer);

  // request unstake (starts 7-day timer). we'll just fast-forward time on hardhat.
  await (await escrow.connect(user).requestUnstake(0)).wait();
  const dline = await escrow.unstakeAt(payer);

  // BEFORE deadline: settle works
  {
    const nonce = await settlement.nextNonce(payer, prov);
    const debit = {
      payer, provider: prov, serviceId, amount: 10_000000n, token,
      nonce: BigInt(nonce), epoch: BigInt(epoch),
      deadline: BigInt(Math.floor(Date.now()/1000) + 3600)
    };
    const sig = await user.signTypedData(domain, types, debit);
    await (await settlement.connect(provider).settleBatch([debit], [sig])).wait();
    console.log("settled before deadline");
  }

  // advance chain time to AFTER deadline
  await network.provider.send("evm_setNextBlockTimestamp", [Number(dline) + 1]);
  await network.provider.send("evm_mine");

  // AFTER deadline: settle must revert
  try {
    const nonce2 = await settlement.nextNonce(payer, prov);
    const debit2 = {
      payer, provider: prov, serviceId, amount: 5_000000n, token,
      nonce: BigInt(nonce2), epoch: BigInt(epoch),
      deadline: BigInt(Math.floor(Date.now()/1000) + 3600)
    };
    const sig2 = await user.signTypedData(domain, types, debit2);
    await settlement.connect(provider).settleBatch([debit2], [sig2]);
    console.log("❌ should have reverted");
  } catch {
    console.log("reverted after deadline (expected)");
  }

  // withdraw
  const balBefore = await usdc.balanceOf(payer);
  await (await escrow.connect(user).withdraw(100_000000n)).wait();
  const balAfter = await usdc.balanceOf(payer);
  console.log("withdrawn:", (balAfter - balBefore).toString());
}

main().catch((e)=>{ console.error(e); process.exit(1); });
