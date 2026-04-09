import { useSelector, useDispatch } from "react-redux";
import { setSortBy, toggleShowCrossChain } from "../store/opportunitiesSlice.js";
import { selectChains } from "../store/chainSlice.js";
import { wsSend } from "../hooks/useWebSocket.js";
import { Fragment, useState } from "react";

const DEX_LABELS = {
  UNISWAP_V3: "Uni V3",
  UNISWAP_V2: "Uni V2",
  SUSHI_V2: "Sushi V2",
  SUSHI_V3: "Sushi V3",
  PANCAKESWAP_V2: "Cake V2",
  PANCAKESWAP_V3: "Cake V3",
  CURVE_V1: "Curve V1",
  CURVE_V2: "Curve V2",
  CURVE_V1_FACTORY: "Curve Fac",
  CURVE_V1_STABLE_NG: "Curve NG",
  BALANCER_V1: "Bal V1",
  BALANCER_V2: "Bal V2",
  DEFI_SWAP: "DefiSwap",
  SHIBA_SWAP: "ShibaSwap",
  VERSE: "Verse",
  HASHFLOW: "Hashflow",
  SOLIDLY_V3: "Solidly V3",
  SYNAPSE: "Synapse",
  AUGUSTUS_RFQ: "Aug RFQ",
};

const ETH_PRICE_USD = 2500;
const FLASH_LOAN_FEE_PCT = 0.0005; // Aave 0.05%

function ChainBadge({ shortName, color }) {
  return (
    <span className="chain-badge" style={{ borderColor: color, color }}>
      {shortName}
    </span>
  );
}

