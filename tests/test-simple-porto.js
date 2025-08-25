/**
 * Test the simplified Porto module
 */

import { 
  checkHealth, 
  prepareUpgradeAccount,
  upgradeAccount,
  sendTransaction,
  generateAccount,
  PORTO_CONFIG
} from './lib/simple-porto.js';
import { encodeFunctionData, createPublicClient, http } from 'viem';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FrenPetABI = JSON.parse(readFileSync(join(__dirname, '../src/abi/FrenPetSimple.json'), 'utf8'));

// FrenPet contract
const FRENPET_ADDRESS = '0xc73341541Ad7910c31e54EFf5f1FfD893C78Cf90';

async function test() {
  console.log('🧪 Testing Simplified Porto Module');
  console.log('=' .repeat(50));
  
  try {
    // 1. Check health
    console.log('\n1️⃣ Checking Porto health...');
    const health = await checkHealth();
    console.log('   ✅ Porto is healthy:', health);
    
    // 2. Generate account
    console.log('\n2️⃣ Generating test account...');
    const account = generateAccount();
    console.log('   📝 Address:', account.address);
    
    // 3. Setup delegation (optional - will be done automatically on first tx)
    console.log('\n3️⃣ Setting up delegation...');
    try {
      const prepareResponse = await prepareUpgradeAccount(account);
      await upgradeAccount(account, prepareResponse);
      console.log('   ✅ Delegation stored in relay');
    } catch (error) {
      console.log('   ⚠️  Delegation setup failed (may already exist):', error.message);
    }
    
    // 4. Send a transaction
    console.log('\n4️⃣ Sending transaction...');
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
      }
    } catch (error) {
      console.log('   ❌ Transaction failed:', error.message);
    }
    
    // 5. Check balance (should still be 0)
    console.log('\n5️⃣ Checking balance...');
    const client = createPublicClient({
      chain: { id: PORTO_CONFIG.chainId },
      transport: http('https://testnet.riselabs.xyz'),
    });
    
    const balance = await client.getBalance({ address: account.address });
    console.log('   💰 Balance:', balance.toString(), 'wei');
    console.log('   Gasless:', balance === 0n ? '✅ Yes' : '❌ No');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
  
  console.log('\n' + '=' .repeat(50));
  console.log('✅ Test complete!');
}

// Run the test
test().catch(console.error);