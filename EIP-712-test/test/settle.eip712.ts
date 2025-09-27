import { expect } from "chai";
import hre from "hardhat";
import {
  Escrow__factory,
  MockUSDC__factory,
  Settlement__factory,
} from "../typechain-types";

const { ethers } = hre;

function priceFor(
  serviceId: string,
  input: { calls: number; size: number }
): bigint {
  const base = 10_000000n; // 10 USDC in 6dp
  return BigInt(input.calls) * (base + BigInt(input.size) * 1_000000n);
}

describe("EIP-712 Debit → Settlement → Escrow", () => {
  it("debts escrow using a user-signed EIP-712 IOU", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    // 1) Deploy token
    const usdcFactory = new MockUSDC__factory(deployer);
    const usdc = await usdcFactory.deploy();
    await usdc.waitForDeployment();

    // Mint to user
    const mintAmt = 200_000000n; // 200 USDC (6dp)
    await usdc.mint(await user.getAddress(), mintAmt);

    // 2) Deploy Escrow
    const escrowFactory = new Escrow__factory(deployer);
    const escrow = await escrowFactory.deploy(await usdc.getAddress());
    await escrow.waitForDeployment();

    // 3) Deploy Settlement
    const settlementFactory = new Settlement__factory(deployer);
    const settlement = await settlementFactory.deploy(
      await escrow.getAddress()
    );
    await settlement.waitForDeployment();

    // Wire escrow -> settlement
    await escrow.connect(deployer).setSettlement(await settlement.getAddress());

    // Allow token & set per-call limit
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);
    await settlement.connect(deployer).setPerCallLimit(50_000000); // 50 USDC

    // 4) User approves + deposits 100 USDC into Escrow
    const depositAmt = 100_000000n;
    await usdc.connect(user).approve(await escrow.getAddress(), depositAmt);
    await escrow.connect(user).deposit(depositAmt);

    expect(await escrow.balance(await user.getAddress())).to.eq(depositAmt);

    // 5) Prepare a Debit (20 USDC) & sign EIP-712 off-chain
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
        { name: "deadline", type: "uint64" },
      ],
    };

    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
    const amount = 20_000000n; // 20 USDC
    const nonce = 0n;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 30); // 30 min

    const debit = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId,
      amount,
      token: await usdc.getAddress(),
      nonce,
      deadline,
    };

    const signature = await user.signTypedData(domain, types, debit);

    // 6) Provider (or anyone) calls settleBatch with the signed IOU
    await settlement.connect(provider).settleBatch([debit], [signature]);

    // 7) Assert: escrow down by 20, provider received 20
    const userEscrow = await escrow.balance(await user.getAddress());
    expect(userEscrow).to.eq(depositAmt - amount);

    const providerBal = await usdc.balanceOf(await provider.getAddress());
    expect(providerBal).to.eq(amount);
  });
});

describe("Batch settlement with multiple EIP-712 IOUs", () => {
  it("settles a group of signatures for the same payer/provider in one tx", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    // 1) Deploy token
    const usdc = await new MockUSDC__factory(deployer).deploy();
    await usdc.waitForDeployment();

    // Mint to user
    const mintAmt = 500_000000n; // 500 USDC (6dp)
    await usdc.mint(await user.getAddress(), mintAmt);

    // 2) Deploy Escrow
    const escrow = await new Escrow__factory(deployer).deploy(
      await usdc.getAddress()
    );
    await escrow.waitForDeployment();

    // 3) Deploy Settlement
    const settlement = await new Settlement__factory(deployer).deploy(
      await escrow.getAddress()
    );
    await settlement.waitForDeployment();

    // Wire escrow -> settlement
    await escrow.connect(deployer).setSettlement(await settlement.getAddress());

    // Allow token & set per-call limit
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);
    await settlement.connect(deployer).setPerCallLimit(50_000000); // 50 USDC

    // 4) User approves + deposits 100 USDC into Escrow
    const depositAmt = 100_000000n;
    await usdc.connect(user).approve(await escrow.getAddress(), depositAmt);
    await escrow.connect(user).deposit(depositAmt);
    expect(await escrow.balance(await user.getAddress())).to.eq(depositAmt);

    // 5) Prepare 3 Debits & sign off-chain (nonces 0,1,2)
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
        { name: "deadline", type: "uint64" },
      ],
    };

    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
    const token = await usdc.getAddress();
    const now = Math.floor(Date.now() / 1000);
    const deadline = BigInt(now + 60 * 30); // 30 minutes

    const debits = [
      {
        payer: await user.getAddress(),
        provider: await provider.getAddress(),
        serviceId,
        amount: 10_000000n, // 10 USDC
        token,
        nonce: 0n,
        deadline,
      },
      {
        payer: await user.getAddress(),
        provider: await provider.getAddress(),
        serviceId,
        amount: 7_500000n, // 7.5 USDC
        token,
        nonce: 1n,
        deadline,
      },
      {
        payer: await user.getAddress(),
        provider: await provider.getAddress(),
        serviceId,
        amount: 5_250000n, // 5.25 USDC
        token,
        nonce: 2n,
        deadline,
      },
    ] as const;

    const sigs: string[] = [];
    for (const d of debits) {
      const sig = await user.signTypedData(domain, types, d);
      sigs.push(sig);
    }

    const total = debits[0].amount + debits[1].amount + debits[2].amount;

    // 6) Batch settle all three IOUs
    await settlement.connect(provider).settleBatch(debits as any, sigs);

    // 7) Assertions
    const userEscrowAfter = await escrow.balance(await user.getAddress());
    expect(userEscrowAfter).to.eq(depositAmt - total);

    const providerBal = await usdc.balanceOf(await provider.getAddress());
    expect(providerBal).to.eq(total);

    // Nonce advanced to 3 for this payer
    const nextNonce = await settlement.nextNonce(await user.getAddress());
    expect(nextNonce).to.eq(3n);
  });
});

