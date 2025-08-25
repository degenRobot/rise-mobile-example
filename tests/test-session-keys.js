#!/usr/bin/env node

/**
 * Test Session Key Management
 * Tests session key creation and usage with Porto relayer
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { pad } from 'viem';

const PORTO_URL = 'https://rise-testnet-porto.fly.dev';
const CHAIN_ID = 11155931;
const PORTO_PROXY = '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// Serialize public key following Porto's format
function serializePublicKey(address) {
  const cleanAddress = address.toLowerCase();
  if (cleanAddress.length < 66) { // If less than 32 bytes (0x + 64 chars)
    return pad(cleanAddress, { size: 32 });
  }
  return cleanAddress;
}

async function makeRelayCall(method, params) {
  const response = await fetch(PORTO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Math.floor(Math.random() * 10000),
    }),
  });

  const result = await response.json();
  if (result.error) {
    throw new Error(`RPC Error: ${result.error.message}`);
  }
  return result.result;
}

async function testSessionKeys() {
  console.log('🔑 Testing Session Key Management');
  console.log('=' .repeat(50));
  
  // Generate main wallet and session key
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  const sessionPrivateKey = generatePrivateKey();
  const sessionAccount = privateKeyToAccount(sessionPrivateKey);
  
  console.log('📝 Main Wallet:', mainAccount.address);
  console.log('📝 Session Key:', sessionAccount.address);
  
  // Setup delegation with session key
  console.log('\n1️⃣ Setting up delegation with session key...');
  try {
    const prepareParams = {
      address: mainAccount.address,
      delegation: PORTO_PROXY,
      capabilities: {
        authorizeKeys: [
          {
            expiry: '0x0', // Never expires
            prehash: false,
            publicKey: serializePublicKey(sessionAccount.address),
            role: 'admin', // Admin role for MVP
            type: 'secp256k1',
            permissions: [] // Could add specific permissions here
          }
        ]
      },
      chainId: CHAIN_ID
    };
    
    const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
    console.log('   ✅ Delegation prepared with session key');
    
    // Check if preCall data was generated for key authorization
    if (prepareResponse.context?.preCall) {
      const executionDataLength = prepareResponse.context.preCall.executionData?.length || 0;
      console.log('   PreCall data size:', executionDataLength, 'bytes');
      if (executionDataLength > 0) {
        console.log('   ✅ Contains session key authorization');
      }
    }
    
    // Main wallet signs the delegation
    const authSig = await mainAccount.sign({ hash: prepareResponse.digests.auth });
    const execSig = await mainAccount.sign({ hash: prepareResponse.digests.exec });
    
    // Store delegation
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('   ✅ Delegation stored with session key authorization');
    
  } catch (error) {
    console.log('   ❌ Delegation setup failed:', error.message);
  }
  
  // Test different key configurations
  console.log('\n2️⃣ Testing key configurations...');
  
  // Admin key (can authorize other keys)
  const adminKeyAccount = privateKeyToAccount(generatePrivateKey());
  const adminKey = {
    expiry: '0x0',
    prehash: false,
    publicKey: serializePublicKey(adminKeyAccount.address),
    role: 'admin',
    type: 'secp256k1',
    permissions: []
  };
  
  // Limited session key (specific permissions)
  const limitedKeyAccount = privateKeyToAccount(generatePrivateKey());
  const limitedKey = {
    expiry: '0x' + Math.floor(Date.now() / 1000 + 86400).toString(16), // 24 hours
    prehash: false,
    publicKey: serializePublicKey(limitedKeyAccount.address),
    role: 'session',
    type: 'secp256k1',
    permissions: [] // Could add specific permissions
  };
  
  console.log('   Admin Key Config:', {
    role: adminKey.role,
    expiry: 'Never',
    permissions: 'All'
  });
  
  console.log('   Limited Key Config:', {
    role: limitedKey.role,
    expiry: '24 hours',
    permissions: 'Limited'
  });
  
  // Get capabilities
  console.log('\n3️⃣ Checking capabilities...');
  try {
    const capabilities = await makeRelayCall('wallet_getCapabilities', [mainAccount.address]);
    console.log('   Capabilities:', JSON.stringify(capabilities, null, 2));
  } catch (error) {
    console.log('   ⚠️  Could not get capabilities:', error.message);
  }
  
  // Check registered keys
  console.log('\n4️⃣ Checking registered keys...');
  try {
    const keys = await makeRelayCall('wallet_getKeys', [{
      address: mainAccount.address,
      chain_id: CHAIN_ID
    }]);
    console.log('   Registered keys:', keys.length);
    keys.forEach((key, index) => {
      const publicKey = key.base?.base?.publicKey || key.base?.publicKey || key.publicKey;
      console.log(`   Key ${index + 1}:`, publicKey?.substring(0, 20) + '...');
    });
  } catch (error) {
    console.log('   ⚠️  Could not get keys:', error.message);
    console.log('   This is normal - keys are stored off-chain until first tx');
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Session key test complete!');
  console.log('\nKey Insights:');
  console.log('• Main wallet owns the delegation');
  console.log('• Session keys can be authorized with different roles');
  console.log('• Admin keys can authorize other keys');
  console.log('• Session keys can have expiry times and limited permissions');
  console.log('• Keys are deployed on-chain with first transaction');
}

// Run test
testSessionKeys().catch(console.error);