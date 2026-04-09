import { EventEmitter } from "events";
import { ethers } from "ethers";
import { getProviderForChain } from "./multiProvider.js";

// NFTfi v2 DirectLoanFixedOffer on mainnet
const NFTFI_LOAN_CONTRACT = "0xf896527c49b44aAb3Cf22aE356Fa3AF8E331F280";
// Blur Blend (lending) on mainnet
const BLUR_BLEND = "0x29469395eAf6f95920E59F858042f0e28D98a20B";

// Minimal ABIs for monitoring loan health
const NFTFI_ABI = [
  "function loanIdToLoan(uint32) external view returns (uint256 loanPrincipalAmount, uint256 maximumRepaymentAmount, uint256 nftCollateralId, address loanERC20Denomination, uint32 loanDuration, uint16 loanInterestRateForDurationInBasisPoints, uint16 loanAdminFeeInBasisPoints, address nftCollateralContract, uint64 loanStartTime, address borrower, address lender)",
];

const BLEND_ABI = [
  "function liens(uint256) external view returns (address lender, address borrower, address collection, uint256 tokenId, uint256 principal, uint256 rate, uint256 auctionStartBlock, uint256 auctionDuration)",
];

// Known NFT collections to monitor for liquidations
const MONITORED_COLLECTIONS = [
  { name: "CryptoPunks", address: "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB" },
  { name: "BAYC", address: "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D" },
  { name: "Azuki", address: "0xED5AF388653567Af2F388E6224dC7C4b3241C544" },
  { name: "Pudgy Penguins", address: "0xBd3531dA5CF5857e7CfAA92426877b022e612cf8" },
];

export class NftMonitor extends EventEmitter {
  constructor() {
    super();
    this.latest = [];
    this._interval = null;
    this._knownLiens = [];
  }

  start(intervalMs = 15_000) {
    this._poll();
    this._interval = setInterval(() => this._poll(), intervalMs);
  }

  stop() {
    if (this._interval) clearInterval(this._interval);
  }

  async _poll() {
    try {
      const provider = getProviderForChain(1);
      const feeData = await provider.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;
      const blockNumber = await provider.getBlockNumber();
      const opportunities = [];

      // Check Blur Blend liens for auctions in progress
      try {
        const blend = new ethers.Contract(BLUR_BLEND, BLEND_ABI, provider);

        // Scan recent lien IDs — in production, you'd index events
        // For the terminal, we scan a window of recent lien IDs
        for (let lienId = 0; lienId < 20; lienId++) {
          try {
            const lien = await blend.liens(lienId);
            const auctionStart = Number(lien.auctionStartBlock);
            const auctionDuration = Number(lien.auctionDuration);

            // Check if auction is active and near expiry
            if (auctionStart > 0 && blockNumber > auctionStart) {
              const blocksRemaining = (auctionStart + auctionDuration) - blockNumber;
              const isLiquidatable = blocksRemaining <= 0;
              const isNearLiquidation = blocksRemaining > 0 && blocksRemaining < 100;

              if (isLiquidatable || isNearLiquidation) {
                const principalEth = parseFloat(ethers.formatEther(lien.principal));
                // Estimate 5-15% spread on liquidation
                const estimatedSpread = principalEth * 0.08;
                const gasCostEth = parseFloat(ethers.formatEther(gasPrice * 500_000n));
                const netProfit = estimatedSpread - gasCostEth;

                const collection = MONITORED_COLLECTIONS.find(
                  (c) => c.address.toLowerCase() === lien.collection.toLowerCase()
                );

                opportunities.push({
                  id: `blur-${lienId}-${Date.now()}`,
                  platform: "Blur Blend",
                  collection: collection?.name || truncAddr(lien.collection),
                  tokenId: lien.tokenId.toString(),
                  borrower: truncAddr(lien.borrower),
                  principal: principalEth.toFixed(4) + " ETH",
                  status: isLiquidatable ? "LIQUIDATABLE" : "NEAR LIQUIDATION",
                  blocksRemaining: Math.max(0, blocksRemaining),
                  estimatedSpread: estimatedSpread.toFixed(4) + " ETH",
                  gasCostEth: gasCostEth.toFixed(6),
                  netProfitEth: netProfit.toFixed(4),
                  profitable: netProfit > 0,
                  timestamp: Date.now(),
                });
              }
            }
          } catch {
            // Lien doesn't exist or reverted
          }
        }
      } catch (err) {
        console.error("[nft] Blur scan error:", err.message);
      }

      // Check NFTfi loans approaching expiry
      try {
        const nftfi = new ethers.Contract(NFTFI_LOAN_CONTRACT, NFTFI_ABI, provider);

        for (let loanId = 0; loanId < 10; loanId++) {
          try {
            const loan = await nftfi.loanIdToLoan(loanId);
            const startTime = Number(loan.loanStartTime);
            const duration = Number(loan.loanDuration);
            const expiryTime = startTime + duration;
            const now = Math.floor(Date.now() / 1000);
            const timeRemaining = expiryTime - now;

            // Flag loans expiring within 1 hour
            if (startTime > 0 && timeRemaining < 3600 && timeRemaining > -86400) {
              const principalEth = parseFloat(
                ethers.formatEther(loan.loanPrincipalAmount)
              );
              const maxRepayEth = parseFloat(
                ethers.formatEther(loan.maximumRepaymentAmount)
              );
              const spread = maxRepayEth - principalEth;
              const gasCostEth = parseFloat(ethers.formatEther(gasPrice * 500_000n));
              const netProfit = spread - gasCostEth;

              const collection = MONITORED_COLLECTIONS.find(
                (c) =>
                  c.address.toLowerCase() ===
                  loan.nftCollateralContract.toLowerCase()
              );

              opportunities.push({
                id: `nftfi-${loanId}-${Date.now()}`,
                platform: "NFTfi",
                collection: collection?.name || truncAddr(loan.nftCollateralContract),
                tokenId: loan.nftCollateralId.toString(),
                borrower: truncAddr(loan.borrower),
                principal: principalEth.toFixed(4) + " ETH",
                status: timeRemaining <= 0 ? "LIQUIDATABLE" : "EXPIRING SOON",
                timeRemaining: timeRemaining > 0 ? formatSeconds(timeRemaining) : "EXPIRED",
                estimatedSpread: spread.toFixed(4) + " ETH",
                gasCostEth: gasCostEth.toFixed(6),
                netProfitEth: netProfit.toFixed(4),
                profitable: netProfit > 0,
                timestamp: Date.now(),
              });
            }
          } catch {
            // Loan doesn't exist
          }
        }
      } catch (err) {
        console.error("[nft] NFTfi scan error:", err.message);
      }

      opportunities.sort(
        (a, b) => parseFloat(b.netProfitEth) - parseFloat(a.netProfitEth)
      );

      this.latest = opportunities;
      this.emit("opportunities", opportunities);
    } catch (err) {
      console.error("[nft] Monitor error:", err.message);
    }
  }
}

function truncAddr(addr) {
  if (!addr) return "???";
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

function formatSeconds(s) {
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
