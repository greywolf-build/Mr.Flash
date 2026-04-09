import { createSlice } from "@reduxjs/toolkit";

const chainSlice = createSlice({
  name: "chains",
  initialState: {
    chains: {
      1:     { chainId: 1,     name: "Ethereum", shortName: "ETH",   color: "#627EEA", active: true,  gasPrice: "0", nativeBalance: "0", usdcBalance: "0", hasGas: false, hasUsdc: false },
      8453:  { chainId: 8453,  name: "Base",     shortName: "BASE",  color: "#0052FF", active: false, gasPrice: "0", nativeBalance: "0", usdcBalance: "0", hasGas: false, hasUsdc: false },
      137:   { chainId: 137,   name: "Polygon",  shortName: "MATIC", color: "#8247E5", active: false, gasPrice: "0", nativeBalance: "0", usdcBalance: "0", hasGas: false, hasUsdc: false },
      42161: { chainId: 42161, name: "Arbitrum", shortName: "ARB",   color: "#28A0F0", active: false, gasPrice: "0", nativeBalance: "0", usdcBalance: "0", hasGas: false, hasUsdc: false },
      10:    { chainId: 10,    name: "Optimism", shortName: "OP",    color: "#FF0420", active: false, gasPrice: "0", nativeBalance: "0", usdcBalance: "0", hasGas: false, hasUsdc: false },
    },
    chainOrder: [1, 8453, 137, 42161, 10],
  },
  reducers: {
    toggleChain(state, action) {
      const chainId = action.payload;
      const chain = state.chains[chainId];
      if (chain) {
        chain.active = !chain.active;
      }
    },
    updateMultiGas(state, action) {
      // action.payload = { chainId: gasPrice, ... }
      for (const [chainId, gasPrice] of Object.entries(action.payload)) {
        if (state.chains[chainId]) {
          state.chains[chainId].gasPrice = gasPrice;
        }
      }
    },
    updateWalletBalances(state, action) {
      // action.payload = { chainId: { native, usdc, hasGas, hasUsdc }, ... }
      for (const [chainId, bal] of Object.entries(action.payload)) {
        if (state.chains[chainId]) {
          state.chains[chainId].nativeBalance = bal.native || "0";
          state.chains[chainId].usdcBalance = bal.usdc || "0";
          state.chains[chainId].hasGas = bal.hasGas || false;
          state.chains[chainId].hasUsdc = bal.hasUsdc || false;
        }
      }
    },
  },
});

export const { toggleChain, updateMultiGas, updateWalletBalances } = chainSlice.actions;

// Selectors
export const selectChains = (state) => state.chains.chains;
export const selectChainOrder = (state) => state.chains.chainOrder;
export const selectActiveChainIds = (state) =>
  state.chains.chainOrder.filter((id) => state.chains.chains[id]?.active);

export default chainSlice.reducer;
