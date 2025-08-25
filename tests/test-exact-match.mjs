#!/usr/bin/env node

/**
 * Exact match test - using the exact same parameters as the working external test
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import fs from 'fs';

// Exact configuration from working test
const CONFIG = {
  PORTO_URL: 'https://rise-testnet-porto.fly.dev',
  CHAIN_ID: 11155931,
  PORTO_PROXY: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
};

const FRENPET_SIMPLE_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

// Load the exact same ABI
const FrenPetSimpleJson = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));

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

async function testExactMatch() {
  console.log('🎯 EXACT MATCH TEST - Using Working Parameters');
  console.log('=' .repeat(60));
  
  // Generate fresh accounts exactly like the working test
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  const adminPrivateKey = generatePrivateKey();
  const adminAccount = privateKeyToAccount(adminPrivateKey);
  
  console.log('🔑 Accounts:');
  console.log('  Main EOA:', mainAccount.address);
  console.log('  Admin Key:', adminAccount.address);
  
  const client = createPublicClient({
    chain: { id: CONFIG.CHAIN_ID },
    transport: http('https://testnet.riselabs.xyz'),
  });
  
  const initialBalance = await client.getBalance({ address: mainAccount.address });
  console.log('  Initial Balance:', initialBalance.toString(), 'wei');
  
  // STEP 1: Register Delegation with Admin Key (exactly as working test)
  console.log('\n📝 Step 1: Register Delegation with Admin Key');
  
  const prepareParams = {
    address: mainAccount.address,
    delegation: CONFIG.PORTO_PROXY,
    capabilities: {
      authorizeKeys: [
        {
          prehash: false,
          expiry: "0x0",
          publicKey: serializePublicKey(adminAccount.address),
          role: 'admin',
          type: 'secp256k1',
          permissions: []
        }
      ]
    },
    chainId: CONFIG.CHAIN_ID
  };
  
  console.log('  Preparing upgrade with admin key...');
  const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
  console.log('  ✅ Prepared upgrade');
  
  const authSig = await mainAccount.sign({ hash: prepareResponse.digests.auth });
  const execSig = await mainAccount.sign({ hash: prepareResponse.digests.exec });
  
  console.log('  Storing upgrade in relay DB...');
  await makeRelayCall('wallet_upgradeAccount', [{
    context: prepareResponse.context,
    signatures: { auth: authSig, exec: execSig }
  }]);
  console.log('  ✅ Upgrade stored');
  
  // STEP 2: Execute Gasless Transaction (exactly as working test)
  console.log('\n📝 Step 2: Execute Gasless Transaction');
  
  const petName = `GaslessPet_${Date.now()}`;
  console.log('  Pet name:', petName);
  
  const createPetCalldata = encodeFunctionData({
    abi: FrenPetSimpleJson.abi,
    functionName: 'createPet',
    args: [petName]
  });
  
  // Prepare exactly as working test
  const callParams = {
    from: mainAccount.address,
    chainId: CONFIG.CHAIN_ID,
    calls: [{
      to: FRENPET_SIMPLE_ADDRESS,
      data: createPetCalldata,
      value: '0x0'
    }],
    capabilities: {
      meta: {
        feeToken: ETH_ADDRESS
      }
    }
  };
  
  console.log('  Preparing calls...');
  const prepareCallsResponse = await makeRelayCall('wallet_prepareCalls', [{
    ...callParams,
    key: {
      prehash: false,
      publicKey: serializePublicKey(mainAccount.address),
      type: 'secp256k1'
    }
  }]);
  console.log('  ✅ Prepared calls');
  console.log('  Digest:', prepareCallsResponse.digest.substring(0, 20) + '...');
  
  const preCallCount = prepareCallsResponse.context?.quote?.intent?.encodedPreCalls?.length || 0;
  console.log('  PreCalls included:', preCallCount);
  
  if (preCallCount > 0) {
    console.log('  ✅ Transaction will deploy delegation + execute');
  }
  
  // Sign with main EOA (exactly as working test)
  const isFirstTransaction = preCallCount > 0;
  const signingAccount = isFirstTransaction ? mainAccount : adminAccount;
  const signingKey = isFirstTransaction ? mainAccount.address : adminAccount.address;
  
  console.log('  Signing with:', isFirstTransaction ? 'Main EOA' : 'Admin Key');
  const callSignature = await signingAccount.sign({ hash: prepareCallsResponse.digest });
  
  // Send exactly as working test
  console.log('  Sending transaction...');
  try {
    const sendResponse = await makeRelayCall('wallet_sendPreparedCalls', [{
      context: prepareCallsResponse.context,
      key: {
        prehash: false,
        publicKey: serializePublicKey(signingKey),
        type: 'secp256k1'
      },
      signature: callSignature
    }]);
    
    console.log('  ✅ Transaction sent:', sendResponse.id);
    
    console.log('\n⏳ Waiting 15 seconds for confirmation...');
    await new Promise(r => setTimeout(r, 15000));
    
    try {
      const statusResponse = await makeRelayCall('wallet_getCallsStatus', [sendResponse.id]);
      console.log('  Transaction status:', statusResponse.status);
      if (statusResponse.receipts && statusResponse.receipts[0]) {
        const receipt = statusResponse.receipts[0];
        console.log('  Receipt status:', receipt.status === '0x1' ? '✅ Success' : '❌ Failed');
        console.log('  Tx Hash:', receipt.transactionHash);
      }
    } catch (error) {
      console.log('  ⚠️  Could not get transaction status');
    }
    
  } catch (error) {
    console.log('  ❌ Transaction failed:', error.message);
  }
  
  // STEP 3: Verify Results
  console.log('\n📝 Step 3: Verify Results');
  
  const finalBalance = await client.getBalance({ address: mainAccount.address });
  console.log('  Final balance:', finalBalance.toString(), 'wei');
  console.log('  Gasless achieved:', finalBalance <= initialBalance ? '✅ Yes' : '❌ No');
  
  const code = await client.getCode({ address: mainAccount.address });
  const hasDelegation = code && code !== '0x';
  console.log('  Delegation deployed:', hasDelegation ? '✅ Yes' : '❌ No');
  
  console.log('\n  Checking pet creation...');
  try {
    const hasPet = await client.readContract({
      address: FRENPET_SIMPLE_ADDRESS,
      abi: FrenPetSimpleJson.abi,
      functionName: 'hasPet',
      args: [mainAccount.address]
    });
    
    console.log('  Pet created:', hasPet ? '✅ Yes' : '❌ No');
    
    if (hasPet) {
      const petStats = await client.readContract({
        address: FRENPET_SIMPLE_ADDRESS,
        abi: FrenPetSimpleJson.abi,
        functionName: 'getPetStats',
        args: [mainAccount.address]
      });
      console.log('\n🐾 Pet Stats:');
      console.log('  Name:', petStats[0]);
      console.log('  Level:', petStats[1].toString());
    }
  } catch (error) {
    console.log('  Pet created: ❌ No');
  }
  
  console.log('\n' + '=' .repeat(60));
}

testExactMatch().catch(console.error);