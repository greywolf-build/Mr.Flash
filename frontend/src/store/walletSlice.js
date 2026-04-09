import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";

export const connectWallet = createAsyncThunk(
  "wallet/connect",
  async (_, { rejectWithValue }) => {
    if (!window.ethereum) {
      return rejectWithValue("MetaMask not installed");
    }

    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });

    const address = accounts[0];
    const balanceHex = await window.ethereum.request({
      method: "eth_getBalance",
      params: [address, "latest"],
    });

    const balanceWei = BigInt(balanceHex);
    const balanceEth = Number(balanceWei) / 1e18;

    return {
      address,
      balance: balanceEth.toFixed(4),
    };
  }
);

const walletSlice = createSlice({
  name: "wallet",
  initialState: {
    address: null,
    balance: "0",
    connected: false,
    loading: false,
    error: null,
  },
  reducers: {
    disconnect(state) {
      state.address = null;
      state.balance = "0";
      state.connected = false;
    },
    updateBalance(state, action) {
      state.balance = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(connectWallet.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(connectWallet.fulfilled, (state, action) => {
        state.loading = false;
        state.connected = true;
        state.address = action.payload.address;
        state.balance = action.payload.balance;
      })
      .addCase(connectWallet.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload || action.error.message;
      });
  },
});

export const { disconnect, updateBalance } = walletSlice.actions;
export default walletSlice.reducer;
