const hre = require("hardhat");

const TX_HASH = "0x5a3d8f82c955563b4acd21854b69ee61c7de87b85e6f300e8f6d87334b3c51fa";

const TOKEN_TRANSFER_PROXY = "0x216B4B4Ba9F3e719726886d34a177484278Bfcae";
const tokens = {
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
};

async function main() {
  const provider = hre.ethers.provider;

  // Check deployment tx receipt
  console.log("Checking deployment tx:", TX_HASH);
  const receipt = await provider.getTransactionReceipt(TX_HASH);

  if (!receipt) {
    console.log("Transaction not yet mined. Check https://etherscan.io/tx/" + TX_HASH);
    return;
  }

  if (receipt.status === 0) {
    console.log("Transaction REVERTED. You need to redeploy.");
    return;
  }

  const contractAddress = receipt.contractAddress;
  console.log("Contract deployed at:", contractAddress);
  console.log("Gas used:", receipt.gasUsed.toString());

  // Attach to deployed contract
  const FlashLoan = await hre.ethers.getContractFactory("GreywolfFlashLoan");
  const flashLoan = FlashLoan.attach(contractAddress);

  // Check if routers were already approved (they weren't — script crashed before that)
  const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const SUSHISWAP_ROUTER = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
  const AUGUSTUS_V5 = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
  const AUGUSTUS_V6_2 = "0x6a000f20005980200259b80c5102003040001068";

  // Approve routers
  let tx;
  tx = await flashLoan.setRouter(UNISWAP_V3_ROUTER, true);
  await tx.wait();
  console.log("Approved Uniswap V3 Router");

  tx = await flashLoan.setRouter(SUSHISWAP_ROUTER, true);
  await tx.wait();
  console.log("Approved Sushiswap Router");

  tx = await flashLoan.setRouter(AUGUSTUS_V5, true);
  await tx.wait();
  console.log("Approved Paraswap Augustus V5");

  tx = await flashLoan.setRouter(AUGUSTUS_V6_2, true);
  await tx.wait();
  console.log("Approved Paraswap Augustus V6.2");

  // Pre-approve TokenTransferProxy for all traded tokens
  for (const [symbol, address] of Object.entries(tokens)) {
    tx = await flashLoan.approveToken(address, TOKEN_TRANSFER_PROXY, hre.ethers.MaxUint256);
    await tx.wait();
    console.log(`Pre-approved ${symbol} for TokenTransferProxy`);
  }

  console.log("\nDone! Update CONTRACT_ADDRESS in .env to:", contractAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
