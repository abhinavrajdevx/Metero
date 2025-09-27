import { expect } from "chai";
import hre from "hardhat";
import type { MockUSDC, Escrow, Settlement } from "../typechain-types";

const { ethers } = hre;

describe("Single IOU", () => {
  it("settles one EIP-712 debit", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockUSDC");
    const usdc = (await USDC.deploy()) as unknown as MockUSDC;
    await usdc.waitForDeployment();
    await usdc.mint(await user.getAddress(), 200_000000n);

    const Escrow = await ethers.getContractFactory("Escrow");
    const escrow = (await Escrow.deploy(
      await usdc.getAddress()
    )) as unknown as Escrow;
    await escrow.waitForDeployment();

    const Settlement = await ethers.getContractFactory("Settlement");
    const settlement = (await Settlement.deploy(
      await escrow.getAddress()
    )) as unknown as Settlement;
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);
    await settlement.connect(deployer).setPerCallLimit(50_000000);

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

    const debit = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId: ethers.keccak256(ethers.toUtf8Bytes("web.fetch")),
      amount: 20_000000n,
      token: await usdc.getAddress(),
      nonce: 0n,
      epoch: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
    };

    const sig = await user.signTypedData(domain, types, debit);
    const recovered = ethers.verifyTypedData(domain, types as any, debit, sig);
    expect(recovered.toLowerCase()).to.eq(debit.payer.toLowerCase());

    await settlement.connect(provider).settleBatch([debit], [sig]);

    expect(await escrow.balance(debit.payer)).to.eq(80_000000n);
    expect(await usdc.balanceOf(debit.provider)).to.eq(20_000000n);
    expect(await settlement.nextNonce(debit.payer, debit.provider)).to.eq(1n);
  });
});
