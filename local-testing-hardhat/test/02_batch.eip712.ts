import { expect } from "chai";
import hre from "hardhat";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Batch settlement", () => {
  it("settles three IOUs in one tx", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 500_000000n);

    const escrow = (await (await ethers.getContractFactory("Escrow")).deploy(await usdc.getAddress())) as unknown as Escrow;
    await escrow.waitForDeployment();

    const settlement = (await (await ethers.getContractFactory("Settlement")).deploy(await escrow.getAddress())) as unknown as Settlement;
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement.connect(deployer).setTokenAllowed(await usdc.getAddress(), true);

    await usdc.connect(user).approve(await escrow.getAddress(), 100_000000n);
    await escrow.connect(user).deposit(100_000000n);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name: "MCPSettlement", version: "1", chainId, verifyingContract: await settlement.getAddress() };
    const types = { Debit: [
      { name: "payer", type: "address" }, { name: "provider", type: "address" },
      { name: "serviceId", type: "bytes32" }, { name: "amount", type: "uint256" },
      { name: "token", type: "address" }, { name: "nonce", type: "uint256" },
      { name: "epoch", type: "uint64" }, { name: "deadline", type: "uint64" },
    ]};

    const payer = await user.getAddress();
    const prov  = await provider.getAddress();
    const token = await usdc.getAddress();
    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
    const deadline = BigInt(Math.floor(Date.now()/1000) + 30*60);

    const ds = [
      { payer, provider: prov, serviceId, amount: 10_000000n, token, nonce: 0n, epoch: 0n, deadline },
      { payer, provider: prov, serviceId, amount: 7_500000n, token, nonce: 1n, epoch: 0n, deadline },
      { payer, provider: prov, serviceId, amount: 5_250000n, token, nonce: 2n, epoch: 0n, deadline },
    ] as const;

    const sigs = await Promise.all(ds.map(d => user.signTypedData(domain, types, d)));
    const total = ds.reduce((a,d)=>a+d.amount, 0n);

    await settlement.connect(provider).settleBatch(ds as any, sigs);

    expect(await escrow.balance(payer)).to.eq(100_000000n - total);
    expect(await usdc.balanceOf(prov)).to.eq(total);
    expect(await settlement.nextNonce(payer, prov)).to.eq(3n);
  });
});
