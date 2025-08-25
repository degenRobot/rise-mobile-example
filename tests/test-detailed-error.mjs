#!/usr/bin/env node

/**
 * Get detailed error information
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { encodeFunctionData } from 'viem';
import fs from 'fs';

const CONFIG = {
  PORTO_URL: 'https://rise-testnet-porto.fly.dev',
  CHAIN_ID: 11155931,
  DELEGATION_PROXY: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4',
};

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const ETH_ADDRESS = '0x0000000000000000000000000000000000000000';

const FrenPetABI = JSON.parse(fs.readFileSync(new URL('../FrenPetSimple.json', import.meta.url)));

async function makeRelayCall(method, params, verbose = false) {
  if (verbose) {
    console.log('\n📤 Request:', method);
    console.log(JSON.stringify(params, null, 2));
  }
  
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
  
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch (e) {
    console.log('Raw response:', text);
    throw new Error('Invalid JSON response');
  }
  
  if (verbose) {
    console.log('\n📥 Response:');
    console.log(JSON.stringify(result, null, 2));
  }
  
  if (result.error) {
    throw new Error(`RPC Error: ${result.error.message || JSON.stringify(result.error)}`);
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

async function testDetailed() {
  console.log('🔍 Detailed error test');
  console.log('=' .repeat(60));
  
  const mainPrivateKey = generatePrivateKey();
  const mainAccount = privateKeyToAccount(mainPrivateKey);
  
  console.log('Account:', mainAccount.address);
  
  // Setup delegation
  console.log('\n1️⃣ Setting up delegation...');
  const prepareParams = {
    address: mainAccount.address,
    delegation: CONFIG.DELEGATION_PROXY,
    capabilities: { authorizeKeys: [] },
    chainId: CONFIG.CHAIN_ID
  };
  
  const prepareResponse = await makeRelayCall('wallet_prepareUpgradeAccount', [prepareParams]);
  const authSig = await mainAccount.sign({ hash: prepareResponse.digests.auth });
  const execSig = await mainAccount.sign({ hash: prepareResponse.digests.exec });
  
  await makeRelayCall('wallet_upgradeAccount', [{
    context: prepareResponse.context,
    signatures: { auth: authSig, exec: execSig }
  }]);
  console.log('✅ Stored');
  
  // Try prepare calls with verbose output
  console.log('\n2️⃣ Preparing calls (verbose)...');
  const callParams = {
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
      meta: { 
        feeToken: ETH_ADDRESS
      }
    }
  };
  
  try {
    const prepareCallsResponse = await makeRelayCall('wallet_prepareCalls', [{
      ...callParams,
      key: {
        prehash: false,
        publicKey: serializePublicKey(mainAccount.address),
        type: 'secp256k1'
      }
    }], true);
    
    console.log('✅ Success!');
    console.log('Digest:', prepareCallsResponse.digest);
    
  } catch (error) {
    console.log('\n❌ Error:', error.message);
  }
}

testDetailed().catch(console.error);