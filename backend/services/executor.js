import { ethers } from "ethers";
import { getProviderForChain, getWalletForChain } from "./multiProvider.js";
import { CHAIN_TOKENS } from "./chainConfig.js";
import { submitViaFlashbots } from "./flashbots.js";
import { getService } from "./registry.js";

// GreywolfFlashLoan ABI (minimal)
const FLASH_LOAN_ABI = [
  "function requestFlashLoan(address asset, uint256 amount, bytes calldata params) external",
];

const DEFAULT_CONTRACT = () => process.env.CONTRACT_ADDRESS;

/**
 * Look up decimals for a token address on a given chain.
 * Falls back to 18 if not found.
 */
function getDecimals(chainId, assetAddress) {
  const tokens = CHAIN_TOKENS[chainId] || CHAIN_TOKENS[1];
  const token = tokens.find(
    (t) => t.address.toLowerCase() === assetAddress.toLowerCase()
  );
  return token ? token.decimals : 18;
}

/**
 * Execute a DEX arbitrage via flash loan
 */
export async function executeDexArb({
  contractAddress,
  asset,
  amount,
  routers,
  swapDatas,
  chainId = 1,
  useFlashbots = true,
}) {
  const addr = contractAddress || DEFAULT_CONTRACT();
  if (!addr) throw new Error("No contract address configured");

  const wallet = getWalletForChain(chainId);
  const contract = new ethers.Contract(addr, FLASH_LOAN_ABI, wallet);

  // Encode params: opType (1 byte) + abi.encode(routers, swapDatas)
  const opType = "0x01";
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "bytes[]"],
    [routers, swapDatas]
  );
  const params = ethers.concat([opType, encodedData]);

  const decimals = getDecimals(chainId, asset);
  const tx = await contract.requestFlashLoan.populateTransaction(
    asset,
    ethers.parseUnits(amount, decimals),
    params
  );

  // Estimate gas
  const provider = getProviderForChain(chainId);
  const gasEstimate = await provider.estimateGas({ ...tx, from: wallet.address });
  const feeData = await provider.getFeeData();

  tx.gasLimit = gasEstimate * 120n / 100n; // 20% buffer
  tx.maxFeePerGas = feeData.maxFeePerGas;
  tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  tx.nonce = await provider.getTransactionCount(wallet.address);
  tx.chainId = BigInt(chainId);
  tx.type = 2;

  const signedTx = await wallet.signTransaction(tx);

  if (useFlashbots) {
    const result = await submitViaFlashbots(signedTx);
    return {
      method: "flashbots",
      ...result,
      gasCost: ethers.formatEther(gasEstimate * (feeData.gasPrice || 0n)),
    };
  }

  // Direct submission fallback
  const receipt = await (await wallet.sendTransaction(tx)).wait();
  return {
    method: "direct",
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    gasCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
  };
}

/**
 * Execute a DEX arbitrage using Paraswap swap calldata.
 * Uses Paraswap's 2-step flow (prices → transactions) to get pre-built
 * tx data, then passes it through the flash loan contract via executeDexArb.
 */
