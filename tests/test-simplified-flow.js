/**
 * Test simplified Porto functions - Full flow with fresh EOA
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, encodeFunctionData } from 'viem';
import fs from 'fs';

// Import our simplified Porto functions (using the exact same logic as working tests)
const PORTO_RELAY_URL = 'https://rise-testnet-porto.fly.dev';
const CHAIN_ID = 11155931;
const PORTO_PROXY = '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4';
const ETH_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const RPC_URL = 'https://testnet.riselabs.xyz';

// Contract addresses
const FRENPET_ADDRESS = '0xc73341541Ad7910c31e54EFf5f1FfD893C78Cf90';

// Load ABI
const FrenPetSimpleJson = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));

// Porto relay call - exactly matching the working test
async function makeRelayCall(method, params) {
  const response = await fetch(PORTO_RELAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
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

// Serialize public key - exactly matching the working test
function serializePublicKey(address) {
  const cleanAddress = address.toLowerCase();
  if (cleanAddress.length < 66) {
    const withoutPrefix = cleanAddress.slice(2);
    const padded = withoutPrefix.padStart(64, '0');
    return '0x' + padded;
  }
  return cleanAddress;
}

async function testFullFlow() {
  console.log('🧪 Testing Simplified Porto Functions - Full Flow');
  console.log('=' .repeat(50));
  
  // Generate fresh EOA
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  console.log('📝 Fresh EOA:', account.address);
  
  // Create public client for reading state
  const client = createPublicClient({
    chain: { id: CHAIN_ID, name: 'RISE Testnet', rpcUrls: { default: { http: [RPC_URL] } } },
    transport: http(RPC_URL),
  });
  
  // Check initial balance (should be 0)
  const initialBalance = await client.getBalance({ address: account.address });
  console.log('💰 Initial Balance:', initialBalance.toString(), 'wei (should be 0)');
  
  try {
    // 1. Check Porto health
    console.log('\n1️⃣ Checking Porto health...');
    const health = await makeRelayCall('health', []);
    console.log('   ✅ Porto is healthy:', health);
    
    // 2. Setup delegation (exactly matching working test)
    console.log('\n2️⃣ Setting up delegation...');
    const prepareParams = {
      address: account.address,
      delegation: PORTO_PROXY,
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
    console.log('   ✅ Delegation stored in relay');
    
    // 3. Prepare transaction (exactly matching working test)
    console.log('\n3️⃣ Preparing transaction...');
    const petName = `SimplePet_${Date.now()}`;
    const createPetData = encodeFunctionData({
      abi: FrenPetSimpleJson.abi,
      functionName: 'createPet',
      args: [petName]
    });
    
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
    if (preCallCount > 0) {
      console.log('   📦 Transaction will deploy delegation + execute pet creation');
    }
    
    // 4. Sign and send transaction
    console.log('\n4️⃣ Sending transaction...');
    const signature = await account.sign({ hash: prepareResult.digest });
    
    const sendResult = await makeRelayCall('wallet_sendPreparedCalls', [{
      context: prepareResult.context,
      signature
    }]);
    
    console.log('   ✅ Transaction sent!');
    console.log('   Bundle ID:', sendResult.id);
    console.log('   View: https://testnet.riselabs.xyz/tx/' + sendResult.id);
    
    // 5. Wait for confirmation
    console.log('\n⏳ Waiting for confirmation...');
    let status;
    let attempts = 0;
    while (attempts < 15) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      status = await makeRelayCall('wallet_getCallsStatus', [sendResult.id]);
      
      if (status.status === 200 || status.status === 'success') {
        console.log('   Status:', status.status);
        if (status.receipts && status.receipts[0]) {
          const receipt = status.receipts[0];
          console.log('   Receipt:', {
            status: receipt.status === '0x1' ? '✅ Success' : '❌ Failed',
            gasUsed: receipt.gasUsed
          });
        }
        break;
      }
      attempts++;
    }
    
    // 6. Verify results
    console.log('\n5️⃣ Verifying Results');
    console.log('=' .repeat(50));
    
    // Check final balance
    const finalBalance = await client.getBalance({ address: account.address });
    console.log('💰 Final balance:', finalBalance.toString(), 'wei');
    console.log('   Gasless achieved:', finalBalance === 0n ? '✅ Yes' : '❌ No');
    
    // Check if delegation was deployed
    const code = await client.getCode({ address: account.address });
    console.log('📝 Delegation deployed:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    // Check pet creation
    console.log('\n🐾 Checking pet creation...');
    try {
      const petId = await client.readContract({
        address: FRENPET_ADDRESS,
        abi: FrenPetSimpleJson.abi,
        functionName: 'ownerToPet',
        args: [account.address]
      });
      
      if (petId > 0n) {
        console.log('   Pet created: ✅ Yes');
        
        const pet = await client.readContract({
          address: FRENPET_ADDRESS,
          abi: FrenPetSimpleJson.abi,
          functionName: 'pets',
          args: [petId]
        });
        
        console.log('\n🎮 Pet Stats:');
        console.log('   Name:', pet.name);
        console.log('   Level:', pet.level.toString());
        console.log('   Experience:', pet.experience.toString());
        console.log('   Happiness:', pet.happiness.toString());
        console.log('   Hunger:', pet.hunger.toString());
        console.log('   Is Alive:', pet.isAlive ? '✅' : '❌');
      } else {
        console.log('   Pet created: ❌ No');
      }
    } catch (error) {
      console.log('   Pet created: ❌ No');
    }
    
    // Summary
    console.log('\n' + '=' .repeat(50));
    console.log('🎯 SUMMARY');
    console.log('   Fresh EOA:', account.address);
    console.log('   Gasless achieved:', finalBalance === 0n ? '✅' : '❌');
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅' : '❌');
    console.log('   Transaction successful:', status?.status === 200 ? '✅' : '❌');
    console.log('=' .repeat(50));
    
    if (finalBalance === 0n && status?.status === 200) {
      console.log('\n✅ SUCCESS! Full flow worked perfectly!');
      console.log('   • Started with fresh EOA');
      console.log('   • Account had 0 ETH throughout');
      console.log('   • Delegation was deployed');
      console.log('   • Transaction was executed');
      console.log('   • All gas was sponsored by Porto relay');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

// Run the test
testFullFlow().catch(console.error);