import { useSelector } from "react-redux";
import { useState } from "react";

export default function NftLiquidations() {
  const nft = useSelector((s) => s.opportunities.nft);
  const connected = useSelector((s) => s.wallet.connected);
  const [executing, setExecuting] = useState(null);

  const handleExecute = async (opp) => {
    if (!connected) return alert("Connect wallet first");
    setExecuting(opp.id);
    try {
      const res = await fetch("/api/execute/nft-liq", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractAddress: "",
          asset: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          amount: opp.principal?.replace(" ETH", "") || "1",
          liqTarget: "",
          liqCalldata: "0x",
          sellTarget: "",
          sellCalldata: "0x",
          useFlashbots: true,
        }),
      });
      const data = await res.json();
      if (!data.success) alert("Execution failed: " + data.error);
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setExecuting(null);
    }
  };

  return (
    <div className="panel main-panel">
      <div className="panel-header">
        NFT LIQUIDATIONS — LIVE MONITOR
        <span className="feed-count">[{nft.length}]</span>
      </div>

      {nft.length === 0 ? (
        <div className="empty-feed">
          <div className="scanner-animation">MONITORING...</div>
          <p>Scanning Blur Blend and NFTfi for liquidatable positions</p>
          <p className="text-dim">
            Positions approaching liquidation threshold will appear here
          </p>
        </div>
      ) : (
        <div className="opp-table-wrap">
          <table className="opp-table">
            <thead>
              <tr>
                <th>PLATFORM</th>
                <th>COLLECTION</th>
                <th>TOKEN</th>
                <th>PRINCIPAL</th>
                <th>STATUS</th>
                <th>REMAINING</th>
                <th>SPREAD</th>
                <th>NET PROFIT</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {nft.map((opp) => (
                <tr
                  key={opp.id}
                  className={opp.profitable ? "row-profitable" : "row-unprofitable"}
                >
                  <td className="text-dim">{opp.platform}</td>
                  <td className="text-bold">{opp.collection}</td>
                  <td>#{opp.tokenId}</td>
                  <td>{opp.principal}</td>
                  <td
                    className={
                      opp.status === "LIQUIDATABLE" ? "text-green blink" : "text-yellow"
                    }
                  >
                    {opp.status}
                  </td>
                  <td>
                    {typeof opp.blocksRemaining === "number"
                      ? `${opp.blocksRemaining} blocks`
                      : opp.timeRemaining}
                  </td>
                  <td className="text-green">{opp.estimatedSpread}</td>
                  <td className={opp.profitable ? "text-green" : "text-red"}>
                    {opp.netProfitEth} ETH
                  </td>
                  <td>
                    <button
                      className={`btn btn-sm ${opp.profitable ? "btn-execute" : "btn-disabled"}`}
                      disabled={!opp.profitable || executing === opp.id}
                      onClick={() => handleExecute(opp)}
                    >
                      {executing === opp.id ? "EXEC..." : "LIQUIDATE"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
