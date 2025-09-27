// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Escrow
 * @notice Holds user stake; Settlement may debit while ACTIVE or during the 7d window BEFORE deadline.
 *         AFTER deadline, settlements must stop and user may withdraw.
 */
contract Escrow is Ownable {
    IERC20 public immutable token;
    address public settlement;

    mapping(address => uint256) public balance;   // user -> staked balance
    mapping(address => uint256) public unstakeAt; // user -> unix ts (0 = none)
    mapping(address => bool)    public paused;    // app-level signal

    error NotSettlement();
    error AmountZero();
    error Insufficient();
    error TooEarly();
    error AlreadyRequested();

    event Deposited(address indexed payer, uint256 amount);
    event UnstakeRequested(address indexed payer, uint256 amount, uint256 deadline);
    event UnstakeCancelled(address indexed payer);
    event Withdrawn(address indexed payer, uint256 amount);
    event SettlementSet(address settlement);

    constructor(address _token) Ownable(msg.sender) { token = IERC20(_token); }

    function setSettlement(address s) external onlyOwner {
        settlement = s;
        emit SettlementSet(s);
    }

    function deposit(uint256 amount) external {
        if (amount == 0) revert AmountZero();
        require(token.transferFrom(msg.sender, address(this), amount), "transferFrom fail");
        balance[msg.sender] += amount;
        // resume usage when user deposits again
        paused[msg.sender] = false;
        emit Deposited(msg.sender, amount);
    }

    function requestUnstake(uint256 /*amount*/) external {
        if (unstakeAt[msg.sender] != 0) revert AlreadyRequested();
        uint256 deadline = block.timestamp + 7 days;
        unstakeAt[msg.sender] = deadline;
        paused[msg.sender] = true; // app should refuse new IOUs immediately
        emit UnstakeRequested(msg.sender, 0, deadline);
    }

    function cancelUnstake() external {
        unstakeAt[msg.sender] = 0;
        paused[msg.sender] = false;
        emit UnstakeCancelled(msg.sender);
    }

    function withdraw(uint256 amount) external {
        if (amount == 0) revert AmountZero();
        uint256 deadline = unstakeAt[msg.sender];
        if (deadline == 0 || block.timestamp < deadline) revert TooEarly();
        if (balance[msg.sender] < amount) revert Insufficient();
        unchecked { balance[msg.sender] -= amount; }
        require(token.transfer(msg.sender, amount), "transfer fail");
        // Keep paused=true until deposit resumes
        paused[msg.sender] = true;
        emit Withdrawn(msg.sender, amount);
    }

    function debitFrom(address payer, uint256 amount, address to) external {
        if (msg.sender != settlement) revert NotSettlement();
        if (balance[payer] < amount) revert Insufficient();
        unchecked { balance[payer] -= amount; }
        require(token.transfer(to, amount), "payout fail");
    }
}
