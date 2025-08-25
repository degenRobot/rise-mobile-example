#!/usr/bin/env node

/**
 * Test Porto Relayer Flow
 * Simple test to verify the Porto relayer integration works correctly
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http, pad } from 'viem';
import FrenPetSimpleJson from '../src/abi/FrenPetSimple.json' with { type: 'json' };

const PORTO_URL = 'https://rise-testnet-porto.fly.dev';
const CHAIN_ID = 11155931;
const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const PORTO_PROXY = '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4'; // Correct proxy address
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';
const RPC_URL = 'https://testnet.riselabs.xyz';

// Serialize public key following Porto's format
function serializePublicKey(address) {
  // Porto expects padded 32-byte public key
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

async function testRelayerFlow() {
  console.log('🚀 Testing Porto Relayer Flow');
  console.log('=' .repeat(50));
  
  // Generate test account
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log('📝 Test Account:', account.address);
  
  // Create a public client for reading blockchain state
  const client = createPublicClient({
    chain: { id: CHAIN_ID, name: 'RISE Testnet', rpcUrls: { default: { http: [RPC_URL] } } },
    transport: http(RPC_URL),
  });
  
  // Check initial balance
  const initialBalance = await client.getBalance({ address: account.address });
  console.log('💰 Initial Balance:', initialBalance.toString(), 'wei (should be 0)');
  
  // Check health
  console.log('\n1️⃣ Checking Porto health...');
  try {
    const health = await makeRelayCall('health', []);
    console.log('   ✅ Porto is healthy:', health);
  } catch (error) {
    console.log('   ❌ Health check failed:', error.message);
  }
  
  // Setup delegation
  console.log('\n2️⃣ Setting up delegation...');
  try {
    const prepareParams = {
      address: account.address,
      delegation: PORTO_PROXY, // Use correct proxy address
      capabilities: {
        authorizeKeys: [] // Empty for MVP - EOA is implicit admin
      },
      chainId: CHAIN_ID
    };
    
    const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
    console.log('   ✅ Delegation prepared');
    console.log('   Auth digest:', prepareResponse.digests.auth.substring(0, 20) + '...');
    console.log('   Exec digest:', prepareResponse.digests.exec.substring(0, 20) + '...');
    
    // Sign digests with raw signatures (not EIP-191)
    const authSig = await account.sign({ hash: prepareResponse.digests.auth });
    const execSig = await account.sign({ hash: prepareResponse.digests.exec });
    
    // Store delegation
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('   ✅ Delegation stored in relay (will be deployed on first tx)');
  } catch (error) {
    console.log('   ⚠️  Delegation setup failed:', error.message);
  }
  
  // Prepare transaction
  console.log('\n3️⃣ Preparing transaction...');
  const petName = `TestPet_${Date.now()}`;
  const createPetData = encodeFunctionData({
    abi: FrenPetSimpleJson.abi,
    functionName: 'createPet',
    args: [petName]
  });
  
  let bundleId;
  let transactionSuccess = false;
  
  try {
    const callParams = {
      from: account.address,
      chainId: CHAIN_ID,
      calls: [{
        to: FRENPET_ADDRESS,
        data: createPetData,
        value: '0x0'
      }],
      capabilities: {
        meta: {
          feeToken: ETH_ADDRESS // Required for gasless
        }
      },
      key: {
        prehash: false,
        publicKey: serializePublicKey(account.address),
        type: 'secp256k1'
      }
    };
    
    const prepareResult = await makeRelayCall('wallet_prepareCalls', [callParams]);
    console.log('   ✅ Transaction prepared');
    console.log('   Digest:', prepareResult.digest.substring(0, 20) + '...');
    
    // Check if preCalls included (delegation deployment)
    const preCallCount = prepareResult.context?.quote?.intent?.encodedPreCalls?.length || 0;
    console.log('   PreCalls included:', preCallCount);
    if (preCallCount > 0) {
      console.log('   📦 Transaction will deploy delegation + execute pet creation');
    }
    
    // Sign and send
    console.log('\n4️⃣ Sending transaction...');
    const signature = await account.sign({ hash: prepareResult.digest });
    
    const sendResponse = await makeRelayCall('wallet_sendPreparedCalls', [{
      context: prepareResult.context,
      key: {
        prehash: false,
        publicKey: serializePublicKey(account.address),
        type: 'secp256k1'
      },
      signature
    }]);
    
    bundleId = sendResponse.id;
    console.log('   ✅ Transaction sent!');
    console.log('   Bundle ID:', bundleId);
    console.log('   View: https://testnet.riselabs.xyz/tx/' + bundleId);
    
    // Wait for confirmation
    console.log('\n⏳ Waiting 10 seconds for confirmation...');
    await new Promise(r => setTimeout(r, 10000));
    
    // Check status
    try {
      const status = await makeRelayCall('wallet_getCallsStatus', [bundleId]);
      console.log('   Status:', status.status);
      if (status.receipts && status.receipts[0]) {
        const receipt = status.receipts[0];
        transactionSuccess = receipt.status === '0x1';
        console.log('   Receipt:', {
          status: transactionSuccess ? '✅ Success' : '❌ Failed',
          gasUsed: receipt.gasUsed
        });
      }
    } catch (error) {
      console.log('   ⚠️  Status check failed:', error.message);
    }
    
  } catch (error) {
    console.log('   ❌ Transaction failed:', error.message);
  }
  
  // =====================================
  // STEP 5: Verify Results
  // =====================================
  console.log('\n5️⃣ Verifying Results');
  console.log('=' .repeat(50));
  
  // Check final balance
  const finalBalance = await client.getBalance({ address: account.address });
  console.log('💰 Final balance:', finalBalance.toString(), 'wei');
  console.log('   Gasless achieved:', finalBalance <= initialBalance ? '✅ Yes' : '❌ No');
  
  // Check if delegation was deployed
  const code = await client.getCode({ address: account.address });
  const hasDelegation = code && code !== '0x';
  console.log('📝 Delegation deployed:', hasDelegation ? '✅ Yes' : '❌ No');
  
  // Check pet creation
  console.log('\n🐾 Checking pet creation...');
  let petCreated = false;
  try {
    const hasPet = await client.readContract({
      address: FRENPET_ADDRESS,
      abi: FrenPetSimpleJson.abi,
      functionName: 'hasPet',
      args: [account.address]
    });
    
    petCreated = hasPet;
    console.log('   Pet created:', petCreated ? '✅ Yes' : '❌ No');
    
    if (petCreated) {
      const petStats = await client.readContract({
        address: FRENPET_ADDRESS,
        abi: FrenPetSimpleJson.abi,
        functionName: 'getPetStats',
        args: [account.address]
      });
      console.log('\n🎮 Pet Stats:');
      console.log('   Name:', petStats[0]);
      console.log('   Level:', petStats[1].toString());
      console.log('   Experience:', petStats[2].toString());
      console.log('   Happiness:', petStats[3].toString());
      console.log('   Hunger:', petStats[4].toString());
      console.log('   Is Alive:', petStats[5] ? '✅' : '❌');
    }
  } catch (error) {
    console.log('   Pet created: ❌ No (contract call failed)');
  }
  
  // =====================================
  // SUMMARY
  // =====================================
  console.log('\n' + '=' .repeat(50));
  console.log('🎯 SUMMARY');
  console.log('   Gasless achieved:', finalBalance <= initialBalance ? '✅' : '❌');
  console.log('   Delegation deployed:', hasDelegation ? '✅' : '❌');
  console.log('   Pet created:', petCreated ? '✅' : '❌');
  console.log('   Transaction successful:', transactionSuccess ? '✅' : '❌');
  console.log('=' .repeat(50));
  
  if (petCreated && finalBalance <= initialBalance) {
    console.log('\n✅ SUCCESS! Gasless transaction worked perfectly!');
    console.log('   • Account had 0 ETH throughout');
    console.log('   • Delegation was deployed');
    console.log('   • Pet was created successfully');
    console.log('   • All gas was sponsored by Porto relay');
  } else if (!petCreated) {
    console.log('\n⚠️  Transaction was sent but pet creation failed');
    console.log('   This might indicate an issue with the contract call');
  }
}

// Run test
testRelayerFlow().catch(console.error);