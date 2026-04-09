const hre = require("hardhat");

// Aave v3 PoolAddressesProvider on Ethereum mainnet
const AAVE_V3_ADDRESSES_PROVIDER = "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const FlashLoan = await hre.ethers.getContractFactory("GreywolfFlashLoan");
  const flashLoan = await FlashLoan.deploy(AAVE_V3_ADDRESSES_PROVIDER);
  await flashLoan.waitForDeployment();

  const addr = await flashLoan.getAddress();
  console.log("GreywolfFlashLoan deployed to:", addr);

  // Approve known routers
  const UNISWAP_V3_ROUTER = "0xE592427A0AEce92De3Edee1F18E0157C05861564";
  const SUSHISWAP_ROUTER = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
  const AUGUSTUS_V5 = "0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57";
  const AUGUSTUS_V6_2 = "0x6a000f20005980200259b80c5102003040001068";

  await flashLoan.setRouter(UNISWAP_V3_ROUTER, true);
  console.log("Approved Uniswap V3 Router");

  await flashLoan.setRouter(SUSHISWAP_ROUTER, true);
  console.log("Approved Sushiswap Router");

  await flashLoan.setRouter(AUGUSTUS_V5, true);
  console.log("Approved Paraswap Augustus V5");

  await flashLoan.setRouter(AUGUSTUS_V6_2, true);
  console.log("Approved Paraswap Augustus V6.2");

  // Pre-approve TokenTransferProxy for all traded tokens
  const TOKEN_TRANSFER_PROXY = "0x216B4B4Ba9F3e719726886d34a177484278Bfcae";
  const tokens = {
    WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    USDT: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    DAI:  "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    WBTC: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
  };
  for (const [symbol, address] of Object.entries(tokens)) {
    const tx = await flashLoan.approveToken(address, TOKEN_TRANSFER_PROXY, hre.ethers.MaxUint256);
    await tx.wait();
    console.log(`Pre-approved ${symbol} for TokenTransferProxy`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
