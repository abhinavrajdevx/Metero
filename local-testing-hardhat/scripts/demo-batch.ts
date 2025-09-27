import hre from "hardhat";
import { ADDRS } from "./addresses";
const { ethers } = hre;

async function main() {
  const [deployer, user, provider] = await ethers.getSigners();
  const usdc = await ethers.getContractAt("MockUSDC", ADDRS.USDC);
  const escrow = await ethers.getContractAt("Escrow", ADDRS.ESCROW);
  const settlement = await ethers.getContractAt("Settlement", ADDRS.SETTLE);

  await (await usdc.mint(await user.getAddress(), 500_000000n)).wait();
  await (await usdc.connect(user).approve(ADDRS.ESCROW, 100_000000n)).wait();
  await (await escrow.connect(user).deposit(100_000000n)).wait();

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
  const startNonce = await settlement.nextNonce(payer, prov);
  const epoch = await settlement.epoch(payer);
  const deadline = BigInt(Math.floor(Date.now()/1000) + 30*60);

  const debits = [
    { payer, provider: prov, serviceId, amount: 10_000000n, token, nonce: BigInt(startNonce) + 0n, epoch: BigInt(epoch), deadline },
    { payer, provider: prov, serviceId, amount: 7_500000n,  token, nonce: BigInt(startNonce) + 1n, epoch: BigInt(epoch), deadline },
    { payer, provider: prov, serviceId, amount: 5_250000n,  token, nonce: BigInt(startNonce) + 2n, epoch: BigInt(epoch), deadline },
  ] as const;

  const sigs = await Promise.all(debits.map(d => user.signTypedData(domain, types, d)));
  const total = debits.reduce((acc, d) => acc + d.amount, 0n);

  const tx = await settlement.connect(provider).settleBatch(debits as any, sigs);
  await tx.wait();

  console.log("batch settled total:", total.toString());
  console.log("escrow:", (await escrow.balance(payer)).toString());
  console.log("provider usdc:", (await usdc.balanceOf(prov)).toString());
  console.log("nextNonce:", (await settlement.nextNonce(payer, prov)).toString());
}

main().catch((e) => { console.error(e); process.exit(1); });