export default function DexArbitrage() {
  const dispatch = useDispatch();
  const { dex, sortBy, sortDir, autoExecuteEnabled, autoExecuteLog, showCrossChain } =
    useSelector((s) => s.opportunities);
  const connected = useSelector((s) => s.wallet.connected);
  const chains = useSelector(selectChains);
  const [executing, setExecuting] = useState(null);
  const [selected, setSelected] = useState(null);

  const toggleAutoExecute = () => {
    wsSend("set_auto_execute", { enabled: !autoExecuteEnabled });
  };

  // Latest auto-execute event for toast display
  const latestAutoEvent = autoExecuteLog[0] || null;

  // Cross-chain arb requires pre-positioned inventory on both chains (no flash
  // loan can bridge), so hide those rows by default. User toggles visibility
  // via the BRIDGE button in the header when they want to see capital-heavy ops.
  const crossChainCount = dex.filter((o) => o.type === "cross-chain").length;
  const filtered = showCrossChain
    ? dex
    : dex.filter((o) => o.type !== "cross-chain");

  const sorted = [...filtered].sort((a, b) => {
    const aVal = typeof a[sortBy] === "number" ? a[sortBy] : parseFloat(a[sortBy]) || 0;
    const bVal = typeof b[sortBy] === "number" ? b[sortBy] : parseFloat(b[sortBy]) || 0;
    return sortDir === "desc" ? bVal - aVal : aVal - bVal;
  });

  // First profitable opportunity in sorted list is the "BEST"
  const bestId = sorted.find((o) => o.profitable)?.id;

  const handleExecute = async (opp) => {
    if (!connected) return alert("Connect wallet first");
    setExecuting(opp.id);
    try {
      if (opp.type === "cross-chain") {
        const res = await fetch("/api/execute/cross-chain-arb", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            buyChainId: opp.chainId,
            sellChainId: opp.destChainId,
            buyProtocol: opp.buyDex,
            sellProtocol: opp.sellDex,
            pair: opp.pair,
            amountIn: opp.amountIn,
            slippage: 250,
          }),
        });
        const data = await res.json();
        if (!data.success) console.error("[EXECUTE FAILED]", data.error);
      } else {
        const res = await fetch("/api/execute/dex-arb-paraswap", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chainId: opp.chainId,
            pair: opp.pair,
            amountIn: opp.amountIn,
            buyProtocol: opp.buyDex,
            sellProtocol: opp.sellDex,
            useFlashbots: true,
          }),
        });
        const data = await res.json();
        if (!data.success) console.error("[EXECUTE FAILED]", data.error);
      }
    } catch (err) {
      console.error("[EXECUTE ERROR]", err.message);
    } finally {
      setExecuting(null);
    }
  };

  const sortIcon = (col) => {
    if (sortBy !== col) return " ";
    return sortDir === "desc" ? "v" : "^";
  };

  const formatDexName = (key) => DEX_LABELS[key] || key;

  const estimateFlashLoanFee = (opp) => {
    const amountNum = parseFloat(opp.amountIn);
    if (isNaN(amountNum)) return 0;
    const symbol = opp.amountIn.split(" ")[1];
    if (["WETH", "stETH", "rETH", "cbETH"].includes(symbol)) {
      return amountNum * ETH_PRICE_USD * FLASH_LOAN_FEE_PCT;
    }
    if (symbol === "WBTC") {
      return amountNum * 65000 * FLASH_LOAN_FEE_PCT;
    }
    return amountNum * FLASH_LOAN_FEE_PCT;
  };

  const getChainInfo = (chainId) => {
    const c = chains[chainId];
    return c || { shortName: "?", color: "#666" };
  };

  return (
    <div className="panel main-panel">
      <div className="panel-header">
        DEX ARBITRAGE — LIVE OPPORTUNITIES
        <span className="feed-count">[{sorted.length}]</span>
        <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "10px" }}>
          <button
            className={`btn btn-sm ${showCrossChain ? "btn-execute" : "btn-disabled"}`}
            onClick={() => dispatch(toggleShowCrossChain())}
            title={
              showCrossChain
                ? "Showing cross-chain rows (require pre-positioned inventory on both chains — NO flash loan)"
                : `Cross-chain rows hidden (${crossChainCount} filtered). These need capital on both chains — flash loans can't bridge.`
            }
            style={{ fontSize: "0.7rem", padding: "2px 8px" }}
          >
            BRIDGE {showCrossChain ? "ON" : "OFF"}
            {!showCrossChain && crossChainCount > 0 && (
              <span style={{ marginLeft: 4, opacity: 0.6 }}>({crossChainCount})</span>
            )}
          </button>
          <span className="auto-execute-toggle" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            <span
              className="auto-dot"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: autoExecuteEnabled ? "#0f0" : "#555",
                display: "inline-block",
                boxShadow: autoExecuteEnabled ? "0 0 6px #0f0" : "none",
              }}
            />
            <button
              className={`btn btn-sm ${autoExecuteEnabled ? "btn-execute" : "btn-disabled"}`}
              onClick={toggleAutoExecute}
              title={autoExecuteEnabled ? "Auto-execute ON — click to disable" : "Enable auto-execute"}
              style={{ fontSize: "0.7rem", padding: "2px 8px" }}
            >
              AUTO {autoExecuteEnabled ? "ON" : "OFF"}
            </button>
          </span>
        </span>
      </div>
      {latestAutoEvent && latestAutoEvent.ts > Date.now() - 30_000 && (
        <div
          className={`auto-execute-toast ${
            latestAutoEvent.status === "success"
              ? "text-green"
              : latestAutoEvent.status === "failed"
              ? "text-red"
              : "text-dim"
          }`}
          style={{
            padding: "4px 10px",
            fontSize: "0.75rem",
            borderBottom: "1px solid #333",
          }}
        >
          [AUTO] {latestAutoEvent.status.toUpperCase()}
          {latestAutoEvent.opportunity && ` — ${latestAutoEvent.opportunity.pair} ${latestAutoEvent.opportunity.spread}%`}
          {latestAutoEvent.error && ` — ${latestAutoEvent.error}`}
          {latestAutoEvent.result && ` — tx submitted`}
        </div>
      )}

      {dex.length === 0 ? (
        <div className="empty-feed">
          <div className="scanner-animation">SCANNING...</div>
          <p>Monitoring DEXes across active chains via Paraswap aggregator</p>
          <p className="text-dim">Opportunities appear when spread exceeds gas cost</p>
        </div>
      ) : sorted.length === 0 ? (
        <div className="empty-feed">
          <p>No same-chain opportunities right now.</p>
          <p className="text-dim">
            {crossChainCount} cross-chain row{crossChainCount === 1 ? "" : "s"} hidden — toggle BRIDGE ON to view (requires inventory, no flash loan).
          </p>
        </div>
      ) : (
        <div className="opp-table-wrap">
          <table className="opp-table">
            <thead>
              <tr>
                <th>CHAIN</th>
                <th>PAIR</th>
                <th>BUY</th>
                <th>SELL</th>
                <th className="sortable" onClick={() => dispatch(setSortBy("spread"))}>
                  SPREAD {sortIcon("spread")}
                </th>
                <th>AMOUNT</th>
                <th className="sortable" onClick={() => dispatch(setSortBy("netProfitUsdc"))}>
                  NET PROFIT {sortIcon("netProfitUsdc")}
                </th>
                <th>GAS</th>
                <th>DEXes</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((opp) => {
                const srcChain = getChainInfo(opp.chainId);
                const dstChain = opp.destChainId ? getChainInfo(opp.destChainId) : null;
                const isXchain = opp.type === "cross-chain";

                return (
                  <Fragment key={opp.id}>
                    <tr
                      className={
                        selected === opp.id
                          ? "row-selected"
                          : opp.profitable
                          ? "row-profitable"
                          : "row-unprofitable"
                      }
                      onClick={() => setSelected(selected === opp.id ? null : opp.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <ChainBadge shortName={srcChain.shortName} color={srcChain.color} />
                        {isXchain && dstChain && (
                          <>
                            <span className="chain-arrow">{" -> "}</span>
                            <ChainBadge shortName={dstChain.shortName} color={dstChain.color} />
                          </>
                        )}
                      </td>
                      <td className="text-bold">
                        {opp.pair}
                        {opp.id === bestId && (
                          <span className="tag-best">BEST</span>
                        )}
                        {isXchain && (
                          <span className="tag-xchain">CROSS-CHAIN</span>
                        )}
                      </td>
                      <td>
                        <span className="text-dim">{formatDexName(opp.buyDex)}</span>
                        <br />
                        {opp.buyPrice}
                      </td>
                      <td>
                        <span className="text-dim">{formatDexName(opp.sellDex)}</span>
                        <br />
                        {opp.sellPrice}
                      </td>
                      <td className={opp.profitable ? "text-green" : "text-red"}>
                        {opp.spread}%
                      </td>
                      <td>{opp.amountIn}</td>
                      <td className={opp.profitable ? "text-green" : "text-red"}>
                        {opp.netProfitUsdcDisplay || `$${(opp.netProfitUsdc || 0).toFixed(2)}`}
                      </td>
                      <td className="text-dim">${opp.gasCostUsdc || (parseFloat(opp.gasCostEth) * ETH_PRICE_USD).toFixed(2)}</td>
                      <td className="text-dim">{opp.dexCount || 2}</td>
                      <td>
                        {opp.walletFunded === false && opp.profitable && (
                          <span className="tag-unfunded" title={opp.fundingIssue}>UNFUNDED</span>
                        )}
                        <button
                          className={`btn btn-sm ${opp.profitable && opp.walletFunded !== false ? "btn-execute" : "btn-disabled"}`}
                          disabled={!opp.profitable || opp.walletFunded === false || executing === opp.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExecute(opp);
                          }}
                        >
                          {executing === opp.id ? "EXEC..." : "EXECUTE"}
                        </button>
                      </td>
                    </tr>
                    {selected === opp.id && (
                      <tr key={`${opp.id}-detail`} className="row-detail">
                        <td colSpan={10}>
                          <div className="profit-detail-panel">
                            <div>
                              <div className="detail-label">Route</div>
                              <div className="detail-value">
                                {isXchain
                                  ? opp.route
                                  : `Buy on ${formatDexName(opp.buyDex)} -> Sell on ${formatDexName(opp.sellDex)}`}
                              </div>
                            </div>
                            <div>
                              <div className="detail-label">Gross Spread</div>
                              <div className="detail-value">{opp.estimatedProfit}</div>
                            </div>
                            <div>
                              <div className="detail-label">Gas Cost</div>
                              <div className="detail-value">
                                ${opp.gasCostUsdc || (parseFloat(opp.gasCostEth) * ETH_PRICE_USD).toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="detail-label">Net Profit</div>
                              <div className={`detail-value ${opp.profitable ? "text-green" : "text-red"}`}>
                                {opp.netProfitUsdcDisplay || `$${(opp.netProfitUsdc || 0).toFixed(2)}`}
                                <span className="text-dim">
                                  {" "}({opp.netProfitEthDisplay || (opp.netProfitEth || 0).toFixed(6)} ETH)
                                </span>
                              </div>
                            </div>
                            {opp.walletFunded === false && (
                              <div>
                                <div className="detail-label">Wallet</div>
                                <div className="detail-value text-red">
                                  {opp.fundingIssue}
                                </div>
                              </div>
                            )}
                            {isXchain ? (
                              <>
                                <div>
                                  <div className="detail-label">Bridge</div>
                                  <div className="detail-value">
                                    CCTP (Circle)
                                    <span className="text-dim"> ~${opp.bridgeCostUsdc} fee</span>
                                  </div>
                                </div>
                                <div>
                                  <div className="detail-label">Bridge Time</div>
                                  <div className="detail-value">
                                    ~{opp.bridgeTimeMinutes} min
                                  </div>
                                </div>
                              </>
                            ) : (
                              <>
                                <div>
                                  <div className="detail-label">Flash Loan</div>
                                  <div className="detail-value">
                                    {opp.amountIn}
                                    <span className="text-dim">
                                      {" "}(fee ~${estimateFlashLoanFee(opp).toFixed(2)})
                                    </span>
                                  </div>
                                </div>
                                <div>
                                  <div className="detail-label">DEXes Quoting</div>
                                  <div className="detail-value">{opp.dexCount || 2} protocols</div>
                                </div>
                              </>
                            )}
                          </div>
                          {opp.dexQuotes && Object.keys(opp.dexQuotes).length > 0 && (
                            <div className="dex-quotes-grid">
                              {Object.entries(opp.dexQuotes).map(([dex, q]) => (
                                <div
                                  key={dex}
                                  className={`dex-quote-card ${
                                    dex === opp.sellDex
                                      ? "dex-best"
                                      : dex === opp.buyDex
                                      ? "dex-worst"
                                      : ""
                                  }`}
                                >
                                  <div className="dex-quote-name">{formatDexName(dex)}</div>
                                  <div className="dex-quote-amount">
                                    {q.toAmountFloat?.toFixed(4)}
                                  </div>
                                  <div className="dex-quote-gas text-dim">
                                    gas: {q.gas}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
