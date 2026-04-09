const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GreywolfFlashLoan", function () {
  let flashLoan, owner, other;

  // Mock addresses provider — for unit tests without mainnet fork
  const MOCK_POOL = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    // Deploy a mock addresses provider that returns a mock pool
    const MockProvider = await ethers.getContractFactory("MockAddressesProvider");
    const mockProvider = await MockProvider.deploy();
    await mockProvider.waitForDeployment();

    const FlashLoan = await ethers.getContractFactory("GreywolfFlashLoan");
    flashLoan = await FlashLoan.deploy(await mockProvider.getAddress());
    await flashLoan.waitForDeployment();
  });

  describe("Access control", function () {
    it("should set deployer as owner", async function () {
      expect(await flashLoan.owner()).to.equal(owner.address);
    });

    it("should reject requestFlashLoan from non-owner", async function () {
      await expect(
        flashLoan.connect(other).requestFlashLoan(ethers.ZeroAddress, 0, "0x")
      ).to.be.revertedWithCustomError(flashLoan, "OwnableUnauthorizedAccount");
    });
  });

  describe("Router management", function () {
    it("should approve and revoke routers", async function () {
      const router = "0x000000000000000000000000000000000000dEaD";
      await flashLoan.setRouter(router, true);
      expect(await flashLoan.approvedRouters(router)).to.be.true;

      await flashLoan.setRouter(router, false);
      expect(await flashLoan.approvedRouters(router)).to.be.false;
    });

    it("should reject setRouter from non-owner", async function () {
      await expect(
        flashLoan.connect(other).setRouter(ethers.ZeroAddress, true)
      ).to.be.revertedWithCustomError(flashLoan, "OwnableUnauthorizedAccount");
    });
  });

  describe("Liquidation target management", function () {
    it("should approve and revoke liq targets", async function () {
      const target = "0x000000000000000000000000000000000000dEaD";
      await flashLoan.setLiqTarget(target, true);
      expect(await flashLoan.approvedLiqTargets(target)).to.be.true;

      await flashLoan.setLiqTarget(target, false);
      expect(await flashLoan.approvedLiqTargets(target)).to.be.false;
    });
  });

  describe("approveToken", function () {
    let mockToken;

    beforeEach(async function () {
      const MockERC20 = await ethers.getContractFactory("MockERC20");
      mockToken = await MockERC20.deploy("Mock", "MCK");
      await mockToken.waitForDeployment();
    });

    it("should set allowance for spender", async function () {
      const spender = "0x000000000000000000000000000000000000dEaD";
      const amount = ethers.MaxUint256;

      await flashLoan.approveToken(await mockToken.getAddress(), spender, amount);

      const allowance = await mockToken.allowance(await flashLoan.getAddress(), spender);
      expect(allowance).to.equal(amount);
    });

    it("should reject approveToken from non-owner", async function () {
      await expect(
        flashLoan.connect(other).approveToken(await mockToken.getAddress(), ethers.ZeroAddress, 1)
      ).to.be.revertedWithCustomError(flashLoan, "OwnableUnauthorizedAccount");
    });
  });
});
