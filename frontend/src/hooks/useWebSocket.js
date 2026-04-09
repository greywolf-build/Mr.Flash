import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { updateGas } from "../store/gasSlice.js";
import {
  setDexOpportunities,
  setNftOpportunities,
  setAutoExecuteState,
  appendAutoExecuteLog,
} from "../store/opportunitiesSlice.js";
import { updateMultiGas, updateWalletBalances, selectActiveChainIds } from "../store/chainSlice.js";

// Module-level ref so other components can send without prop drilling
let _ws = null;

export function wsSend(type, data) {
  if (_ws && _ws.readyState === 1) {
    _ws.send(JSON.stringify({ type, data }));
  }
}

export function useWebSocket() {
  const dispatch = useDispatch();
  const wsRef = useRef(null);
  const activeChainIds = useSelector(selectActiveChainIds);

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    function connect() {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      _ws = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          switch (msg.type) {
            case "gas":
              dispatch(updateGas(msg.data));
              break;
            case "dex_opportunities":
              dispatch(setDexOpportunities(msg.data || []));
              break;
            case "nft_opportunities":
              dispatch(setNftOpportunities(msg.data || []));
              break;
            case "multichain_gas":
              dispatch(updateMultiGas(msg.data));
              break;
            case "wallet_balances":
              dispatch(updateWalletBalances(msg.data));
              break;
            case "auto_execute_state":
              dispatch(setAutoExecuteState(msg.data));
              break;
            case "auto_execute":
              dispatch(appendAutoExecuteLog(msg.data));
              break;
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        // Reconnect after 3s
        setTimeout(connect, 3000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [dispatch]);

  // Send active chains to backend when toggle changes
  useEffect(() => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ type: "set_active_chains", data: activeChainIds }));
    }
  }, [activeChainIds]);
}
