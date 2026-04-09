import { useDispatch, useSelector } from "react-redux";
import { toggleChain, selectChains, selectChainOrder } from "../store/chainSlice.js";

export default function ChainToggleBar() {
  const dispatch = useDispatch();
  const chains = useSelector(selectChains);
  const chainOrder = useSelector(selectChainOrder);

  return (
    <div className="chain-toggle-bar">
      <span className="chain-bar-label">CHAINS</span>
      {chainOrder.map((id) => {
        const chain = chains[id];
        if (!chain) return null;
        const active = chain.active;
        const gasNum = parseFloat(chain.gasPrice) || 0;

        return (
          <button
            key={id}
            className={`chain-toggle ${active ? "chain-active" : "chain-inactive"}`}
            style={active ? { borderColor: chain.color } : undefined}
            onClick={() => dispatch(toggleChain(id))}
          >
            <span
              className="chain-dot"
              style={{ background: active ? chain.color : "#333" }}
            />
            <span className="chain-toggle-name">{chain.shortName}</span>
            {active && gasNum > 0 && (
              <span className="chain-gas-badge">{gasNum.toFixed(1)}g</span>
            )}
            {active && !chain.hasGas && parseFloat(chain.nativeBalance) === 0 && (
              <span className="chain-no-gas" title="No gas token">!</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
