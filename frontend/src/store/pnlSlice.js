import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const fetchPnl = createAsyncThunk("pnl/fetch", async () => {
  const res = await fetch("/api/execute/pnl");
  const data = await res.json();
  return data.log;
});

const pnlSlice = createSlice({
  name: "pnl",
  initialState: {
    log: [],
    totalProfit: "0",
    totalTrades: 0,
    winRate: "0",
  },
  reducers: {
    addEntry(state, action) {
      state.log.unshift(action.payload);
      recalcStats(state);
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchPnl.fulfilled, (state, action) => {
      state.log = action.payload || [];
      recalcStats(state);
    });
  },
});

function recalcStats(state) {
  state.totalTrades = state.log.length;
  let profit = 0;
  let wins = 0;
  for (const entry of state.log) {
    if (entry.result?.gasCost) {
      const p = parseFloat(entry.result.gasCost) * -1; // rough
      profit += p;
      if (p > 0) wins++;
    }
    if (entry.status === "executed") wins++;
  }
  state.totalProfit = profit.toFixed(6);
  state.winRate = state.totalTrades > 0
    ? ((wins / state.totalTrades) * 100).toFixed(1)
    : "0";
}

export const { addEntry } = pnlSlice.actions;
export default pnlSlice.reducer;
