#!/usr/bin/env node

/**
 * Test FrenPet flow
 */

import { 
  checkHealth,
  generateAccount,
  prepareUpgradeAccount,
  upgradeAccount,
  sendTransaction
} from '../app/src/lib/simple-porto.ts';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import fs from 'fs';

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const FRENPET_JSON = JSON.parse(fs.readFileSync(new URL('../app/src/abi/FrenPetSimple.json', import.meta.url)));
const FRENPET_ABI = FRENPET_JSON.abi;

const rpcClient = createPublicClient({
  chain: { id: 11155931 },
  transport: http('https://testnet.riselabs.xyz'),
});

async function main() {
  console.log('🐾 Testing FrenPet Flow\n');
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
    
    // Step 3: Check initial state
    console.log('\n3️⃣ Checking initial state...');
    const hasPetBefore = await rpcClient.readContract({
      address: FRENPET_ADDRESS,
      abi: FRENPET_ABI,
      functionName: 'hasPet',
      args: [account.address],
    });
    console.log('   Has pet (before):', hasPetBefore);
    
    // Step 4: Setup delegation
    console.log('\n4️⃣ Setting up delegation...');
    const prepareResponse = await prepareUpgradeAccount(account);
    await upgradeAccount(account, prepareResponse);
    console.log('   ✅ Delegation stored');
    
    // Step 5: Create pet
    console.log('\n5️⃣ Creating pet...');
    const petName = `TestPet_${Date.now()}`;
    const createData = encodeFunctionData({
      abi: FRENPET_ABI,
      functionName: 'createPet',
      args: [petName]
    });
    
    const createResult = await sendTransaction(account, FRENPET_ADDRESS, createData);
    console.log('   ✅ Pet created!');
    console.log('   Bundle ID:', createResult.bundleId.slice(0, 20) + '...');
    
    // Step 6: Check pet exists (wait a bit for confirmation)
    console.log('\n6️⃣ Verifying pet creation...');
    console.log('   Waiting for confirmation...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const hasPetAfter = await rpcClient.readContract({
      address: FRENPET_ADDRESS,
      abi: FRENPET_ABI,
      functionName: 'hasPet',
      args: [account.address],
    });
    console.log('   Has pet (after):', hasPetAfter);
    
    if (hasPetAfter) {
      const stats = await rpcClient.readContract({
        address: FRENPET_ADDRESS,
        abi: FRENPET_ABI,
        functionName: 'getPetStats',
        args: [account.address],
      });
      console.log('   Pet name:', stats[0]);
      console.log('   Level:', stats[1].toString());
      console.log('   Happiness:', stats[3].toString());
      console.log('   Hunger:', stats[4].toString());
      
      // Step 7: Feed pet
      console.log('\n7️⃣ Feeding pet...');
      const feedData = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'feedPet',
        args: []
      });
      
      const feedResult = await sendTransaction(account, FRENPET_ADDRESS, feedData);
      console.log('   ✅ Pet fed!');
      
      // Step 8: Play with pet
      console.log('\n8️⃣ Playing with pet...');
      const playData = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'playWithPet',
        args: []
      });
      
      const playResult = await sendTransaction(account, FRENPET_ADDRESS, playData);
      console.log('   ✅ Played with pet!');
    }
    
    // Check final balance
    console.log('\n9️⃣ Final checks...');
    const balance = await rpcClient.getBalance({ address: account.address });
    console.log('   Balance:', balance.toString(), 'wei');
    console.log('   Gasless:', balance === 0n ? '✅ Yes!' : '❌ No');
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ FrenPet flow test successful!');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

main().catch(console.error);