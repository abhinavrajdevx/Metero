import hre from "hardhat";
import fs from "node:fs";
import path from "node:path";

// 1st account = deployer
// 2nd account = provider
// 3rd account = user (tester)

const { ethers, network } = hre;

/**
 * ENV (optional):
 *   PER_CALL_LIMIT=50000000             # 50 USDC in 6dp (default)
 *   INIT_MINT_USDC=1000000000           # 1000 USDC (6dp)
 *   INIT_STAKE_USDC=100000000           # 100 USDC (6dp)
 *   INIT_STAKE_USER=0xYourUserAddress   # if omitted, no initial stake/deposit
 *   TOKEN_NAME=Mock USDC
 *   TOKEN_SYMBOL=mUSDC
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  // --------- config from env ----------
  const PER_CALL_LIMIT = BigInt(process.env.PER_CALL_LIMIT ?? "50000000"); // 50 USDC (6dp)
  const INIT_MINT_USDC = BigInt(process.env.INIT_MINT_USDC ?? "0"); // e.g., 1000 USDC = 1000000000
  const INIT_STAKE_USDC = BigInt(process.env.INIT_STAKE_USDC ?? "0"); // e.g., 100 USDC = 100000000
  const INIT_STAKE_USER = process.env.INIT_STAKE_USER?.trim();
  const TOKEN_NAME = process.env.TOKEN_NAME ?? "Mock USDC";
  const TOKEN_SYMBOL = process.env.TOKEN_SYMBOL ?? "mUSDC";

  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network:  ${network.name} (chainId=${chainId})`);

  // --------- deploy MockUSDC ----------
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  // If you want custom name/symbol, swap to an ERC20 preset; MockUSDC is fixed.
  const usdc = await MockUSDC.deploy();
  await usdc.waitForDeployment();
  const usdcAddr = await usdc.getAddress();
  console.log(`MockUSDC deployed: ${usdcAddr}`);

  // Optional initial mint (to deployer and/or INIT_STAKE_USER)
  if (INIT_MINT_USDC > 0n) {
    console.log(
      `Minting ${INIT_MINT_USDC} (6dp) to deployer ${deployer.address}`
    );
    const tx = await usdc.mint(deployer.address, INIT_MINT_USDC);
    await tx.wait();
  }
  if (INIT_STAKE_USER && INIT_STAKE_USDC > 0n && INIT_STAKE_USER !== "") {
    console.log(
      `Minting ${INIT_STAKE_USDC} (6dp) to INIT_STAKE_USER ${INIT_STAKE_USER}`
    );
    const tx2 = await usdc.mint(INIT_STAKE_USER, INIT_STAKE_USDC);
    await tx2.wait();
  }

  // --------- deploy Escrow ----------
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy(usdcAddr);
  await escrow.waitForDeployment();
  const escrowAddr = await escrow.getAddress();
  console.log(`Escrow deployed: ${escrowAddr}`);

  // --------- deploy Settlement ----------
  const Settlement = await ethers.getContractFactory("Settlement");
  const settlement = await Settlement.deploy(escrowAddr);
  await settlement.waitForDeployment();
  const settlementAddr = await settlement.getAddress();
  console.log(`Settlement deployed: ${settlementAddr}`);

  // --------- wire contracts & params ----------
  console.log(`Setting Escrow.setSettlement -> ${settlementAddr}`);
  await (await escrow.setSettlement(settlementAddr)).wait();

  console.log(`Allow-listing USDC in Settlement`);
  await (await settlement.setTokenAllowed(usdcAddr, true)).wait();

  console.log(`Setting per-call limit = ${PER_CALL_LIMIT} (6dp)`);
  await (await settlement.setPerCallLimit(PER_CALL_LIMIT)).wait();

  // --------- optional initial stake for INIT_STAKE_USER ----------
  if (INIT_STAKE_USER && INIT_STAKE_USDC > 0n) {
    const user = await ethers.getSigner(deployer.address); // placeholder
    // If INIT_STAKE_USER is not the deployer, we can’t sign for them here.
    // Provide a helper if INIT_STAKE_USER == deployer.address:
    if (INIT_STAKE_USER.toLowerCase() === deployer.address.toLowerCase()) {
      console.log(
        `Approving and depositing ${INIT_STAKE_USDC} to Escrow from deployer`
      );
      await (await usdc.approve(escrowAddr, INIT_STAKE_USDC)).wait();
      await (await escrow.deposit(INIT_STAKE_USDC)).wait();
      console.log(
        `Escrow balance(deployer) = ${await escrow.balance(deployer.address)}`
      );
    } else {
      console.log(
        `INIT_STAKE_USER is not the deployer. Ask that user to:\n` +
          `  1) approve ${escrowAddr} for ${INIT_STAKE_USDC}\n` +
          `  2) call Escrow.deposit(${INIT_STAKE_USDC})`
      );
    }
  }

  // --------- EIP-712 domain (paste into frontend) ----------
  const domain = {
    name: "MCPSettlement",
    version: "1",
    chainId: Number(chainId),
    verifyingContract: settlementAddr,
  };

  const EAS = await ethers.getContractFactory("EAS");

  // If already deployed, use getContractAt instead:
  // const eas = await ethers.getContractAt("EAS", "<addr>");
  const eas = await EAS.deploy(settlementAddr, escrowAddr, usdcAddr);

  await eas.waitForDeployment();
  const easAddr = await eas.getAddress();
  console.log("EAS deployed:", easAddr);

  const [, provider] = await ethers.getSigners();
  console.log(
    "Registering provider and service on EAS with address:",
    provider.address
  );
  await eas.connect(provider).registerProvider("ws://localhost:9090", "");
  let serviceId = ethers.keccak256(ethers.toUtf8Bytes("summarizer:v1"));
  serviceId =
    "0x04785b390a3f0f742cd4cdad4a10155b7ce8082e9670fc50b11c6e83753c14bf";
  await eas.connect(provider).registerService(
    serviceId,
    "Summarizer",
    "Summarize text",
    0, // Unit.CALL
    100_000, // $0.10 (6dp)
    "ipfs://requestSchemaCid",
    "ipfs://responseSchemaCid",
    true // allowDirect
  );
  console.log("Service registered:", serviceId);

  // --------- write deployments file ----------
  const out = {
    network: network.name,
    chainId: Number(chainId),
    addresses: {
      usdc: usdcAddr,
      escrow: escrowAddr,
      settlement: settlementAddr,
      eas: easAddr,
    },
    eip712Domain: domain,
    settings: {
      perCallLimit: PER_CALL_LIMIT.toString(),
      tokenAllowed: [usdcAddr],
    },
  };

  const dir = path.join(process.cwd(), "deployments");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);
  const file = path.join(dir, `${network.name}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`\nSaved deployment manifest → ${file}\n`);

  console.log("Done ✅");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
