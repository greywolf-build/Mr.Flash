import { useDispatch, useSelector } from "react-redux";
import { MODES, setMode } from "../store/strategySlice.js";

const MODE_LABELS = {
  [MODES.DEX_ARB]: "DEX ARBITRAGE",
  [MODES.NFT_LIQ]: "NFT LIQUIDATIONS",
  [MODES.NEW_IDEAS]: "NEW IDEAS",
};

export default function StrategySelector() {
  const dispatch = useDispatch();
  const activeMode = useSelector((s) => s.strategy.activeMode);

  return (
    <div className="panel strategy-selector">
      <div className="panel-header">STRATEGY MODE</div>
      <div className="strategy-buttons">
        {Object.entries(MODE_LABELS).map(([mode, label]) => (
          <button
            key={mode}
            className={`btn strategy-btn ${activeMode === mode ? "active" : ""}`}
            onClick={() => dispatch(setMode(mode))}
          >
            <span className="strategy-indicator">
              {activeMode === mode ? "[*]" : "[ ]"}
            </span>
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
