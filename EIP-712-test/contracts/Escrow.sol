// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is Ownable {
    IERC20 public immutable token;
    address public settlement;

    mapping(address => uint256) public balance;

    error NotSettlement();

    constructor(address _token) Ownable(msg.sender) {
        token = IERC20(_token);
    }

    function setSettlement(address s) external onlyOwner {
        settlement = s;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "amount=0");
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom fail");
        balance[msg.sender] += amount;
    }

    function debitFrom(address payer, uint256 amount, address to) external {
        if (msg.sender != settlement) revert NotSettlement();
        require(balance[payer] >= amount, "insufficient");
        unchecked { balance[payer] -= amount; }
        require(token.transfer(to, amount), "payout fail");
    }
}
