import { createSlice } from "@reduxjs/toolkit";

const MAX_AUTO_LOG = 50;

const opportunitiesSlice = createSlice({
  name: "opportunities",
  initialState: {
    dex: [],
    nft: [],
    sortBy: "netProfitUsdc",
    sortDir: "desc",
    autoExecuteEnabled: false,
    autoExecuteLog: [],
    showCrossChain: false,
  },
  reducers: {
    setDexOpportunities(state, action) {
      // Preserve last non-empty list: if a scan returns zero opportunities
      // (e.g. outlier filter rejected everything), keep the previous rows
      // visible instead of flashing the empty "SCANNING..." state.
      const next = action.payload || [];
      if (next.length > 0 || state.dex.length === 0) {
        state.dex = next;
      }
    },
    setNftOpportunities(state, action) {
      state.nft = action.payload;
    },
    setSortBy(state, action) {
      if (state.sortBy === action.payload) {
        state.sortDir = state.sortDir === "desc" ? "asc" : "desc";
      } else {
        state.sortBy = action.payload;
        state.sortDir = "desc";
      }
    },
    setAutoExecuteState(state, action) {
      state.autoExecuteEnabled = action.payload.enabled;
    },
    appendAutoExecuteLog(state, action) {
      state.autoExecuteLog.unshift({
        ...action.payload,
        ts: Date.now(),
      });
      if (state.autoExecuteLog.length > MAX_AUTO_LOG) {
        state.autoExecuteLog.length = MAX_AUTO_LOG;
      }
    },
    toggleShowCrossChain(state) {
      state.showCrossChain = !state.showCrossChain;
    },
  },
});

export const {
  setDexOpportunities,
  setNftOpportunities,
  setSortBy,
  setAutoExecuteState,
  appendAutoExecuteLog,
  toggleShowCrossChain,
} = opportunitiesSlice.actions;
export default opportunitiesSlice.reducer;
