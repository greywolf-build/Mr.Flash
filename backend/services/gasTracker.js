import { EventEmitter } from "events";
import { ethers } from "ethers";
import { getProviderForChain } from "./multiProvider.js";

export class GasTracker extends EventEmitter {
  constructor() {
    super();
    this.latest = { baseFee: "0", maxPriority: "1.5", gasPrice: "0", blockNumber: 0 };
    this._interval = null;
  }

  start(intervalMs = 12_000) {
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
      const block = await provider.getBlockNumber();

      this.latest = {
        baseFee: ethers.formatUnits(feeData.gasPrice || 0n, "gwei"),
        maxPriority: ethers.formatUnits(feeData.maxPriorityFeePerGas || 1500000000n, "gwei"),
        gasPrice: ethers.formatUnits(feeData.gasPrice || 0n, "gwei"),
        blockNumber: block,
      };

      this.emit("update", this.latest);
    } catch (err) {
      // Emit last known data on error — don't crash the loop
      console.error("[gas] Poll error:", err.message);
    }
  }
}
