#!/usr/bin/env node

/**
 * Test with orchestrator address for delegation
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import fs from 'fs';

// Try with orchestrator for delegation
const CONFIG = {
  PORTO_URL: 'https://rise-testnet-porto.fly.dev',
  CHAIN_ID: 11155931,
  DELEGATION_PROXY: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
  ORCHESTRATOR: '0x046832405512d508b873e65174e51613291083bc',
};

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

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

async function testBoth() {
  console.log('🔍 Testing delegation addresses');
  console.log('=' .repeat(60));
  
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  console.log('Account:', mainAccount.address);
  
  // Test 1: With delegation_proxy
  console.log('\n1️⃣ Testing with delegation_proxy:', CONFIG.DELEGATION_PROXY);
  try {
    const prepareParams1 = {
      address: mainAccount.address,
      delegation: CONFIG.DELEGATION_PROXY,
      capabilities: { authorizeKeys: [] },
      chainId: CONFIG.CHAIN_ID
    };
    
    const prepareResponse1 = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams1]);
    const authSig1 = await mainAccount.sign({ hash: prepareResponse1.digests.auth });
    const execSig1 = await mainAccount.sign({ hash: prepareResponse1.digests.exec });
    
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse1.context,
      signatures: { auth: authSig1, exec: execSig1 }
    }]);
    console.log('✅ Stored with delegation_proxy');
    
    // Try to prepare calls
    const callParams1 = {
      from: mainAccount.address,
      chainId: CONFIG.CHAIN_ID,
      calls: [{
        to: FRENPET_ADDRESS,
        data: encodeFunctionData({
          abi: FrenPetABI.abi,
          functionName: 'createPet',
          args: [`TestPet_${Date.now()}`]
        }),
        value: '0x0'
      }],
      capabilities: {
        meta: { feeToken: ETH_ADDRESS }
      }
    };
    
    const prepareCallsResponse1 = await makeRelayCall('wallet_prepareCalls', [{
      ...callParams1,
      key: {
        prehash: false,
        publicKey: serializePublicKey(mainAccount.address),
        type: 'secp256k1'
      }
    }]);
    console.log('✅ Prepared calls with delegation_proxy');
    console.log('   PreCalls:', prepareCallsResponse1.context?.quote?.intent?.encodedPreCalls?.length || 0);
    
  } catch (error) {
    console.log('❌ Failed with delegation_proxy:', error.message);
  }
  
  // Test 2: With orchestrator
  console.log('\n2️⃣ Testing with orchestrator:', CONFIG.ORCHESTRATOR);
  const mainPrivateKey2 = generatePrivateKey();
  const mainAccount2 = privateKeyToAccount(mainPrivateKey2);
  console.log('New Account:', mainAccount2.address);
  
  try {
    const prepareParams2 = {
      address: mainAccount2.address,
      delegation: CONFIG.ORCHESTRATOR,
      capabilities: { authorizeKeys: [] },
      chainId: CONFIG.CHAIN_ID
    };
    
    const prepareResponse2 = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams2]);
    const authSig2 = await mainAccount2.sign({ hash: prepareResponse2.digests.auth });
    const execSig2 = await mainAccount2.sign({ hash: prepareResponse2.digests.exec });
    
    await makeRelayCall('wallet_upgradeAccount', [{
      context: prepareResponse2.context,
      signatures: { auth: authSig2, exec: execSig2 }
    }]);
    console.log('✅ Stored with orchestrator');
    
    // Try to prepare calls
    const callParams2 = {
      from: mainAccount2.address,
      chainId: CONFIG.CHAIN_ID,
      calls: [{
        to: FRENPET_ADDRESS,
        data: encodeFunctionData({
          abi: FrenPetABI.abi,
          functionName: 'createPet',
          args: [`TestPet_${Date.now()}`]
        }),
        value: '0x0'
      }],
      capabilities: {
        meta: { feeToken: ETH_ADDRESS }
      }
    };
    
    const prepareCallsResponse2 = await makeRelayCall('wallet_prepareCalls', [{
      ...callParams2,
      key: {
        prehash: false,
        publicKey: serializePublicKey(mainAccount2.address),
        type: 'secp256k1'
      }
    }]);
    console.log('✅ Prepared calls with orchestrator');
    console.log('   PreCalls:', prepareCallsResponse2.context?.quote?.intent?.encodedPreCalls?.length || 0);
    
  } catch (error) {
    console.log('❌ Failed with orchestrator:', error.message);
  }
}

testBoth().catch(console.error);