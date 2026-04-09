import { createSlice } from "@reduxjs/toolkit";

const gasSlice = createSlice({
  name: "gas",
  initialState: {
    baseFee: "0",
    maxPriority: "1.5",
    gasPrice: "0",
    blockNumber: 0,
  },
  reducers: {
    updateGas(state, action) {
      return { ...state, ...action.payload };
    },
  },
});

export const { updateGas } = gasSlice.actions;
export default gasSlice.reducer;
