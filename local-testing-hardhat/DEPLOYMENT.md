# Deployment Guide

This project includes several deployment scripts for the local Hardhat network.

## Available Scripts

### 1. Basic Deployment
```bash
npm run deploy-local
```
Deploys the contracts to the local Hardhat network with minimal setup.

### 2. Development Deployment  
```bash
npm run deploy-dev
```
Deploys contracts with test setup including:
- 1000 USDC minted to a test user
- 100 USDC automatically staked in escrow
- Ready-to-use test accounts

### 3. Localhost Network Deployment
```bash
# First, start a local node in a separate terminal
npm run node

# Then deploy to localhost
npm run deploy-localhost
```

## Network Configuration

The project is configured for:
- **Hardhat Network**: Ephemeral in-memory network (chainId: 1337)
- **Localhost**: Persistent local node (chainId: 1337, http://127.0.0.1:8545)

## Deployment Artifacts

After deployment, you'll find deployment information in:
- `deployments/hardhat.json` - Basic deployment info
- `deployments/hardhat-dev.json` - Development deployment with test accounts

These files contain:
- Contract addresses
- EIP-712 domain configuration
- Test account information (dev deployment)
- Contract settings

## Contract Addresses

After running the deployment, the contracts will be available at predictable addresses on the local network:

```javascript
// Example addresses (these will be consistent on fresh hardhat network)
MockUSDC: "0x5FbDB2315678afecb367f032d93F642f64180aa3"
Escrow: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0" 
Settlement: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9"
```

## Testing the Deployment

After deployment, you can run tests to verify everything works:

```bash
npm test
```

The tests will use the same network configuration and should pass with the deployed contracts.