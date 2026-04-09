/**
 * Diagnose "Swap failed" by forking mainnet and tracing the Augustus call.
 * Run: npx hardhat run scripts/diagnose-swap.js
 * (uses hardhat network with mainnet fork — zero gas cost)
 */
const hre = require("hardhat");

const CONTRACT = "0xD6e521AcbB2A46a96A9B5cF68DBB8F5fb0272A55";
const OWNER = "0x0b90bc71720b33FC2cBe57788988bF192EAc47E6";

// Aave V3 Pool on Ethereum mainnet
const AAVE_POOL = "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2";

// Tokens
const WBTC = "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const TOKEN_TRANSFER_PROXY = "0x216B4B4Ba9F3e719726886d34a177484278Bfcae";
const AUGUSTUS = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";

async function main() {
  const provider = hre.ethers.provider;

  // 1. Check contract state on fork
  console.log("=== Contract State ===");
  const flashLoan = await hre.ethers.getContractAt("GreywolfFlashLoan", CONTRACT);

  console.log("Owner:", await flashLoan.owner());
  console.log("Augustus V5 approved:", await flashLoan.approvedRouters(AUGUSTUS));

  const erc20Abi = ["function allowance(address,address) view returns (uint256)", "function balanceOf(address) view returns (uint256)"];
  const wbtc = new hre.ethers.Contract(WBTC, erc20Abi, provider);
  const usdc = new hre.ethers.Contract(USDC, erc20Abi, provider);

  const wbtcAllowance = await wbtc.allowance(CONTRACT, TOKEN_TRANSFER_PROXY);
  const usdcAllowance = await usdc.allowance(CONTRACT, TOKEN_TRANSFER_PROXY);
  console.log("WBTC allowance to TokenTransferProxy:", wbtcAllowance.toString());
  console.log("USDC allowance to TokenTransferProxy:", usdcAllowance.toString());

  // 2. Get fresh Paraswap quote
  console.log("\n=== Fetching Fresh Paraswap Quote ===");
  const amount = "40000000"; // 0.4 WBTC

  // Step 1: price route
  const priceUrl = `https://api.paraswap.io/prices?srcToken=${WBTC}&destToken=${USDC}&amount=${amount}&srcDecimals=8&destDecimals=6&side=SELL&network=1`;
  const priceRes = await fetch(priceUrl);
  if (!priceRes.ok) {
    console.error("Price API error:", await priceRes.text());
    return;
  }
  const priceData = await priceRes.json();
  const destAmount = priceData.priceRoute.destAmount;
  console.log("Buy quote: 0.4 WBTC ->", (Number(destAmount) / 1e6).toFixed(2), "USDC");

  // Step 2: build buy tx
  const buyTxRes = await fetch(`https://api.paraswap.io/transactions/1?ignoreChecks=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      priceRoute: priceData.priceRoute,
      srcToken: WBTC,
      destToken: USDC,
      srcAmount: amount,
      userAddress: CONTRACT,
      slippage: 250,
    }),
  });
  if (!buyTxRes.ok) {
    console.error("Buy tx API error:", await buyTxRes.text());
    return;
  }
  const buyTx = await buyTxRes.json();
  console.log("Buy tx target:", buyTx.to);

  // 3. Simulate the Augustus call directly on fork
  console.log("\n=== Simulating Augustus Call on Fork ===");

  // Impersonate the contract and give it WBTC via Aave flash loan simulation
  // Instead, let's directly impersonate and fund the contract with WBTC
  // by impersonating a whale
  const wbtcWhale = "0x9ff58f4fFB29fA2266Ab25e75e2A8b3503311656"; // Aave aWBTC
  await provider.send("hardhat_impersonateAccount", [wbtcWhale]);
  const whaleSigner = await hre.ethers.getSigner(wbtcWhale);

  // Fund whale with ETH for gas
  await provider.send("hardhat_setBalance", [wbtcWhale, "0x56BC75E2D63100000"]);

  // Transfer WBTC to contract
  const wbtcContract = new hre.ethers.Contract(WBTC, [
    "function transfer(address,uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
  ], whaleSigner);

  const whaleBalance = await wbtcContract.balanceOf(wbtcWhale);
  console.log("Whale WBTC balance:", whaleBalance.toString());

  if (whaleBalance < BigInt(amount)) {
    console.log("Whale doesn't have enough WBTC, trying direct balance set");
    // Set balance directly via storage manipulation
    // WBTC balanceOf slot: mapping(address => uint256) at slot 0
    const slot = hre.ethers.solidityPackedKeccak256(
      ["address", "uint256"],
      [CONTRACT, 0]
    );
    await provider.send("hardhat_setStorageAt", [
      WBTC,
      slot,
      hre.ethers.zeroPadValue(hre.ethers.toBeHex(BigInt(amount)), 32),
    ]);
  } else {
    await wbtcContract.transfer(CONTRACT, BigInt(amount));
  }

  const contractWbtcBal = await wbtc.balanceOf(CONTRACT);
  console.log("Contract WBTC balance after funding:", contractWbtcBal.toString());

  // Now simulate the Augustus call FROM the contract address
  await provider.send("hardhat_impersonateAccount", [CONTRACT]);
  await provider.send("hardhat_setBalance", [CONTRACT, "0x56BC75E2D63100000"]);

  console.log("\nCalling Augustus megaSwap...");
  try {
    const result = await provider.call({
      from: CONTRACT,
      to: buyTx.to,
      data: buyTx.data,
      value: buyTx.value || "0x0",
    });
    console.log("SUCCESS! Return data:", result.slice(0, 66), "...");
  } catch (err) {
    console.error("Augustus REVERTED:");
    console.error("  Reason:", err.reason || "unknown");
    console.error("  Data:", err.data || "none");
    console.error("  Message:", err.message?.slice(0, 500));
  }

  // Also try the full flash loan flow
  console.log("\n=== Simulating Full Flash Loan ===");

  // Reset contract WBTC balance (flash loan will provide it)
  const slotReset = hre.ethers.solidityPackedKeccak256(
    ["address", "uint256"],
    [CONTRACT, 0]
  );
  await provider.send("hardhat_setStorageAt", [
    WBTC,
    slotReset,
    hre.ethers.zeroPadValue("0x0", 32),
  ]);

  // Impersonate owner
  await provider.send("hardhat_impersonateAccount", [OWNER]);
  await provider.send("hardhat_setBalance", [OWNER, "0x56BC75E2D63100000"]);
  const ownerSigner = await hre.ethers.getSigner(OWNER);

  const flashLoanAsOwner = flashLoan.connect(ownerSigner);

  // Build the same params the executor builds
  const opType = "0x01";
  const encodedData = hre.ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]"],
    [[buyTx.to], [buyTx.data]]  // Just the buy leg for now
  );
  const params = hre.ethers.concat([opType, encodedData]);

  try {
    const result = await flashLoanAsOwner.requestFlashLoan.staticCall(
      WBTC,
      BigInt(amount),
      params
    );
    console.log("Flash loan simulation SUCCESS");
  } catch (err) {
    console.error("Flash loan REVERTED:");
    console.error("  Reason:", err.reason || "unknown");
    console.error("  Data:", err.data?.slice(0, 130) || "none");
    console.error("  Message:", err.message?.slice(0, 500));
  }
}

main().catch(console.error);
