/**
 * Per-chain ethers.js providers + wallets (cached).
 * Single source of truth — all services import getProviderForChain from here.
 */

import { ethers } from "ethers";
import { CHAINS } from "./chainConfig.js";

const providers = new Map();
const wallets = new Map();

/**
 * Get (or create) an ethers JsonRpcProvider for the given chain.
 * Reads RPC URL from process.env[chain.rpcEnvKey] with fallback to chain.fallbackRpc.
 *
 * Uses `staticNetwork` so ethers does NOT attempt to auto-detect the chain
 * via eth_chainId. Without this, slow/rate-limited endpoints produce spammy
 * "JsonRpcProvider failed to detect network and cannot start up" retry logs
 * and delayed startup. Since we always know the chainId upfront, pinning it
 * eliminates that entire startup probe.
 *
 * @param {number} chainId
 * @returns {ethers.JsonRpcProvider}
 */
export function getProviderForChain(chainId) {
  if (providers.has(chainId)) return providers.get(chainId);

  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`Unsupported chain: ${chainId}`);

  const rpcUrl = process.env[chain.rpcEnvKey] || process.env.RPC_URL_ETHEREUM || chain.fallbackRpc;

  // For Ethereum, also check the legacy RPC_URL env var
  const url = chainId === 1
    ? (process.env[chain.rpcEnvKey] || process.env.RPC_URL || chain.fallbackRpc)
    : rpcUrl;

  const staticNetwork = ethers.Network.from(chainId);
  const provider = new ethers.JsonRpcProvider(url, staticNetwork, { staticNetwork });
  providers.set(chainId, provider);
  return provider;
}

/**
 * Get (or create) an ethers Wallet for the given chain.
 * Same PRIVATE_KEY used across all chains.
 * @param {number} chainId
 * @returns {ethers.Wallet}
 */
export function getWalletForChain(chainId) {
  if (wallets.has(chainId)) return wallets.get(chainId);

  const pk = process.env.PRIVATE_KEY;
  if (!pk) throw new Error("PRIVATE_KEY not set in .env");

  const provider = getProviderForChain(chainId);
  const wallet = new ethers.Wallet(pk, provider);
  wallets.set(chainId, wallet);
  return wallet;
}
