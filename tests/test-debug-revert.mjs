#!/usr/bin/env node

/**
 * Debug transaction reversion issue
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http } from 'viem';

const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
  ethAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
};

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
  if (data.error) {
    console.log('Full error:', JSON.stringify(data.error, null, 2));
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
}

function serializePublicKey(address) {
  const cleanAddress = address.toLowerCase();
  if (cleanAddress.length < 66) {
    const withoutPrefix = cleanAddress.slice(2);
    const padded = withoutPrefix.padStart(64, '0');
    return '0x' + padded;
  }
  return cleanAddress;
}

async function debug() {
  console.log('🔍 Debugging Transaction Reversion');
  console.log('=' .repeat(50));
  
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log('Account:', account.address);
  
  // Setup delegation
  console.log('\n1️⃣ Setting up delegation...');
  const prepareParams = {
    address: account.address,
    delegation: PORTO_CONFIG.proxy,
    capabilities: { authorizeKeys: [] },
    chainId: PORTO_CONFIG.chainId
  };
  
  const prepareResponse = await relayCall('wallet_prepareUpgradeAccount', [prepareParams]);
  const authSig = await account.sign({ hash: prepareResponse.digests.auth });
  const execSig = await account.sign({ hash: prepareResponse.digests.exec });
  
  await relayCall('wallet_upgradeAccount', [{
    context: prepareResponse.context,
    signatures: { auth: authSig, exec: execSig }
  }]);
  console.log('✅ Delegation stored');
  
  // Try the simplest possible transaction
  console.log('\n2️⃣ Preparing minimal transaction...');
  const callParams = {
    from: account.address,
    chainId: PORTO_CONFIG.chainId,
    calls: [{
      to: account.address,
      data: '0x',
      value: '0x0'
    }],
    capabilities: {
      meta: { 
        feeToken: PORTO_CONFIG.ethAddress
      }
    },
    key: {
      prehash: false,
      publicKey: serializePublicKey(account.address),
      type: 'secp256k1'
    }
  };
  
  console.log('Call params:', JSON.stringify(callParams, null, 2));
  
  try {
    const prepareResult = await relayCall('wallet_prepareCalls', [callParams]);
    console.log('\n✅ Calls prepared');
    console.log('Prepare result:', JSON.stringify(prepareResult, null, 2).substring(0, 500) + '...');
    
    // Check if preCalls are included (delegation deployment)
    if (prepareResult.context?.quote?.intent?.encodedPreCalls) {
      console.log('\n📦 Pre-calls detected (delegation deployment):');
      console.log('   Pre-calls length:', prepareResult.context.quote.intent.encodedPreCalls.length);
    }
    
    const signature = await account.sign({ hash: prepareResult.digest });
    console.log('\n3️⃣ Sending transaction...');
    
    const sendResult = await relayCall('wallet_sendPreparedCalls', [{
      context: prepareResult.context,
      signature
    }]);
    
    console.log('✅ Transaction sent!');
    console.log('Bundle ID:', sendResult.id);
    
    // Check status
    console.log('\n4️⃣ Checking status...');
    await new Promise(r => setTimeout(r, 3000));
    const status = await relayCall('wallet_getCallsStatus', [sendResult.id]);
    console.log('Status:', JSON.stringify(status, null, 2));
    
  } catch (error) {
    console.error('\n❌ Error details:', error.message);
  }
}

debug().catch(console.error);