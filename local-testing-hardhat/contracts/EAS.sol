// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title EAS (Ethereum Agentic Servers) Registry
 * @notice Minimal on-chain directory of MCP/Agent providers & services.
 *         Stores network-wide contract addresses and per-provider endpoints.
 *         Events are the primary sync surface for off-chain SDKs/indexers.
 */
contract EAS {
    // --- Network-level pointers (singletons per chain) ---
    address public settlement; // Settlement contract that verifies EIP-712 Debit and pays providers
    address public escrow; // Escrow where users stake
    address public usdc; // Primary token for pricing (6dp)

    address public owner;

    // --- Provider → endpoint URIs ---
    // Keep as string to support ws://, wss://, https://, etc.
    mapping(address => string) public providerEndpoint; // preferred endpoint
    // Optional: multiple endpoints (e.g., ws + https)
    mapping(address => string) public providerAltEndpoint;

    // --- Service metadata ---
    enum Unit {
        CALL,
        CHARS,
        PAGES
    }

    struct Service {
        address provider;
        bytes32 serviceId; // chosen by provider
        string title;
        string description;
        Unit unit; // CALL/CHARS/PAGES (pricing basis)
        uint256 pricePerUnit6; // USDC 6dp
        string requestSchemaURI; // ipfs://... or https://...
        string responseSchemaURI;
        bool allowDirect; // provider accepts direct client connections
        bool active;
    }

    // serviceId → Service
    mapping(bytes32 => Service) public services;

    // provider → serviceId[] index (optional convenience)
    mapping(address => bytes32[]) public servicesOf;

    // 1-based index mapping (0 = not present). Stable; we do not remove entries.
    mapping(bytes32 => uint256) public serviceIndex;
    bytes32[] private _allServiceIds;

    // --- Errors ---
    error NotOwner();
    error NotProvider();
    error ServiceExists();
    error ServiceUnknown();
    error ZeroAddress();
    error BadInput();

    // --- Events ---
    event NetworkUpdated(address settlement, address escrow, address usdc);
    event ProviderRegistered(
        address indexed provider,
        string endpoint,
        string altEndpoint
    );
    event ProviderEndpointUpdated(
        address indexed provider,
        string endpoint,
        string altEndpoint
    );
    event ServiceRegistered(
        address indexed provider,
        bytes32 indexed serviceId,
        Service meta
    );
    event ServiceUpdated(
        address indexed provider,
        bytes32 indexed serviceId,
        Service meta
    );
    event ServiceStatus(
        address indexed provider,
        bytes32 indexed serviceId,
        bool active
    );

    constructor(address _settlement, address _escrow, address _usdc) {
        if (
            _settlement == address(0) ||
            _escrow == address(0) ||
            _usdc == address(0)
        ) revert ZeroAddress();
        owner = msg.sender;
        settlement = _settlement;
        escrow = _escrow;
        usdc = _usdc;
        emit NetworkUpdated(_settlement, _escrow, _usdc);
    }

    // --- Admin: update network pointers (governance or multisig controls this) ---
    function setNetwork(
        address _settlement,
        address _escrow,
        address _usdc
    ) external {
        if (msg.sender != owner) revert NotOwner();
        if (
            _settlement == address(0) ||
            _escrow == address(0) ||
            _usdc == address(0)
        ) revert ZeroAddress();
        settlement = _settlement;
        escrow = _escrow;
        usdc = _usdc;
        emit NetworkUpdated(_settlement, _escrow, _usdc);
    }

    function transferOwnership(address newOwner) external {
        if (msg.sender != owner) revert NotOwner();
        if (newOwner == address(0)) revert ZeroAddress();
        owner = newOwner;
    }

    // --- Provider lifecycle ---
    function registerProvider(
        string calldata endpoint,
        string calldata altEndpoint
    ) external {
        // idempotent; a provider may call again to overwrite their URIs
        providerEndpoint[msg.sender] = endpoint;
        providerAltEndpoint[msg.sender] = altEndpoint;
        emit ProviderRegistered(msg.sender, endpoint, altEndpoint);
    }

    function setProviderEndpoints(
        string calldata endpoint,
        string calldata altEndpoint
    ) external {
        providerEndpoint[msg.sender] = endpoint;
        providerAltEndpoint[msg.sender] = altEndpoint;
        emit ProviderEndpointUpdated(msg.sender, endpoint, altEndpoint);
    }

    // --- Service lifecycle ---
    function registerService(
        bytes32 serviceId,
        string calldata title,
        string calldata description,
        Unit unit,
        uint256 pricePerUnit6,
        string calldata requestSchemaURI,
        string calldata responseSchemaURI,
        bool allowDirect
    ) external {
        if (services[serviceId].provider != address(0)) revert ServiceExists();
        if (bytes(title).length == 0) revert BadInput();

        services[serviceId] = Service({
            provider: msg.sender,
            serviceId: serviceId,
            title: title,
            description: description,
            unit: unit,
            pricePerUnit6: pricePerUnit6,
            requestSchemaURI: requestSchemaURI,
            responseSchemaURI: responseSchemaURI,
            allowDirect: allowDirect,
            active: true
        });
        servicesOf[msg.sender].push(serviceId);
        emit ServiceRegistered(msg.sender, serviceId, services[serviceId]);
    }

    function updateService(
        bytes32 serviceId,
        string calldata title,
        string calldata description,
        Unit unit,
        uint256 pricePerUnit6,
        string calldata requestSchemaURI,
        string calldata responseSchemaURI,
        bool allowDirect
    ) external {
        Service storage s = services[serviceId];
        if (s.provider == address(0)) revert ServiceUnknown();
        if (s.provider != msg.sender) revert NotProvider();
        s.title = title;
        s.description = description;
        s.unit = unit;
        s.pricePerUnit6 = pricePerUnit6;
        s.requestSchemaURI = requestSchemaURI;
        s.responseSchemaURI = responseSchemaURI;
        s.allowDirect = allowDirect;
        emit ServiceUpdated(msg.sender, serviceId, s);
    }

    function setServiceActive(bytes32 serviceId, bool active) external {
        Service storage s = services[serviceId];
        if (s.provider == address(0)) revert ServiceUnknown();
        if (s.provider != msg.sender) revert NotProvider();
        s.active = active;
        emit ServiceStatus(msg.sender, serviceId, active);
    }

    // --- Views ---
    function getProviderEndpoints(
        address providerAddr
    ) external view returns (string memory, string memory) {
        return (
            providerEndpoint[providerAddr],
            providerAltEndpoint[providerAddr]
        );
    }

    function getService(
        bytes32 serviceId
    ) external view returns (Service memory) {
        return services[serviceId];
    }

    function getServicesOf(
        address providerAddr
    ) external view returns (bytes32[] memory) {
        return servicesOf[providerAddr];
    }

    function totalServices() external view returns (uint256) {
        return _allServiceIds.length;
    }

    function providerServiceCount(
        address providerAddr
    ) external view returns (uint256) {
        return servicesOf[providerAddr].length;
    }
}
