/**
 * CCTP Bridge Client — Circle Cross-Chain Transfer Protocol.
 * Handles: approve -> depositForBurn -> attestation polling -> receiveMessage
 */

import { ethers } from "ethers";
import { CHAINS } from "./chainConfig.js";
import { getWalletForChain, getProviderForChain } from "./multiProvider.js";

// Minimal ABIs for CCTP interactions
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
];

const TOKEN_MESSENGER_ABI = [
  "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken) external returns (uint64 nonce)",
  "event DepositForBurn(uint64 indexed nonce, address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller)",
];

const MESSAGE_TRANSMITTER_ABI = [
  "function receiveMessage(bytes message, bytes attestation) external returns (bool success)",
  "event MessageSent(bytes message)",
];

const CIRCLE_ATTESTATION_API = "https://iris-api.circle.com/attestations";
const ATTESTATION_POLL_INTERVAL = 15_000; // 15 seconds
const DEFAULT_MAX_WAIT = 25 * 60 * 1000; // 25 minutes

export class CctpBridge {
  constructor() {
    this._activeTransfers = new Map();
  }

  /**
   * Initiate a CCTP bridge transfer.
   * @param {{ sourceChainId: number, destChainId: number, amount: string }} params
   *   amount is in USDC base units (6 decimals)
   * @returns {{ txHash: string, messageHash: string, messageBytes: string }}
   */
  async initiateBridge({ sourceChainId, destChainId, amount }) {
    const sourceChain = CHAINS[sourceChainId];
    const destChain = CHAINS[destChainId];
    if (!sourceChain || !destChain) throw new Error("Invalid chain IDs");

    const wallet = getWalletForChain(sourceChainId);
    const walletAddress = await wallet.getAddress();

    // 1. Approve TokenMessenger to spend USDC
    const usdc = new ethers.Contract(sourceChain.usdc, ERC20_ABI, wallet);
    const allowance = await usdc.allowance(walletAddress, sourceChain.tokenMessenger);

    if (allowance < BigInt(amount)) {
      console.log(`[cctp] Approving TokenMessenger on ${sourceChain.shortName}...`);
      const approveTx = await usdc.approve(sourceChain.tokenMessenger, amount);
      await approveTx.wait();
      console.log(`[cctp] Approval confirmed: ${approveTx.hash}`);
    }

    // 2. Call depositForBurn
    const tokenMessenger = new ethers.Contract(
      sourceChain.tokenMessenger,
      TOKEN_MESSENGER_ABI,
      wallet
    );

    // mintRecipient must be bytes32-padded address
    const mintRecipient = ethers.zeroPadValue(walletAddress, 32);

    console.log(`[cctp] depositForBurn: ${amount} USDC from ${sourceChain.shortName} to ${destChain.shortName}`);
    const tx = await tokenMessenger.depositForBurn(
      amount,
      destChain.cctpDomain,
      mintRecipient,
      sourceChain.usdc
    );
    const receipt = await tx.wait();

    // 3. Extract messageBytes from MessageSent event
    const messageTransmitter = new ethers.Interface(MESSAGE_TRANSMITTER_ABI);
    let messageBytes = null;

    for (const log of receipt.logs) {
      try {
        const parsed = messageTransmitter.parseLog({ topics: log.topics, data: log.data });
        if (parsed && parsed.name === "MessageSent") {
          messageBytes = parsed.args.message;
          break;
        }
      } catch {
        // Not the right log, skip
      }
    }

    if (!messageBytes) {
      // Fallback: try finding MessageSent from message transmitter address
      const provider = getProviderForChain(sourceChainId);
      const mtContract = new ethers.Contract(
        sourceChain.messageTransmitter,
        MESSAGE_TRANSMITTER_ABI,
        provider
      );
      const events = await mtContract.queryFilter(
        mtContract.filters.MessageSent(),
        receipt.blockNumber,
        receipt.blockNumber
      );
      for (const event of events) {
        if (event.transactionHash === receipt.hash) {
          messageBytes = event.args.message;
          break;
        }
      }
    }

    if (!messageBytes) throw new Error("Failed to extract MessageSent from transaction");

    const messageHash = ethers.keccak256(messageBytes);

    return {
      txHash: receipt.hash,
      messageHash,
      messageBytes,
    };
  }

