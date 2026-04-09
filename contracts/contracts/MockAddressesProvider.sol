// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @dev Minimal ERC20 mock for unit tests
contract MockERC20 is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}

/// @dev Minimal mock pool for unit tests
contract MockPool {}

/// @dev Mock that implements only getPool() for constructor
contract MockAddressesProvider {
    address public pool;

    constructor() {
        MockPool p = new MockPool();
        pool = address(p);
    }

    function getPool() external view returns (address) {
        return pool;
    }

    // Stubs required by IPoolAddressesProvider that FlashLoanSimpleReceiverBase may call
    function getMarketId() external pure returns (string memory) { return "mock"; }
    function setMarketId(string calldata) external {}
    function getAddress(bytes32) external view returns (address) { return pool; }
    function setAddressAsProxy(bytes32, address) external {}
    function setAddress(bytes32, address) external {}
    function getACLManager() external view returns (address) { return pool; }
    function setACLManager(address) external {}
    function getACLAdmin() external view returns (address) { return pool; }
    function setACLAdmin(address) external {}
    function getPriceOracle() external view returns (address) { return pool; }
    function setPriceOracle(address) external {}
    function getPriceOracleSentinel() external view returns (address) { return pool; }
    function setPriceOracleSentinel(address) external {}
    function getPoolConfigurator() external view returns (address) { return pool; }
    function setPoolConfiguratorImpl(address) external {}
    function getPoolDataProvider() external view returns (address) { return pool; }
    function setPoolDataProvider(address) external {}
    function setPoolImpl(address) external {}
}
