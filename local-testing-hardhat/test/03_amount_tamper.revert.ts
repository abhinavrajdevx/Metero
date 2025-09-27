import { expect } from "chai";
import hre from "hardhat";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Tamper amount → revert", () => {
  it("reverts if amount changed after signing", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = (await (await ethers.getContractFactory("MockUSDC")).deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 200_000000n);

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

    const base = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId: ethers.keccak256(ethers.toUtf8Bytes("web.fetch")),
      amount: 20_000000n,
      token: await usdc.getAddress(),
      nonce: 0n,
      epoch: 0n,
      deadline: BigInt(Math.floor(Date.now()/1000) + 30*60),
    };

    const sig = await user.signTypedData(domain, types, base);
    const tampered = { ...base, amount: 21_000000n };

    await expect(
      settlement.connect(provider).settleBatch([tampered], [sig])
    ).to.be.revertedWith("bad sig");
  });
});
