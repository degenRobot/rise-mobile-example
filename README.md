# RISE Mobile - Porto Gasless Transactions Example

A simple React Native (Expo) example demonstrating gasless transactions on RISE testnet using Porto Protocol.

## Overview

This example shows how to integrate Porto's gasless transaction infrastructure into a React Native mobile app. Users can interact with smart contracts without holding ETH for gas fees.

Porto is based on [porto.sh](https://porto.sh/) - a next-generation account stack for Ethereum that leverages EIP-7702 for native account abstraction. The smart contracts are from [github.com/ithacaxyz/account](https://github.com/ithacaxyz/account).

## Features

- **Gasless Transactions** - Users don't need ETH to interact with contracts
- **Mobile Native** - Built with React Native and Expo
- **Account Delegation** - Uses EIP-7702 for native account abstraction
- **FrenPet Demo** - Interactive pet game to demonstrate functionality

## Quick Start

### Prerequisites
- Node.js 18+
- Expo Go app on your phone
- Git

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/rise-mobile-example.git
cd rise-mobile-example

# Install dependencies
cd app && npm install

# Start the app
npx expo start -c
```

Scan the QR code with Expo Go to run on your phone.

## Project Structure

```
rise-mobile-example/
├── README.md                      # This file
├── app/                           # React Native application
│   ├── App.tsx                    # Main app entry point
│   ├── package.json               # App dependencies
│   ├── src/
│   │   ├── lib/
│   │   │   └── simple-porto.ts    # Porto relay integration
│   │   ├── screens/
│   │   │   └── FrenPetScreen.tsx  # Demo game screen
│   │   └── abi/
│   │       └── FrenPetSimple.json # Contract ABI
│   └── [config files]             # Expo, Metro, TypeScript configs
└── tests/                         # Integration tests
    ├── test-complete-flow.mjs     # Complete gasless flow test
    └── test-frenpet-flow.js       # FrenPet integration test
```

## How It Works

### 1. Direct Relay Communication

The app communicates directly with Porto's relay server instead of using the SDK:

```typescript
// app/src/lib/simple-porto.ts
export async function relayCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(PORTO_CONFIG.relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    }),
  });
  // ...
}
```

### 2. Account Delegation Setup

Before sending gasless transactions, the account must delegate to Porto's proxy:

```typescript
// Setup delegation (one-time)
const prepareResponse = await prepareUpgradeAccount(account);
await upgradeAccount(account, prepareResponse);
```

### 3. Gasless Transaction Execution

Once delegation is set up, transactions are completely gasless:

```typescript
// Encode contract call
const data = encodeFunctionData({
  abi: FRENPET_ABI,
  functionName: 'createPet',
  args: [petName]
});

// Send gasless transaction
const result = await sendTransaction(
  account,
  FRENPET_ADDRESS,
  data
);
```

## Key Configuration

```typescript
// app/src/lib/simple-porto.ts
export const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  proxy: '0x894C14A66508D221A219Dd0064b4A6718d0AAA52',
  orchestrator: '0xa4D0537eEAB875C9a880580f38862C1f946bFc1c',
  ethAddress: '0x0000000000000000000000000000000000000000',
};
```

## Testing

Run the test suite to verify the integration:

```bash
# Run tests from app directory (where dependencies are)
cd app

# Test complete gasless flow
node ../tests/test-complete-flow.mjs

# Test FrenPet contract interaction
node ../tests/test-frenpet-flow.js
```

## Important Notes

1. **Address Format**: Contract addresses must be checksummed (uppercase) for relay whitelisting
2. **No AbortController**: React Native doesn't support AbortController the same way as Node.js
3. **Delegation Deployment**: The delegation is deployed on-chain with the first transaction
4. **Always Include feeToken**: Every transaction must include the feeToken capability for gasless sponsorship

## Porto RPC Methods

The example uses these Porto relay methods:

- `health` - Check relay status
- `wallet_prepareUpgradeAccount` - Prepare account delegation
- `wallet_upgradeAccount` - Store delegation in relay
- `wallet_prepareCalls` - Prepare transaction for signing
- `wallet_sendPreparedCalls` - Execute signed transaction
- `wallet_getCallsStatus` - Check transaction status

## Resources

- **Porto Protocol**: [porto.sh](https://porto.sh/)
- **Porto GitHub**: [github.com/ithacaxyz/porto](https://github.com/ithacaxyz/porto)
- **Account Contracts**: [github.com/ithacaxyz/account](https://github.com/ithacaxyz/account)
- **RISE Network**: [riseschain.com](https://riseschain.com)

## Troubleshooting

### Network Request Failed
- Ensure you have `react-native-url-polyfill` installed
- Check that polyfills are loaded before other imports

### Pet Creation Fails
- Verify the contract address is uppercase: `0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25`
- Ensure delegation is set up before sending transactions

### Transaction Succeeds but No State Change
- Check you're using the correct proxy address
- Verify the orchestrator address matches the deployment
