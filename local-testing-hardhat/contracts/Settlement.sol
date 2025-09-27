// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IEscrow {
    function debitFrom(address payer, uint256 amount, address to) external;
    function unstakeAt(address user) external view returns (uint256);
    function balance(address user) external view returns (uint256);
}

contract Settlement is EIP712 {
    using ECDSA for bytes32;

    struct Debit {
        address payer;
        address provider;
        bytes32 serviceId;
        uint256 amount;     // 6dp token units
        address token;      // allowed token (USDC)
        uint256 nonce;      // per (payer,provider)
        uint64  epoch;      // session id
        uint64  deadline;   // signature expiry
    }

    bytes32 public constant DEBIT_TYPEHASH =
        keccak256("Debit(address payer,address provider,bytes32 serviceId,uint256 amount,address token,uint256 nonce,uint64 epoch,uint64 deadline)");

    IEscrow public immutable escrow;
    address public owner;

    // Nonces scoped by (payer => provider => nonce)
    mapping(address => mapping(address => uint256)) public nextNonce;

    // Payer epochs
    mapping(address => uint64) public epoch;

    // Token allow-list & per-call limit
    mapping(address => bool) public tokenAllowed;
    uint256 public perCallLimit = 50_000000; // 50 USDC (6dp)

    event DebitSettled(address indexed payer, address indexed provider, bytes32 indexed serviceId, uint256 amount, uint256 nonce);
    event TokenAllowed(address token, bool allowed);
    event PerCallLimit(uint256 limit);
    event EpochBumped(address indexed payer, uint64 newEpoch);

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }

    constructor(address _escrow) EIP712("MCPSettlement","1") {
        escrow = IEscrow(_escrow);
        owner = msg.sender;
    }

    // --- Admin ----
    function setPerCallLimit(uint256 v) external onlyOwner { perCallLimit = v; emit PerCallLimit(v); }
    function setTokenAllowed(address token, bool a) external onlyOwner { tokenAllowed[token] = a; emit TokenAllowed(token, a); }
    function bumpEpoch(address payer) external onlyOwner {
        epoch[payer] += 1;
        emit EpochBumped(payer, epoch[payer]);
    }

    // --- Internal ----
    function _hash(Debit calldata d) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            DEBIT_TYPEHASH, d.payer, d.provider, d.serviceId, d.amount, d.token, d.nonce, d.epoch, d.deadline
        )));
    }

    /**
     * @notice Settles a batch of IOUs. Allowed while ACTIVE or during 7d window BEFORE deadline.
     *         If user has requested unstake and now > escrow.unstakeAt(user), settlement reverts.
     */
    function settleBatch(Debit[] calldata ds, bytes[] calldata sigs) external {
        require(ds.length == sigs.length, "len");
        for (uint256 i; i < ds.length; ++i) {
            Debit calldata d = ds[i];

            require(tokenAllowed[d.token], "token");
            require(d.amount <= perCallLimit, "too-big");
            require(block.timestamp <= d.deadline, "expired");

            // If user has an unstake deadline set, only allow settlements BEFORE it
            uint256 uDeadline = escrow.unstakeAt(d.payer);
            require(uDeadline == 0 || block.timestamp <= uDeadline, "past-unstake-deadline");

            // Epoch must match current
            require(d.epoch == epoch[d.payer], "epoch mismatch");

            // Nonce must match per (payer, provider)
            uint256 expected = nextNonce[d.payer][d.provider];
            require(d.nonce == expected, "bad nonce");
            nextNonce[d.payer][d.provider] = expected + 1;

            // Signature must be from payer
            address signer = ECDSA.recover(_hash(d), sigs[i]);
            require(signer == d.payer, "bad sig");

            // Debit escrow → pay provider
            escrow.debitFrom(d.payer, d.amount, d.provider);
            emit DebitSettled(d.payer, d.provider, d.serviceId, d.amount, d.nonce);
        }
    }
}
