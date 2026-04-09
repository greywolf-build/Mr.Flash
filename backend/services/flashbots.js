import { ethers } from "ethers";
import { getProviderForChain, getWalletForChain } from "./multiProvider.js";

const FLASHBOTS_RELAY = process.env.FLASHBOTS_RELAY_URL || "https://relay.flashbots.net";

/**
 * Submit a transaction privately via Flashbots to avoid frontrunning.
 * Uses the Flashbots relay directly via JSON-RPC (eth_sendBundle).
 */
export async function submitViaFlashbots(signedTx) {
  const provider = getProviderForChain(1);
  const wallet = getWalletForChain(1);
  const blockNumber = await provider.getBlockNumber();
  const targetBlock = blockNumber + 1;

  // Flashbots requires a signature header for authentication
  const authSigner = ethers.Wallet.createRandom();

  const bundle = [{ signedTransaction: signedTx }];

  const params = {
    txs: bundle.map((tx) => tx.signedTransaction),
    blockNumber: "0x" + targetBlock.toString(16),
  };

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_sendBundle",
    params: [params],
  });

  // Sign the body for Flashbots authentication
  const signature = await authSigner.signMessage(ethers.id(body));

  const response = await fetch(FLASHBOTS_RELAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Flashbots-Signature": `${authSigner.address}:${signature}`,
    },
    body,
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(`Flashbots error: ${result.error.message}`);
  }

  return {
    bundleHash: result.result?.bundleHash,
    targetBlock,
    relay: FLASHBOTS_RELAY,
  };
}

/**
 * Check if a Flashbots bundle was included
 */
export async function checkBundleStatus(bundleHash, targetBlock) {
  const authSigner = ethers.Wallet.createRandom();

  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "flashbots_getBundleStatsV2",
    params: [{ bundleHash, blockNumber: "0x" + targetBlock.toString(16) }],
  });

  const signature = await authSigner.signMessage(ethers.id(body));

  const response = await fetch(FLASHBOTS_RELAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Flashbots-Signature": `${authSigner.address}:${signature}`,
    },
    body,
  });

  return response.json();
}
