import { expect } from "chai";
import hre from "hardhat";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Epoch bumps invalidate old signatures", () => {
  it("old epoch sig fails after bump; new epoch succeeds", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = (await (
      await ethers.getContractFactory("MockUSDC")
    ).deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 300_000000n);

    const escrow = (await (
      await ethers.getContractFactory("Escrow")
    ).deploy(await usdc.getAddress())) as unknown as Escrow;
    await escrow.waitForDeployment();

    const settlement = (await (
      await ethers.getContractFactory("Settlement")
    ).deploy(await escrow.getAddress())) as unknown as Settlement;
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);

    await usdc.connect(user).approve(await escrow.getAddress(), 100_000000n);
    await escrow.connect(user).deposit(100_000000n);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain = {
      name: "MCPSettlement",
      version: "1",
      chainId,
      verifyingContract: await settlement.getAddress(),
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
    const prov = await provider.getAddress();
    const token = await usdc.getAddress();
    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
    const farFuture = BigInt(
      Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
    );

    // Sign with epoch 0
    const d0 = {
      payer,
      provider: prov,
      serviceId,
      amount: 10_000000n,
      token,
      nonce: 0n,
      epoch: 0n,
      deadline: farFuture,
    };
    const s0 = await user.signTypedData(domain, types, d0);

    // Bump epoch -> old signatures must fail
    await settlement.connect(deployer).bumpEpoch(payer);
    expect(await settlement.epoch(payer)).to.eq(1n);

    await expect(
      settlement.connect(provider).settleBatch([d0], [s0])
    ).to.be.revertedWith("epoch mismatch");

    // Sign with epoch 1, nonce 0
    const d1 = {
      payer,
      provider: prov,
      serviceId,
      amount: 10_000000n,
      token,
      nonce: 0n,
      epoch: 1n,
      deadline: farFuture,
    };
    const s1 = await user.signTypedData(domain, types, d1);

    await settlement.connect(provider).settleBatch([d1], [s1]);

    expect(await settlement.nextNonce(payer, prov)).to.eq(1n);
    expect(await escrow.balance(payer)).to.eq(90_000000n);
    expect(await usdc.balanceOf(prov)).to.eq(10_000000n);
  });
});
