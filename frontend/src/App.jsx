import { useState } from "react";
import { useSelector } from "react-redux";
import { MODES } from "./store/strategySlice.js";
import { useWebSocket } from "./hooks/useWebSocket.js";
import Header from "./components/Header.jsx";
import ChainToggleBar from "./components/ChainToggleBar.jsx";
import StrategySelector from "./components/StrategySelector.jsx";
import GasOptimizer from "./components/GasOptimizer.jsx";
import DexArbitrage from "./components/DexArbitrage.jsx";
import NftLiquidations from "./components/NftLiquidations.jsx";
import NewIdeas from "./components/NewIdeas.jsx";
import PnLTracker from "./components/PnLTracker.jsx";
import Landing from "./components/Landing.jsx";

export default function App() {
  useWebSocket();

  const [entered, setEntered] = useState(false);
  const activeMode = useSelector((s) => s.strategy.activeMode);

  if (!entered) {
    return <Landing onEnter={() => setEntered(true)} />;
  }

  return (
    <div className="terminal">
      <Header />
      <ChainToggleBar />
      <div className="terminal-body">
        <div className="panel-left">
          <StrategySelector />
          <GasOptimizer />
          <PnLTracker />
        </div>
        <div className="panel-main">
          {activeMode === MODES.DEX_ARB && <DexArbitrage />}
          {activeMode === MODES.NFT_LIQ && <NftLiquidations />}
          {activeMode === MODES.NEW_IDEAS && <NewIdeas />}
        </div>
      </div>
    </div>
  );
}