describe("Amount + signature verification before calling settleBatch", () => {
  it("matches computed price with signed amount, verifies signature, then settles successfully", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    // 1) Deploy token
    const usdc = await new MockUSDC__factory(deployer).deploy();
    await usdc.waitForDeployment();

    // Mint to user
    await usdc.mint(await user.getAddress(), 500_000000n);

    // 2) Deploy Escrow and Settlement
    const escrow = await new Escrow__factory(deployer).deploy(
      await usdc.getAddress()
    );
    await escrow.waitForDeployment();

    const settlement = await new Settlement__factory(deployer).deploy(
      await escrow.getAddress()
    );
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);
    await settlement.connect(deployer).setPerCallLimit(50_000000); // 50 USDC

    // 3) User deposits 100 USDC into Escrow
    const depositAmt = 100_000000n;
    await usdc.connect(user).approve(await escrow.getAddress(), depositAmt);
    await escrow.connect(user).deposit(depositAmt);
    expect(await escrow.balance(await user.getAddress())).to.eq(depositAmt);

    // 4) "Server" computes price for this request
    const serviceId = ethers.keccak256(ethers.toUtf8Bytes("web.fetch"));
    const computed = priceFor(serviceId, { calls: 1, size: 2 }); // = 10 + 2*1 = 12 USDC
    // => 12_000000n

    // 5) Build EIP-712 typed data
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
        { name: "deadline", type: "uint64" },
      ],
    };

    const debit = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId,
      amount: computed, // must match server-computed price
      token: await usdc.getAddress(),
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 60), // 30 min
    };

    // 6) Server-side preflight: ensure payload amount == computed price
    expect(debit.amount).to.eq(
      computed,
      "signed amount must equal computed price"
    );

    // 7) User signs typed data (off-chain)
    const signature = await user.signTypedData(domain, types, debit);

    // 8) Server VERIFY step (simulating middleware): recover signer must equal payer
    const recovered = ethers.verifyTypedData(
      domain,
      types as any,
      debit,
      signature
    );
    expect(recovered.toLowerCase()).to.eq(
      debit.payer.toLowerCase(),
      "bad EIP-712 signature"
    );

    // 9) Call real contract: should succeed and transfer exactly 12 USDC to provider
    await settlement.connect(provider).settleBatch([debit], [signature]);

    expect(await escrow.balance(await user.getAddress())).to.eq(
      depositAmt - computed
    );
    expect(await usdc.balanceOf(await provider.getAddress())).to.eq(computed);
  });

  it("reverts if the amount is tampered after signing (signature no longer matches payload)", async () => {
    const [deployer, user, provider] = await ethers.getSigners();

    const usdc = await new MockUSDC__factory(deployer).deploy();
    await usdc.waitForDeployment();

    await usdc.mint(await user.getAddress(), 200_000000n);

    const escrow = await new Escrow__factory(deployer).deploy(
      await usdc.getAddress()
    );
    await escrow.waitForDeployment();

    const settlement = await new Settlement__factory(deployer).deploy(
      await escrow.getAddress()
    );
    await settlement.waitForDeployment();

    await escrow.connect(deployer).setSettlement(await settlement.getAddress());
    await settlement
      .connect(deployer)
      .setTokenAllowed(await usdc.getAddress(), true);
    await settlement.connect(deployer).setPerCallLimit(50_000000);

    // Deposit
    await usdc.connect(user).approve(await escrow.getAddress(), 100_000000n);
    await escrow.connect(user).deposit(100_000000n);

    // Typed data
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
        { name: "deadline", type: "uint64" },
      ],
    };

    const baseDebit = {
      payer: await user.getAddress(),
      provider: await provider.getAddress(),
      serviceId: ethers.keccak256(ethers.toUtf8Bytes("web.fetch")),
      amount: 20_000000n, // 20 USDC
      token: await usdc.getAddress(),
      nonce: 0n,
      deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 60),
    };

    const sig = await user.signTypedData(domain, types, baseDebit);

    // Tamper with amount → 21 USDC (signature should no longer be valid)
    const tampered = { ...baseDebit, amount: 21_000000n };

    await expect(settlement.connect(provider).settleBatch([tampered], [sig])).to
      .be.reverted; // signature recovery won't match payer
  });
});
