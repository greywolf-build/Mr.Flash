import { useSelector } from "react-redux";
import { selectChains, selectChainOrder, selectActiveChainIds } from "../store/chainSlice.js";

export default function GasOptimizer() {
  const gas = useSelector((s) => s.gas);
  const chains = useSelector(selectChains);
  const chainOrder = useSelector(selectChainOrder);
  const activeChainIds = useSelector(selectActiveChainIds);

  const gasNum = parseFloat(gas.gasPrice) || 0;
  let level = "LOW";
  let levelClass = "text-green";
  if (gasNum > 50) {
    level = "HIGH";
    levelClass = "text-red";
  } else if (gasNum > 20) {
    level = "MED";
    levelClass = "text-yellow";
  }

  return (
    <div className="panel gas-panel">
      <div className="panel-header">GAS OPTIMIZER</div>
      <div className="gas-grid">
        <div className="gas-item">
          <span className="gas-label">BASE FEE</span>
          <span className="gas-value">{parseFloat(gas.baseFee).toFixed(2)} gwei</span>
        </div>
        <div className="gas-item">
          <span className="gas-label">PRIORITY</span>
          <span className="gas-value">{parseFloat(gas.maxPriority).toFixed(2)} gwei</span>
        </div>
        <div className="gas-item">
          <span className="gas-label">GAS PRICE</span>
          <span className={`gas-value ${levelClass}`}>
            {gasNum.toFixed(2)} gwei
          </span>
        </div>
        <div className="gas-item">
          <span className="gas-label">LEVEL</span>
          <span className={`gas-value ${levelClass}`}>{level}</span>
        </div>
        <div className="gas-item">
          <span className="gas-label">BLOCK</span>
          <span className="gas-value">#{gas.blockNumber}</span>
        </div>
      </div>
      {activeChainIds.length >= 2 && (
        <div className="gas-multichain">
          <div className="gas-multichain-header">PER-CHAIN GAS</div>
          {chainOrder.map((id) => {
            const chain = chains[id];
            if (!chain || !chain.active) return null;
            const chainGas = parseFloat(chain.gasPrice) || 0;
            let chainLevel = "text-green";
            if (chainGas > 50) chainLevel = "text-red";
            else if (chainGas > 20) chainLevel = "text-yellow";

            return (
              <div key={id} className="gas-chain-row">
                <span className="gas-chain-name" style={{ color: chain.color }}>
                  {chain.shortName}
                </span>
                <span className={`gas-chain-value ${chainLevel}`}>
                  {chainGas > 0 ? `${chainGas.toFixed(2)} gwei` : "--"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
