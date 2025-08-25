#!/usr/bin/env node

/**
 * Test with the exact working flow
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import fs from 'fs';

// Configuration matching working test
const CONFIG = {
  PORTO_URL: 'https://rise-testnet-porto.fly.dev',
  CHAIN_ID: 11155931,
  PORTO_PROXY: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
};

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// Load ABI
const FrenPetABI = JSON.parse(fs.readFileSync(new URL('../FrenPetSimple.json', import.meta.url)));

async function makeRelayCall(method, params) {
  const response = await fetch(CONFIG.PORTO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now()
    })
  });
  
  const result = await response.json();
  if (result.error) {
    console.log('Error details:', JSON.stringify(result.error, null, 2));
    throw new Error(`RPC Error: ${result.error.message}`);
  }
  return result.result;
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

async function testWorkingFlow() {
  console.log('🎯 TESTING WORKING FLOW');
  console.log('=' .repeat(60));
  
  // Generate accounts
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  console.log('Account:', mainAccount.address);
  
  const client = createPublicClient({
    chain: { id: CONFIG.CHAIN_ID },
    transport: http('https://testnet.riselabs.xyz'),
  });
  
  const initialBalance = await client.getBalance({ address: mainAccount.address });
  console.log('Initial Balance:', initialBalance.toString(), 'wei');
  
  try {
    // Step 1: Setup delegation WITHOUT session keys (working pattern)
    console.log('\n1️⃣ Setting up delegation...');
    const prepareParams = {
      address: mainAccount.address,
      delegation: CONFIG.PORTO_PROXY,
      capabilities: {
        authorizeKeys: [] // Empty for now - EOA is implicit admin
      },
      chainId: CONFIG.CHAIN_ID
    };
    
    const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
    console.log('✅ Prepared');
    
    const authSig = await mainAccount.sign({ hash: prepareResponse.digests.auth });
    const execSig = await mainAccount.sign({ hash: prepareResponse.digests.exec });
    
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('✅ Stored in relay');
    
    // Step 2: Send transaction
    console.log('\n2️⃣ Sending transaction...');
    const petName = `WorkingPet_${Date.now()}`;
    
    const createPetData = encodeFunctionData({
      abi: FrenPetABI.abi,
      functionName: 'createPet',
      args: [petName]
    });
    
    // Prepare with the exact pattern
    const callParams = {
      from: mainAccount.address,
      chainId: CONFIG.CHAIN_ID,
      calls: [{
        to: FRENPET_ADDRESS,
        data: createPetData,
        value: '0x0'
      }],
      capabilities: {
        meta: {
          feeToken: ETH_ADDRESS
        }
      }
    };
    
    const prepareCallsResponse = await makeRelayCall('wallet_prepareCalls', [{
      ...callParams,
      key: {
        prehash: false,
        publicKey: serializePublicKey(mainAccount.address),
        type: 'secp256k1'
      }
    }]);
    
    console.log('✅ Prepared calls');
    console.log('Digest:', prepareCallsResponse.digest?.substring(0, 20) + '...');
    
    const preCallCount = prepareCallsResponse.context?.quote?.intent?.encodedPreCalls?.length || 0;
    console.log('PreCalls:', preCallCount);
    
    const callSignature = await mainAccount.sign({ hash: prepareCallsResponse.digest });
    
    const sendResponse = await makeRelayCall('wallet_sendPreparedCalls', [{
      context: prepareCallsResponse.context,
      key: {
        prehash: false,
        publicKey: serializePublicKey(mainAccount.address),
        type: 'secp256k1'
      },
      signature: callSignature
    }]);
    
    console.log('✅ Sent:', sendResponse.id);
    
    // Wait
    console.log('\n⏳ Waiting for confirmation...');
    await new Promise(r => setTimeout(r, 10000));
    
    const statusResponse = await makeRelayCall('wallet_getCallsStatus', [sendResponse.id]);
    console.log('Status:', statusResponse.status);
    
    if (statusResponse.receipts?.[0]) {
      const receipt = statusResponse.receipts[0];
      console.log('Receipt:', receipt.status === '0x1' ? '✅ Success' : '❌ Failed');
      console.log('Tx Hash:', receipt.transactionHash);
    }
    
    // Verify
    console.log('\n3️⃣ Verifying...');
    const finalBalance = await client.getBalance({ address: mainAccount.address });
    console.log('Final balance:', finalBalance.toString(), 'wei');
    console.log('Gasless:', finalBalance === 0n ? '✅' : '❌');
    
    const code = await client.getCode({ address: mainAccount.address });
    console.log('Delegation deployed:', code && code !== '0x' ? '✅' : '❌');
    
    try {
      const hasPet = await client.readContract({
        address: FRENPET_ADDRESS,
        abi: FrenPetABI.abi,
        functionName: 'hasPet',
        args: [mainAccount.address]
      });
      console.log('Pet created:', hasPet ? '✅' : '❌');
    } catch (e) {
      console.log('Pet created: ❌');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testWorkingFlow().catch(console.error);