  /**
   * Poll Circle attestation API until status is "complete".
   * @param {string} messageHash
   * @param {number} maxWaitMs
   * @returns {string} attestation signature
   */
  async waitForAttestation(messageHash, maxWaitMs = DEFAULT_MAX_WAIT) {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const res = await fetch(`${CIRCLE_ATTESTATION_API}/${messageHash}`);
        if (res.ok) {
          const data = await res.json();
          if (data.status === "complete" && data.attestation) {
            console.log(`[cctp] Attestation received for ${messageHash}`);
            return data.attestation;
          }
        }
      } catch (err) {
        console.warn(`[cctp] Attestation poll error: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, ATTESTATION_POLL_INTERVAL));
    }

    throw new Error(`Attestation timeout after ${maxWaitMs / 1000}s for ${messageHash}`);
  }

  /**
   * Complete the bridge by calling receiveMessage on the destination chain.
   * @param {{ destChainId: number, messageBytes: string, attestation: string }} params
   * @returns {{ txHash: string }}
   */
  async completeBridge({ destChainId, messageBytes, attestation }) {
    const destChain = CHAINS[destChainId];
    if (!destChain) throw new Error(`Invalid destination chain: ${destChainId}`);

    const wallet = getWalletForChain(destChainId);
    const messageTransmitter = new ethers.Contract(
      destChain.messageTransmitter,
      MESSAGE_TRANSMITTER_ABI,
      wallet
    );

    console.log(`[cctp] receiveMessage on ${destChain.shortName}...`);
    const tx = await messageTransmitter.receiveMessage(messageBytes, attestation);
    const receipt = await tx.wait();

    console.log(`[cctp] Bridge complete: ${receipt.hash}`);
    return { txHash: receipt.hash };
  }

  /**
   * Full pipeline: initiate -> wait for attestation -> complete.
   * Long-running (~15-20 min). Status updates via onStatus callback.
   * @param {{ sourceChainId: number, destChainId: number, amount: string, onStatus?: function }} params
   * @returns {{ initTxHash: string, completeTxHash: string }}
   */
  async executeFull({ sourceChainId, destChainId, amount, onStatus }) {
    const notify = onStatus || (() => {});
    const transferId = `bridge-${sourceChainId}-${destChainId}-${Date.now()}`;

    try {
      // Step 1: Initiate
      notify({ transferId, step: "initiating", message: "Initiating CCTP bridge transfer..." });
      const { txHash, messageHash, messageBytes } = await this.initiateBridge({
        sourceChainId,
        destChainId,
        amount,
      });
      notify({ transferId, step: "initiated", message: `Deposit confirmed: ${txHash}`, txHash });

      // Step 2: Wait for attestation
      notify({ transferId, step: "waiting_attestation", message: "Waiting for Circle attestation (~15 min)..." });
      const attestation = await this.waitForAttestation(messageHash);
      notify({ transferId, step: "attestation_received", message: "Attestation received, completing bridge..." });

      // Step 3: Complete on destination
      notify({ transferId, step: "completing", message: "Submitting receiveMessage on destination chain..." });
      const { txHash: completeTxHash } = await this.completeBridge({
        destChainId,
        messageBytes,
        attestation,
      });
      notify({ transferId, step: "complete", message: `Bridge complete: ${completeTxHash}`, completeTxHash });

      return { initTxHash: txHash, completeTxHash };
    } catch (err) {
      notify({ transferId, step: "error", message: err.message });
      throw err;
    }
  }
}
