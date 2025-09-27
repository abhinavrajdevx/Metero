import { expect } from "chai";
import hre from "hardhat";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Replay protection & domain binding", () => {
  it("same signature cannot be used twice; and cannot be redeemed on a different verifyingContract", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 300_000000n);

    const escrow = (await (await ethers.getContractFactory("Escrow")).deploy(await usdc.getAddress())) as unknown as Escrow;
    await escrow.waitForDeployment();

    const settlement1 = (await (await ethers.getContractFactory("Settlement")).deploy(await escrow.getAddress())) as unknown as Settlement;
    await settlement1.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement1.getAddress());
    await settlement1.connect(deployer).setTokenAllowed(await usdc.getAddress(), true);

    await usdc.connect(user).approve(await escrow.getAddress(), 100_000000n);
    await escrow.connect(user).deposit(100_000000n);

    const chainId = (await ethers.provider.getNetwork()).chainId;
    const domain1 = { name: "MCPSettlement", version: "1", chainId, verifyingContract: await settlement1.getAddress() };
    const types = { Debit: [
      { name: "payer", type: "address" }, { name: "provider", type: "address" },
      { name: "serviceId", type: "bytes32" }, { name: "amount", type: "uint256" },
      { name: "token", type: "address" }, { name: "nonce", type: "uint256" },
      { name: "epoch", type: "uint64" }, { name: "deadline", type: "uint64" },
    ]};


    const farFuture = BigInt(Math.floor(Date.now()/1000) + 365*24*60*60);

    const debit = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId: ethers.keccak256(ethers.toUtf8Bytes("web.fetch")),
      amount: 10_000000n,
      token: await usdc.getAddress(),
      nonce: 0n,
      epoch: 0n,
      deadline: farFuture
    };

    const sig = await user.signTypedData(domain1, types, debit);

    // First settle succeeds
    await settlement1.connect(provider).settleBatch([debit], [sig]);

    // Replay: same sig again → bad nonce
    await expect(
      settlement1.connect(provider).settleBatch([debit], [sig])
    ).to.be.revertedWith("bad nonce");

    // Deploy a second settlement (different verifyingContract) — domain mismatch
    const settlement2 = (await (await ethers.getContractFactory("Settlement")).deploy(await escrow.getAddress())) as unknown as Settlement;
    await settlement2.waitForDeployment();
    await settlement2.connect(deployer).setTokenAllowed(await usdc.getAddress(), true);

    // Try to redeem the same signature on settlement2 → signature invalid (different domain separator)
    await expect(
      settlement2.connect(provider).settleBatch([debit], [sig])
    ).to.be.revertedWith("bad sig");
  });
});
