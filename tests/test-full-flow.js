#!/usr/bin/env node

/**
 * Test complete flow with simple-porto
 */

import { 
  checkHealth,
  generateAccount,
  prepareUpgradeAccount,
  upgradeAccount,
  sendTransaction
} from '../src/lib/simple-porto.ts';
import { encodeFunctionData } from 'viem';
import fs from 'fs';

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const FRENPET_JSON = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));
const FRENPET_ABI = FRENPET_JSON.abi;

async function main() {
  console.log('🚀 Testing Complete Flow with Simple Porto\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Check health
    console.log('1️⃣ Checking relay health...');
    const health = await checkHealth();
    console.log('   Health:', health);
    
    // Step 2: Generate account
    console.log('\n2️⃣ Generating account...');
    const account = generateAccount();
    console.log('   Account:', account.address);
    
    // Step 3: Setup delegation
    console.log('\n3️⃣ Setting up delegation...');
    const prepareResponse = await prepareUpgradeAccount(account);
    console.log('   Auth digest:', prepareResponse.digests.auth.slice(0, 20) + '...');
    
    await upgradeAccount(account, prepareResponse);
    console.log('   ✅ Delegation stored in relay');
    
    // Step 4: Create pet transaction
    console.log('\n4️⃣ Creating pet transaction...');
    const petName = `TestPet_${Date.now()}`;
    console.log('   Pet name:', petName);
    
    const data = encodeFunctionData({
      abi: FRENPET_ABI,
      functionName: 'createPet',
      args: [petName]
    });
    console.log('   Encoded data:', data.slice(0, 10) + '...');
    
    // Step 5: Send transaction
    console.log('\n5️⃣ Sending gasless transaction...');
    const result = await sendTransaction(account, FRENPET_ADDRESS, data);
    console.log('   ✅ Transaction sent!');
    console.log('   Bundle ID:', result.bundleId);
    console.log('   Status:', result.status || 'pending');
    
    if (result.tx) {
      console.log('   Tx Hash:', result.tx);
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Complete flow test successful!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main().catch(console.error);