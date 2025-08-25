#!/usr/bin/env node

/**
 * Basic test of Porto relay functions without contract interaction
 * Tests delegation setup and basic transaction capability
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http } from 'viem';

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

async function test() {
  console.log('🧪 Basic Porto Relay Test');
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
    console.log('   Auth digest:', prepareResponse.digests.auth.substring(0, 20) + '...');
    console.log('   Exec digest:', prepareResponse.digests.exec.substring(0, 20) + '...');
    
    const authSig = await account.sign({ hash: prepareResponse.digests.auth });
    const execSig = await account.sign({ hash: prepareResponse.digests.exec });
    
    await relayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('   ✅ Delegation stored');
    
    // 4. Test simple ETH transfer (to self, 0 value)
    console.log('\n4️⃣ Testing simple transaction...');
    const callParams = {
      from: account.address,
      chainId: PORTO_CONFIG.chainId,
      calls: [{
        to: account.address, // Send to self
        data: '0x',          // No data
        value: '0x0'         // 0 ETH
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
    console.log('   Digest:', prepareResult.digest.substring(0, 20) + '...');
    
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
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      status = await relayCall('wallet_getCallsStatus', [sendResult.id]);
      if (status.status === 200 || status.status === 'success') {
        console.log('   Status:', status.status);
        if (status.receipts?.[0]) {
          const receipt = status.receipts[0];
          console.log('   Success:', receipt.status === '0x1' ? '✅' : '❌');
          console.log('   Tx Hash:', receipt.transactionHash);
        }
        break;
      }
      console.log('   Status:', status.status, '- waiting...');
    }
    
    // 6. Check balance and code
    console.log('\n6️⃣ Verifying gasless execution...');
    const client = createPublicClient({
      chain: { id: PORTO_CONFIG.chainId },
      transport: http('https://testnet.riselabs.xyz'),
    });
    
    const balance = await client.getBalance({ address: account.address });
    console.log('   💰 Balance:', balance.toString(), 'wei');
    console.log('   Gasless:', balance === 0n ? '✅ Yes' : '❌ No');
    
    const code = await client.getCode({ address: account.address });
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 SUMMARY');
    console.log('   Porto relay: ✅ Working');
    console.log('   Delegation setup: ✅ Complete');
    console.log('   Transaction sent: ✅ Success');
    console.log('   Gasless achieved:', balance === 0n ? '✅ Yes' : '❌ No');
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    if (balance === 0n && status?.status === 200) {
      console.log('\n✅ SUCCESS! Porto relay working perfectly!');
      console.log('   All core Porto functions verified.');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
}

test().catch(console.error);