#!/usr/bin/env node

/**
 * Simple test of Porto relay functions
 * Run with: node test-porto.mjs
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http } from 'viem';

// Porto configuration
const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
  ethAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

// Make relay call
async function relayCall(method, params) {
  const response = await fetch(PORTO_CONFIG.relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(`RPC Error: ${data.error.message}`);
  return data.result;
}

// Serialize public key
function serializePublicKey(address) {
  const cleanAddress = address.toLowerCase();
  if (cleanAddress.length < 66) {
    const withoutPrefix = cleanAddress.slice(2);
    const padded = withoutPrefix.padStart(64, '0');
    return '0x' + padded;
  }
  return cleanAddress;
}

// Test FrenPet contract
const FRENPET_ADDRESS = '0xc73341541Ad7910c31e54EFf5f1FfD893C78Cf90';
const FRENPET_ABI = [
  {
    "inputs": [{"name": "name", "type": "string"}],
    "name": "createPet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

async function test() {
  console.log('🧪 Testing Porto Relay Functions');
  console.log('=' .repeat(50));
  
  try {
    // 1. Check health
    console.log('\n1️⃣ Checking health...');
    const health = await relayCall('health', []);
    console.log('   ✅ Health:', health);
    
    // 2. Generate account
    console.log('\n2️⃣ Generating account...');
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    console.log('   📝 Address:', account.address);
    
    // 3. Setup delegation
    console.log('\n3️⃣ Setting up delegation...');
    const prepareParams = {
      address: account.address,
      delegation: PORTO_CONFIG.proxy,
      capabilities: { authorizeKeys: [] },
      chainId: PORTO_CONFIG.chainId
    };
    
    const prepareResponse = await relayCall('wallet_prepareUpgradeAccount', [prepareParams]);
    console.log('   ✅ Prepared');
    
    const authSig = await account.sign({ hash: prepareResponse.digests.auth });
    const execSig = await account.sign({ hash: prepareResponse.digests.exec });
    
    await relayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('   ✅ Delegation stored');
    
    // 4. Send transaction
    console.log('\n4️⃣ Sending transaction...');
    const petName = `TestPet_${Date.now()}`;
    const data = encodeFunctionData({
      abi: FRENPET_ABI,
      functionName: 'createPet',
      args: [petName]
    });
    
    const callParams = {
      from: account.address,
      chainId: PORTO_CONFIG.chainId,
      calls: [{
        to: FRENPET_ADDRESS,
        data,
        value: '0x0'
      }],
      capabilities: {
        meta: { feeToken: PORTO_CONFIG.ethAddress }
      },
      key: {
        prehash: false,
        publicKey: serializePublicKey(account.address),
        type: 'secp256k1'
      }
    };
    
    const prepareResult = await relayCall('wallet_prepareCalls', [callParams]);
    console.log('   ✅ Calls prepared');
    
    const signature = await account.sign({ hash: prepareResult.digest });
    const sendResult = await relayCall('wallet_sendPreparedCalls', [{
      context: prepareResult.context,
      signature
    }]);
    console.log('   ✅ Transaction sent!');
    console.log('   Bundle ID:', sendResult.id);
    
    // 5. Wait for confirmation
    console.log('\n5️⃣ Waiting for confirmation...');
    let status;
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 2000));
      status = await relayCall('wallet_getCallsStatus', [sendResult.id]);
      if (status.status === 200) break;
    }
    console.log('   Status:', status?.status);
    
    // 6. Check balance
    console.log('\n6️⃣ Checking balance...');
    const client = createPublicClient({
      chain: { id: PORTO_CONFIG.chainId },
      transport: http('https://testnet.riselabs.xyz'),
    });
    
    const balance = await client.getBalance({ address: account.address });
    console.log('   💰 Balance:', balance.toString(), 'wei');
    console.log('   Gasless:', balance === 0n ? '✅ Yes' : '❌ No');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Done!');
}

test().catch(console.error);