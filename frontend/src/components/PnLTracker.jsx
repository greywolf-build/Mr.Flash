import { useSelector, useDispatch } from "react-redux";
import { useEffect } from "react";
import { fetchPnl } from "../store/pnlSlice.js";

export default function PnLTracker() {
  const dispatch = useDispatch();
  const { log, totalProfit, totalTrades, winRate } = useSelector((s) => s.pnl);

  useEffect(() => {
    dispatch(fetchPnl());
    const interval = setInterval(() => dispatch(fetchPnl()), 30_000);
    return () => clearInterval(interval);
  }, [dispatch]);

  return (
    <div className="panel pnl-panel">
      <div className="panel-header">P&L TRACKER</div>
      <div className="pnl-stats">
        <div className="pnl-stat">
          <span className="pnl-label">TOTAL P&L</span>
          <span
            className={`pnl-value ${
              parseFloat(totalProfit) >= 0 ? "text-green" : "text-red"
            }`}
          >
            {totalProfit} ETH
          </span>
        </div>
        <div className="pnl-stat">
          <span className="pnl-label">TRADES</span>
          <span className="pnl-value">{totalTrades}</span>
        </div>
        <div className="pnl-stat">
          <span className="pnl-label">WIN RATE</span>
          <span className="pnl-value">{winRate}%</span>
        </div>
      </div>
      <div className="pnl-log">
        {log.length === 0 ? (
          <div className="text-dim pnl-empty">No trades executed yet</div>
        ) : (
          log.slice(0, 10).map((entry) => (
            <div key={entry.id} className={`pnl-entry ${entry.status}`}>
              <span className="pnl-time">
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span className="pnl-type">{entry.type}</span>
              <span
                className={`pnl-result ${
                  entry.status === "executed" ? "text-green" : "text-red"
                }`}
              >
                {entry.status === "executed" ? "OK" : "FAIL"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
