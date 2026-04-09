import { configureStore } from "@reduxjs/toolkit";
import walletReducer from "./walletSlice.js";
import strategyReducer from "./strategySlice.js";
import opportunitiesReducer from "./opportunitiesSlice.js";
import gasReducer from "./gasSlice.js";
import pnlReducer from "./pnlSlice.js";
import chainsReducer from "./chainSlice.js";

export const store = configureStore({
  reducer: {
    wallet: walletReducer,
    strategy: strategyReducer,
    opportunities: opportunitiesReducer,
    gas: gasReducer,
    pnl: pnlReducer,
    chains: chainsReducer,
  },
});
