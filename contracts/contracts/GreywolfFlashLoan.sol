// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title GreywolfFlashLoan
/// @notice Aave v3 flash loan receiver for DEX arbitrage and NFT liquidation strategies
/// @dev Uses inline assembly for gas-critical paths
contract GreywolfFlashLoan is FlashLoanSimpleReceiverBase, Ownable {
    using SafeERC20 for IERC20;

    // ──────────────────────────────────────────────
    //  Constants
    // ──────────────────────────────────────────────

    uint8 internal constant OP_DEX_ARB = 1;
    uint8 internal constant OP_NFT_LIQ = 2;

    // ──────────────────────────────────────────────
    //  State
    // ──────────────────────────────────────────────

    /// @notice Whitelisted DEX routers
    mapping(address => bool) public approvedRouters;

    /// @notice Whitelisted NFT liquidation targets
    mapping(address => bool) public approvedLiqTargets;

    // ──────────────────────────────────────────────
    //  Events
    // ──────────────────────────────────────────────

    event ArbExecuted(address indexed token, uint256 profit);
    event LiquidationExecuted(address indexed target, uint256 profit);
    event RouterUpdated(address indexed router, bool approved);
    event LiqTargetUpdated(address indexed target, bool approved);

    // ──────────────────────────────────────────────
    //  Errors
    // ──────────────────────────────────────────────

    error UnauthorizedCaller();
    error InvalidOperation();
    error RouterNotApproved();
    error LiqTargetNotApproved();
    error NoProfitRealized();

    // ──────────────────────────────────────────────
    //  Constructor
    // ──────────────────────────────────────────────

    constructor(
        address _addressesProvider
    )
        FlashLoanSimpleReceiverBase(IPoolAddressesProvider(_addressesProvider))
        Ownable(msg.sender)
    {}

    // ──────────────────────────────────────────────
    //  Flash loan entry point
    // ──────────────────────────────────────────────

    /// @notice Initiate a flash loan
    /// @param asset Token to borrow
    /// @param amount Amount to borrow
    /// @param params Encoded operation params (opType, swap data)
    function requestFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner {
        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    // ──────────────────────────────────────────────
    //  Aave callback
    // ──────────────────────────────────────────────

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // Only the Aave pool can call this
        if (msg.sender != address(POOL)) revert UnauthorizedCaller();
        if (initiator != address(this)) revert UnauthorizedCaller();

        uint8 opType;
        assembly {
            opType := byte(0, calldataload(params.offset))
        }

        if (opType == OP_DEX_ARB) {
            _executeDexArb(asset, amount, params[1:]);
        } else if (opType == OP_NFT_LIQ) {
            _executeNftLiq(asset, amount, params[1:]);
        } else {
            revert InvalidOperation();
        }

        // Repay flash loan: amount + premium
        uint256 repayAmount;
        assembly {
            repayAmount := add(amount, premium)
        }

        IERC20(asset).safeIncreaseAllowance(address(POOL), repayAmount);

        // Verify profit
        uint256 balance = IERC20(asset).balanceOf(address(this));
        if (balance < repayAmount) revert NoProfitRealized();

        return true;
    }

    // ──────────────────────────────────────────────
    //  Strategy: DEX Arbitrage
    // ──────────────────────────────────────────────

    /// @dev Execute multi-hop swaps across DEXes
    function _executeDexArb(
        address asset,
        uint256 amount,
        bytes calldata data
    ) internal {
        uint256 preBalance = IERC20(asset).balanceOf(address(this));

        (address[] memory routers, bytes[] memory swapDatas) = abi.decode(
            data,
            (address[], bytes[])
        );

        uint256 len = routers.length;
        for (uint256 i; i < len; ) {
            address router = routers[i];
            if (!approvedRouters[router]) revert RouterNotApproved();

            uint256 currentBal = IERC20(asset).balanceOf(address(this));
            IERC20(asset).safeIncreaseAllowance(router, currentBal);

            (bool success, ) = router.call(swapDatas[i]);
            require(success, "Swap failed");

            _resetAllowance(asset, router);

            unchecked { ++i; }
        }

        uint256 postBalance = IERC20(asset).balanceOf(address(this));
        uint256 profit;
        assembly {
            profit := sub(postBalance, preBalance)
        }

        emit ArbExecuted(asset, profit);
    }

    // ──────────────────────────────────────────────
    //  Strategy: NFT Liquidation
    // ──────────────────────────────────────────────

    /// @dev Execute NFT liquidation and sell the NFT
    function _executeNftLiq(
        address asset,
        uint256 amount,
        bytes calldata data
    ) internal {
        (
            address liqTarget,
            bytes memory liqCalldata,
            address sellTarget,
            bytes memory sellCalldata
        ) = abi.decode(data, (address, bytes, address, bytes));

        if (!approvedLiqTargets[liqTarget]) revert LiqTargetNotApproved();

        uint256 preBalance = IERC20(asset).balanceOf(address(this));

        IERC20(asset).safeIncreaseAllowance(liqTarget, amount);
        (bool liqSuccess, ) = liqTarget.call(liqCalldata);
        require(liqSuccess, "Liquidation failed");
        _resetAllowance(asset, liqTarget);

        (bool sellSuccess, ) = sellTarget.call(sellCalldata);
        require(sellSuccess, "NFT sale failed");

        uint256 postBalance = IERC20(asset).balanceOf(address(this));
        uint256 profit;
        assembly {
            profit := sub(postBalance, preBalance)
        }

        emit LiquidationExecuted(liqTarget, profit);
    }

    // ──────────────────────────────────────────────
    //  Admin
    // ──────────────────────────────────────────────

    function setRouter(address router, bool approved) external onlyOwner {
        approvedRouters[router] = approved;
        emit RouterUpdated(router, approved);
    }

    function setLiqTarget(address target, bool approved) external onlyOwner {
        approvedLiqTargets[target] = approved;
        emit LiqTargetUpdated(target, approved);
    }

    function rescue(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    function rescueETH() external onlyOwner {
        (bool sent, ) = owner().call{value: address(this).balance}("");
        require(sent, "ETH transfer failed");
    }

    function approveToken(address token, address spender, uint256 amount) external onlyOwner {
        IERC20(token).forceApprove(spender, amount);
    }

    receive() external payable {}

    // ──────────────────────────────────────────────
    //  Internal helpers
    // ──────────────────────────────────────────────

    /// @dev Reset token allowance to zero — gas optimized
    function _resetAllowance(address token, address spender) internal {
        assembly {
            let ptr := mload(0x40)
            mstore(ptr, 0x095ea7b300000000000000000000000000000000000000000000000000000000)
            mstore(add(ptr, 4), spender)
            mstore(add(ptr, 36), 0)
            let success := call(gas(), token, 0, ptr, 68, 0, 32)
        }
    }
}
