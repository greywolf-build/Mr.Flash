import { useDispatch, useSelector } from "react-redux";
import { connectWallet, disconnect } from "../store/walletSlice.js";

export default function ConnectWallet() {
  const dispatch = useDispatch();
  const { address, balance, connected, loading, error } = useSelector(
    (s) => s.wallet
  );

  if (connected) {
    return (
      <div className="wallet-info">
        <span className="wallet-balance">{balance} ETH</span>
        <span className="wallet-address">
          {address.slice(0, 6)}...{address.slice(-4)}
        </span>
        <button className="btn btn-sm" onClick={() => dispatch(disconnect())}>
          DISCONNECT
        </button>
      </div>
    );
  }

  return (
    <div className="wallet-info">
      {error && <span className="text-red">{error}</span>}
      <button
        className="btn btn-primary"
        onClick={() => dispatch(connectWallet())}
        disabled={loading}
      >
        {loading ? "CONNECTING..." : "CONNECT WALLET"}
      </button>
    </div>
  );
}
