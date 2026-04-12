// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title HEXStablecoin
 * @dev 实现 Module 2 的气费抽象功能。
 * 结合了 EIP-2612，允许用户通过签名授权，由 Relayer 支付 Gas [cite: 36, 58]。
 */
contract HEXStablecoin is ERC20, ERC20Permit, Ownable {
    
    constructor() 
        ERC20("HEX MYR Stablecoin", "MYRC") 
        ERC20Permit("HEX MYR Stablecoin") 
        Ownable(msg.sender)
    {}

    // 只有管理员可以铸币（模拟法币抵押发行）[cite: 14]
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }

    /**
     * @dev 预留 Module 4 的合规接口 [cite: 46, 67]。
     * 在实际 FYP 开发中，这里会接入 ERC-3643 的身份检查。
     */
    function _update(address from, address to, uint256 value) internal override {
        // TODO: 在此处调用 ERC-3643 的身份验证逻辑 [cite: 49, 68]
        super._update(from, to, value);
    }
}