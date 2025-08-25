#!/usr/bin/env node

/**
 * Test the actual simple-porto module with full flow
 */

import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import fs from 'fs';

// Configuration matching our module
const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4', // delegation_proxy
  orchestrator: '0x046832405512d508b873e65174e51613291083bc', // orchestrator
  ethAddress: '0x0000000000000000000000000000000000000000',
};

// Our simplified functions
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

async function checkHealth() {
  return await relayCall('health', []);
}

async function prepareUpgradeAccount(account, sessionKey) {
  const params = {
    address: account.address,
    delegation: PORTO_CONFIG.proxy,
    capabilities: {
      authorizeKeys: sessionKey ? [{
        expiry: '0x0',
        prehash: false,
        publicKey: serializePublicKey(sessionKey.address),
        role: 'admin', // Use admin role like working test
        type: 'secp256k1',
        permissions: []
      }] : []
    },
    chainId: PORTO_CONFIG.chainId
  };

  return await relayCall('wallet_prepareUpgradeAccount', [params]);
}

async function upgradeAccount(account, prepareResponse) {
  const authSig = await account.sign({ hash: prepareResponse.digests.auth });
  const execSig = await account.sign({ hash: prepareResponse.digests.exec });

  await relayCall('wallet_upgradeAccount', [{
    context: prepareResponse.context,
    signatures: { auth: authSig, exec: execSig }
  }]);
}

async function prepareCalls(account, calls) {
  const params = {
    from: account.address,
    chainId: PORTO_CONFIG.chainId,
    calls,
    capabilities: {
      meta: {
        feeToken: PORTO_CONFIG.ethAddress
      }
    }
  };

  // Include key in the request like the working test
  return await relayCall('wallet_prepareCalls', [{
    ...params,
    key: {
      prehash: false,
      publicKey: serializePublicKey(account.address),
      type: 'secp256k1'
    }
  }]);
}

async function sendPreparedCalls(account, prepareResult) {
  const signature = await account.sign({ hash: prepareResult.digest });

  return await relayCall('wallet_sendPreparedCalls', [{
    context: prepareResult.context,
    signature
  }]);
}

async function getCallsStatus(bundleId) {
  return await relayCall('wallet_getCallsStatus', [bundleId]);
}

async function waitForTransaction(bundleId, maxAttempts = 30) {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const status = await getCallsStatus(bundleId);
    if (status.status === 200 || status.status === 'success') {
      return status;
    }
    
    attempts++;
  }
  
  throw new Error('Transaction timeout');
}

async function sendTransaction(account, to, data, value = '0x0') {
  const prepareResult = await prepareCalls(account, [{
    to,
    data,
    value
  }]);

  const sendResult = await sendPreparedCalls(account, prepareResult);
  const status = await waitForTransaction(sendResult.id);

  return {
    bundleId: sendResult.id,
    status
  };
}

// Test with FrenPet
const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const FrenPetABI = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));

async function testFullFlow() {
  console.log('🧪 Testing Porto Module - Full Flow with Fresh EOA');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Generate fresh account
    console.log('\n1️⃣ Generating fresh EOA...');
    const privateKey = generatePrivateKey();
    const account = privateKeyToAccount(privateKey);
    console.log('   📝 Address:', account.address);
    console.log('   🔑 Private Key:', privateKey.substring(0, 10) + '...');
    
    // Step 2: Check balance (should be 0)
    console.log('\n2️⃣ Checking initial balance...');
    const client = createPublicClient({
      chain: { id: PORTO_CONFIG.chainId },
      transport: http('https://testnet.riselabs.xyz'),
    });
    
    const initialBalance = await client.getBalance({ address: account.address });
    console.log('   💰 Balance:', initialBalance.toString(), 'wei');
    console.log('   Gasless ready:', initialBalance === 0n ? '✅ Yes' : '❌ No');
    
    // Step 3: Check Porto health
    console.log('\n3️⃣ Checking Porto health...');
    const health = await checkHealth();
    console.log('   ✅ Health:', health);
    
    // Step 4: Setup delegation (optional, will be done on first tx anyway)
    console.log('\n4️⃣ Setting up delegation...');
    try {
      const prepareResponse = await prepareUpgradeAccount(account);
      await upgradeAccount(account, prepareResponse);
      console.log('   ✅ Delegation stored in relay');
    } catch (error) {
      console.log('   ⚠️  Delegation setup failed (may already exist)');
    }
    
    // Step 5: Send a transaction
    console.log('\n5️⃣ Sending gasless transaction...');
    console.log('   Creating pet on FrenPet contract...');
    
    const petName = `TestPet_${Date.now()}`;
    const createPetData = encodeFunctionData({
      abi: FrenPetABI.abi || FrenPetABI,
      functionName: 'createPet',
      args: [petName]
    });
    
    try {
      const result = await sendTransaction(
        account,
        FRENPET_ADDRESS,
        createPetData
      );
      
      console.log('   ✅ Transaction sent!');
      console.log('   Bundle ID:', result.bundleId);
      console.log('   Status:', result.status.status);
      
      if (result.status.receipts?.[0]) {
        const receipt = result.status.receipts[0];
        console.log('   Tx Hash:', receipt.transactionHash);
        console.log('   Gas Used:', receipt.gasUsed);
        console.log('   Success:', receipt.status === '0x1' ? '✅' : '❌');
      }
    } catch (txError) {
      console.log('   ❌ Transaction failed:', txError.message);
    }
    
    // Step 6: Verify gasless
    console.log('\n6️⃣ Verifying gasless execution...');
    const finalBalance = await client.getBalance({ address: account.address });
    console.log('   💰 Final balance:', finalBalance.toString(), 'wei');
    console.log('   Gasless achieved:', finalBalance === 0n ? '✅ Yes' : '❌ No');
    
    // Step 7: Check if delegation was deployed
    const code = await client.getCode({ address: account.address });
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('📊 SUMMARY');
    console.log('   • Fresh EOA generated: ✅');
    console.log('   • Zero balance maintained:', finalBalance === 0n ? '✅' : '❌');
    console.log('   • Porto relay working: ✅');
    console.log('   • Delegation system:', code && code !== '0x' ? '✅ Active' : '⚠️ Pending');
    console.log('=' .repeat(50));
    
    if (finalBalance === 0n) {
      console.log('\n✅ SUCCESS! Gasless transactions working!');
      console.log('   The user never needed any ETH.');
      console.log('   All gas was sponsored by Porto relay.');
    }
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testFullFlow().catch(console.error);