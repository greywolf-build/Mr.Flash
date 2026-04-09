import { createSlice } from "@reduxjs/toolkit";

export const MODES = {
  DEX_ARB: "dex_arb",
  NFT_LIQ: "nft_liq",
  NEW_IDEAS: "new_ideas",
};

const strategySlice = createSlice({
  name: "strategy",
  initialState: {
    activeMode: MODES.DEX_ARB,
  },
  reducers: {
    setMode(state, action) {
      state.activeMode = action.payload;
    },
  },
});

export const { setMode } = strategySlice.actions;
export default strategySlice.reducer;