export async function executeDexArbViaParaswap({
  contractAddress,
  asset,
  amount,
  src,
  dst,
  swapAmount,
  srcDecimals = 18,
  dstDecimals = 18,
  slippage = 250, // basis points: 250 = 2.5%
  buyProtocol,
  sellProtocol,
  chainId = 1,
  useFlashbots = true,
}) {
  const addr = contractAddress || DEFAULT_CONTRACT();
  if (!addr) throw new Error("No contract address configured");

  const wallet = getWalletForChain(chainId);
  const paraswapClient = getService("paraswapClient");

  console.log(`[executor] Paraswap arb: ${src} -> ${dst}, amount=${swapAmount}, chain=${chainId}`);

  // Get swap calldata from Paraswap for the buy leg
  const buySwap = await paraswapClient.getSwap({
    src,
    dst,
    amount: swapAmount,
    from: addr,
    slippage,
    protocol: sellProtocol,
    srcDecimals,
    destDecimals: dstDecimals,
  });

  // Sell leg: use slightly less than quoted buy output to account for
  // execution variance — the actual buy output is typically 0.1-0.3% less
  // than the quoted destAmount.  Without this buffer the sell swap tries
  // to pull more intermediate tokens than the contract received, reverting.
  // Any leftover intermediate tokens can be rescued via contract.rescue().
  const SELL_BUFFER_BPS = 10n; // 0.1%
  const rawDest = BigInt(buySwap.priceRoute.destAmount);
  const sellAmount = (rawDest * (10000n - SELL_BUFFER_BPS) / 10000n).toString();

  const sellSwap = await paraswapClient.getSwap({
    src: dst,
    dst: src,
    amount: sellAmount,
    from: addr,
    slippage,
    protocol: buyProtocol,
    srcDecimals: dstDecimals,
    destDecimals: srcDecimals,
  });

  // Pre-flight profitability check: sell output must exceed buy input + flash loan premium (0.05%)
  const sellOutput = BigInt(sellSwap.priceRoute.destAmount);
  const buyInput = BigInt(swapAmount);
  const flashPremium = buyInput * 5n / 10000n; // Aave 0.05% fee
  const minRequired = buyInput + flashPremium;

  const profitRaw = sellOutput - minRequired;
  const profitPct = Number(profitRaw * 10000n / buyInput) / 100;

  console.log(`[executor] Pre-flight: buy=${buyInput}, sellOut=${sellOutput}, premium=${flashPremium}, profit=${profitRaw} (${profitPct}%)`);

  if (sellOutput <= minRequired) {
    throw new Error(
      `Not profitable at execution size: sell output ${sellOutput} < required ${minRequired} (${profitPct.toFixed(2)}% net). Opportunity exists only at small volumes.`
    );
  }

  // Use Augustus router address from API response
  return executeDexArb({
    contractAddress: addr,
    asset,
    amount,
    routers: [buySwap.to, sellSwap.to],
    swapDatas: [buySwap.data, sellSwap.data],
    chainId,
    useFlashbots,
  });
}

/**
 * Execute an NFT liquidation via flash loan
 */
export async function executeNftLiq({
  contractAddress,
  asset,
  amount,
  liqTarget,
  liqCalldata,
  sellTarget,
  sellCalldata,
  chainId = 1,
  useFlashbots = true,
}) {
  const addr = contractAddress || DEFAULT_CONTRACT();
  if (!addr) throw new Error("No contract address configured");

  const wallet = getWalletForChain(chainId);
  const contract = new ethers.Contract(addr, FLASH_LOAN_ABI, wallet);

  // Encode params: opType (1 byte) + abi.encode(liqTarget, liqCalldata, sellTarget, sellCalldata)
  const opType = "0x02";
  const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address", "bytes", "address", "bytes"],
    [liqTarget, liqCalldata, sellTarget, sellCalldata]
  );
  const params = ethers.concat([opType, encodedData]);

  const decimals = getDecimals(chainId, asset);
  const tx = await contract.requestFlashLoan.populateTransaction(
    asset,
    ethers.parseUnits(amount, decimals),
    params
  );

  const provider = getProviderForChain(chainId);
  const gasEstimate = await provider.estimateGas({ ...tx, from: wallet.address });
  const feeData = await provider.getFeeData();

  tx.gasLimit = gasEstimate * 120n / 100n;
  tx.maxFeePerGas = feeData.maxFeePerGas;
  tx.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  tx.nonce = await provider.getTransactionCount(wallet.address);
  tx.chainId = BigInt(chainId);
  tx.type = 2;

  const signedTx = await wallet.signTransaction(tx);

  if (useFlashbots) {
    const result = await submitViaFlashbots(signedTx);
    return {
      method: "flashbots",
      ...result,
      gasCost: ethers.formatEther(gasEstimate * (feeData.gasPrice || 0n)),
    };
  }

  const receipt = await (await wallet.sendTransaction(tx)).wait();
  return {
    method: "direct",
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
    gasCost: ethers.formatEther(receipt.gasUsed * receipt.gasPrice),
  };
}
