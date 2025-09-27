// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

interface IEscrow {
    function debitFrom(address payer, uint256 amount, address to) external;
    function balance(address user) external view returns (uint256);
}

contract Settlement is EIP712 {
    using ECDSA for bytes32;

    struct Debit {
        address payer;
        address provider;
        bytes32 serviceId;
        uint256 amount;   // 6dp (USDC)
        address token;    // USDC address
        uint256 nonce;    // per-payer monotonic
        uint64  deadline; // unix seconds
    }

    bytes32 public constant DEBIT_TYPEHASH =
        keccak256("Debit(address payer,address provider,bytes32 serviceId,uint256 amount,address token,uint256 nonce,uint64 deadline)");

    IEscrow public immutable escrow;
    address public owner;

    mapping(address => uint256) public nextNonce;      // per-payer
    mapping(address => bool)    public tokenAllowed;   // allowlist
    uint256 public perCallLimit = 50_000000;           // 50 USDC (6dp)

    modifier onlyOwner() { require(msg.sender == owner, "owner"); _; }

    event DebitSettled(address indexed payer, address indexed provider, bytes32 indexed serviceId, uint256 amount, uint256 nonce);

    constructor(address _escrow) EIP712("MCPSettlement","1") {
        escrow = IEscrow(_escrow);
        owner = msg.sender;
    }

    function setPerCallLimit(uint256 v) external onlyOwner { perCallLimit = v; }
    function setTokenAllowed(address token, bool a) external onlyOwner { tokenAllowed[token] = a; }

    function _hash(Debit calldata d) internal view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            DEBIT_TYPEHASH,
            d.payer, d.provider, d.serviceId, d.amount, d.token, d.nonce, d.deadline
        )));
    }

    function settleBatch(Debit[] calldata ds, bytes[] calldata sigs) external {
        require(ds.length == sigs.length, "len");
        for (uint256 i; i < ds.length; ++i) {
            Debit calldata d = ds[i];
            require(tokenAllowed[d.token], "token");
            require(d.amount <= perCallLimit, "too-big");
            require(block.timestamp <= d.deadline, "expired");
            require(d.nonce == nextNonce[d.payer]++, "bad nonce");

            address signer = ECDSA.recover(_hash(d), sigs[i]);
            require(signer == d.payer, "bad sig");

            escrow.debitFrom(d.payer, d.amount, d.provider);
            emit DebitSettled(d.payer, d.provider, d.serviceId, d.amount, d.nonce);
        }
    }
}
