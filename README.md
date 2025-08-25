# RISE Porto Relay - Simple Mobile Example

A minimal React Native example showing how to integrate Porto relay for gasless transactions on RISE testnet.

## 🎯 Philosophy

This example is intentionally simple - we directly call Porto relay methods without abstractions so developers can see exactly what's happening and easily adapt it for their needs.

## 🚀 Quick Start

```bash
# Install dependencies
npm install --legacy-peer-deps

# Run on iOS
npm run ios

# Run on Android  
npm run android
```

## 📁 Key Files

### `src/lib/simple-porto.ts`
Direct mappings to Porto relay API calls - no abstractions:

```typescript
// Check relay health
await checkHealth()

// Setup delegation for gasless transactions
const prepareResponse = await prepareUpgradeAccount(account)
await upgradeAccount(account, prepareResponse)

// Send a transaction
await sendTransaction(account, to, data, value)

// Or step by step:
const prepared = await prepareCalls(account, calls)
const result = await sendPreparedCalls(account, prepared)
const status = await getCallsStatus(result.id)
```

### `src/screens/ExampleScreen.tsx` 
Complete working example showing:
- Account generation and storage
- Delegation setup
- Sending gasless transactions
- Status checking

## 🔧 Porto Relay Functions

The `simple-porto.ts` module provides these functions that directly map to Porto relay API:

| Function | Purpose | Porto Method |
|----------|---------|--------------|
| `checkHealth()` | Check if relay is operational | `health` |
| `prepareUpgradeAccount()` | Prepare EIP-7702 delegation | `wallet_prepareUpgradeAccount` |
| `upgradeAccount()` | Store delegation in relay | `wallet_upgradeAccount` |
| `prepareCalls()` | Prepare transaction calls | `wallet_prepareCalls` |
| `sendPreparedCalls()` | Send transaction to relay | `wallet_sendPreparedCalls` |
| `getCallsStatus()` | Check transaction status | `wallet_getCallsStatus` |

## 💡 How It Works

1. **Generate Account**: Create an EOA with private key
2. **Setup Delegation**: Configure EIP-7702 delegation to Porto proxy
3. **Send Transaction**: Sign and send through Porto relay
4. **Porto Pays Gas**: User pays 0 gas fees

## 📝 Integration Steps

### 1. Copy the Porto Functions

Copy `src/lib/simple-porto.ts` to your project.

### 2. Install Dependencies

```bash
npm install viem expo-secure-store
```

### 3. Basic Usage

```typescript
import { 
  generateAccount, 
  sendTransaction 
} from './lib/simple-porto';
import { encodeFunctionData } from 'viem';

// Generate account
const account = generateAccount();

// Encode your contract call
const data = encodeFunctionData({
  abi: contractABI,
  functionName: 'myFunction',
  args: [arg1, arg2]
});

// Send gasless transaction
const result = await sendTransaction(
  account,
  contractAddress,
  data,
  '0x0' // value in hex
);

console.log('Bundle ID:', result.bundleId);
```

## 🧪 Testing

Test the Porto relay integration:

```bash
# Simple test
node test-porto.mjs

# Full relay test
node tests/test-relayer-flow.js
```

## ⚙️ Configuration

```typescript
const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931, // RISE testnet
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
};
```

## 📚 Project Structure

```
src/
├── lib/
│   └── simple-porto.ts      # Porto relay functions (150 lines)
├── screens/
│   └── ExampleScreen.tsx    # Complete working example
└── abi/
    └── FrenPetSimple.json   # Example contract ABI
```

## 🔗 Resources

- [RISE Testnet Faucet](https://faucet.riselabs.xyz)
- [RISE Explorer](https://explorer.testnet.riselabs.xyz)
- [Porto Documentation](https://porto.sh)

## 📄 License

MIT - Use freely in your projects!