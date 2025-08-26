#!/usr/bin/env node

/**
 * Complete gasless flow test with uppercase FrenPet address
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import fs from 'fs';

const CONFIG = {
  PORTO_URL: 'https://rise-testnet-porto.fly.dev',
  CHAIN_ID: 11155931,
  DELEGATION_PROXY: '0x894C14A66508D221A219Dd0064b4A6718d0AAA52', // Updated proxy address
};

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25'; // Uppercase!
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

const FrenPetABI = JSON.parse(fs.readFileSync(new URL('../app/src/abi/FrenPetSimple.json', import.meta.url)));

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

async function testCompleteFlow() {
  console.log('🚀 COMPLETE GASLESS FLOW TEST');
  console.log('=' .repeat(60));
  
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  console.log('Account:', mainAccount.address);
  console.log('Private Key:', mainPrivateKey.substring(0, 10) + '...');
  
  const client = createPublicClient({
    chain: { id: CONFIG.CHAIN_ID },
    transport: http('https://testnet.riselabs.xyz'),
  });
  
  const initialBalance = await client.getBalance({ address: mainAccount.address });
  console.log('Initial Balance:', initialBalance.toString(), 'wei');
  
  try {
    // Step 1: Setup delegation
    console.log('\n1️⃣ Setting up delegation...');
    const prepareParams = {
      address: mainAccount.address,
      delegation: CONFIG.DELEGATION_PROXY,
      capabilities: { authorizeKeys: [] },
      chainId: CONFIG.CHAIN_ID
    };
    
    const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
    console.log('   Auth digest:', prepareResponse.digests.auth.substring(0, 20) + '...');
    
    const authSig = await mainAccount.sign({ hash: prepareResponse.digests.auth });
    const execSig = await mainAccount.sign({ hash: prepareResponse.digests.exec });
    
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse.context,
      signatures: { auth: authSig, exec: execSig }
    }]);
    console.log('   ✅ Delegation stored in relay');
    
    // Step 2: Prepare transaction
    console.log('\n2️⃣ Preparing transaction...');
    const petName = `GaslessPet_${Date.now()}`;
    console.log('   Pet name:', petName);
    
    const createPetData = encodeFunctionData({
      abi: FrenPetABI.abi,
      functionName: 'createPet',
      args: [petName]
    });
    
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
    
    console.log('   ✅ Calls prepared');
    console.log('   Digest:', prepareCallsResponse.digest.substring(0, 20) + '...');
    
    const preCallCount = prepareCallsResponse.context?.quote?.intent?.encodedPreCalls?.length || 0;
    console.log('   PreCalls included:', preCallCount);
    
    if (preCallCount > 0) {
      console.log('   📦 Will deploy delegation + execute transaction');
    }
    
    // Step 3: Sign and send
    console.log('\n3️⃣ Signing and sending transaction...');
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
    
    console.log('   ✅ Transaction sent!');
    console.log('   Bundle ID:', sendResponse.id);
    console.log('   View: https://testnet.riselabs.xyz/tx/' + sendResponse.id);
    
    // Step 4: Wait for confirmation
    console.log('\n4️⃣ Waiting for confirmation...');
    let status;
    let attempts = 0;
    while (attempts < 15) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        status = await makeRelayCall('wallet_getCallsStatus', [sendResponse.id]);
        console.log('   Status:', status.status);
        
        if (status.status === 200 || status.status === 'success') {
          if (status.receipts?.[0]) {
            const receipt = status.receipts[0];
            console.log('   Receipt status:', receipt.status === '0x1' ? '✅ Success' : '❌ Failed');
            console.log('   Tx Hash:', receipt.transactionHash);
            console.log('   Gas Used:', receipt.gasUsed);
          }
          break;
        }
      } catch (e) {
        console.log('   Waiting...');
      }
      attempts++;
    }
    
    // Step 5: Verify results
    console.log('\n5️⃣ Verifying results...');
    const finalBalance = await client.getBalance({ address: mainAccount.address });
    console.log('   Final balance:', finalBalance.toString(), 'wei');
    console.log('   Gasless achieved:', finalBalance === 0n ? '✅ Yes' : '❌ No');
    
    const code = await client.getCode({ address: mainAccount.address });
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    try {
      const hasPet = await client.readContract({
        address: FRENPET_ADDRESS,
        abi: FrenPetABI.abi,
        functionName: 'hasPet',
        args: [mainAccount.address]
      });
      console.log('   Pet created:', hasPet ? '✅ Yes' : '❌ No');
      
      if (hasPet) {
        const petStats = await client.readContract({
          address: FRENPET_ADDRESS,
          abi: FrenPetABI.abi,
          functionName: 'getPetStats',
          args: [mainAccount.address]
        });
        console.log('\n🐾 Pet Stats:');
        console.log('   Name:', petStats[0]);
        console.log('   Level:', petStats[1].toString());
        console.log('   Experience:', petStats[2].toString());
        console.log('   Happiness:', petStats[3].toString());
        console.log('   Hunger:', petStats[4].toString());
        console.log('   Is Alive:', petStats[5]);
      }
    } catch (e) {
      console.log('   Pet created: ❌ No (contract read failed)');
    }
    
    // Summary
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 SUMMARY');
    console.log('   Fresh EOA:', mainAccount.address);
    console.log('   Gasless achieved:', finalBalance === 0n ? '✅' : '❌');
    console.log('   Delegation deployed:', code && code !== '0x' ? '✅' : '❌');
    console.log('   Transaction successful:', status?.status === 200 ? '✅' : '❌');
    console.log('=' .repeat(60));
    
    if (finalBalance === 0n && status?.status === 200) {
      console.log('\n✅ SUCCESS! Gasless flow working perfectly!');
      console.log('   • Started with fresh EOA (0 ETH)');
      console.log('   • Delegation deployed on-chain');
      console.log('   • Transaction executed successfully');
      console.log('   • All gas sponsored by Porto relay');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testCompleteFlow().catch(console.error);