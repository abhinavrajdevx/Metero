import { expect } from "chai";
import hre from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Unstake window", () => {
  it("allows settlement before, blocks after, then withdraws", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 300_000000n);

    const escrow = (await (await ethers.getContractFactory("Escrow")).deploy(await usdc.getAddress())) as unknown as Escrow;
    await escrow.waitForDeployment();

    const settlement = (await (await ethers.getContractFactory("Settlement")).deploy(await escrow.getAddress())) as unknown as Settlement;
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement.connect(deployer).setTokenAllowed(await usdc.getAddress(), true);

    await usdc.connect(user).approve(await escrow.getAddress(), 150_000000n);
    await escrow.connect(user).deposit(150_000000n);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = { name: "MCPSettlement", version: "1", chainId, verifyingContract: await settlement.getAddress() };
    const types = { Debit: [
      { name: "payer", type: "address" }, { name: "provider", type: "address" },
      { name: "serviceId", type: "bytes32" }, { name: "amount", type: "uint256" },
      { name: "token", type: "address" }, { name: "nonce", type: "uint256" },
      { name: "epoch", type: "uint64" }, { name: "deadline", type: "uint64" },
    ]};

    // Request unstake (starts 7d timer)
    await escrow.connect(user).requestUnstake(0);

  const farFuture = BigInt(Math.floor(Date.now()/1000) + 365*24*60*60); // ~1 year

    // BEFORE deadline: settlement ok
    const d0 = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId: ethers.keccak256(ethers.toUtf8Bytes("web.fetch")),
      amount: 10_000000n,
      token: await usdc.getAddress(),
      nonce: 0n,
      epoch: 0n,
      deadline: farFuture
    };
    const s0 = await user.signTypedData(domain, types, d0);
    await settlement.connect(provider).settleBatch([d0], [s0]);

    // AFTER deadline: settlement must revert
    const deadline = await escrow.unstakeAt(await user.getAddress());
    await time.increaseTo(deadline + 1n);

    const d1 = { ...d0, amount: 5_000000n, nonce: 1n };
    const s1 = await user.signTypedData(domain, types, d1);
    await expect(
      settlement.connect(provider).settleBatch([d1], [s1])
    ).to.be.revertedWith("past-unstake-deadline");

    // User can withdraw
    const balBefore = await usdc.balanceOf(await user.getAddress());
    await escrow.connect(user).withdraw(100_000000n);
    const balAfter = await usdc.balanceOf(await user.getAddress());
    expect(balAfter - balBefore).to.eq(100_000000n);
  });
});
