#!/usr/bin/env node

/**
 * Debug why pet creation isn't working
 */

import { 
  checkHealth,
  generateAccount,
  prepareUpgradeAccount,
  upgradeAccount,
  prepareCalls,
  sendPreparedCalls,
  waitForTransaction,
  getCallsStatus
} from '../src/lib/simple-porto.ts';
import { encodeFunctionData, createPublicClient, http, decodeFunctionData } from 'viem';
import fs from 'fs';

const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25';
const FRENPET_JSON = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));
const FRENPET_ABI = FRENPET_JSON.abi;

const rpcClient = createPublicClient({
  chain: { id: 11155931 },
  transport: http('https://testnet.riselabs.xyz'),
});

async function main() {
  console.log('🔍 Debug Pet Creation\n');
  console.log('=' .repeat(60));
  
  try {
    // Step 1: Generate account
    console.log('1️⃣ Generating account...');
    const account = generateAccount();
    console.log('   Account:', account.address);
    
    // Step 2: Setup delegation
    console.log('\n2️⃣ Setting up delegation...');
    const prepareResponse = await prepareUpgradeAccount(account);
    await upgradeAccount(account, prepareResponse);
    console.log('   ✅ Delegation stored');
    
    // Step 3: Prepare pet creation
    console.log('\n3️⃣ Preparing pet creation...');
    const petName = `DebugPet_${Date.now()}`;
    console.log('   Pet name:', petName);
    console.log('   Contract address:', FRENPET_ADDRESS);
    console.log('   Contract address (lowercase):', FRENPET_ADDRESS.toLowerCase());
    
    const createData = encodeFunctionData({
      abi: FRENPET_ABI,
      functionName: 'createPet',
      args: [petName]
    });
    console.log('   Encoded data:', createData);
    console.log('   Data length:', createData.length);
    
    // Decode to verify
    try {
      const decoded = decodeFunctionData({
        abi: FRENPET_ABI,
        data: createData
      });
      console.log('   Decoded function:', decoded.functionName);
      console.log('   Decoded args:', decoded.args);
    } catch (e) {
      console.log('   Failed to decode:', e.message);
    }
    
    // Step 4: Prepare calls
    console.log('\n4️⃣ Preparing transaction...');
    const prepareResult = await prepareCalls(account, [{
      to: FRENPET_ADDRESS,
      data: createData,
      value: '0x0'
    }]);
    
    console.log('   Digest:', prepareResult.digest);
    console.log('   Context keys:', Object.keys(prepareResult.context));
    
    // Check the prepared transaction details
    if (prepareResult.context?.quote?.intent) {
      const intent = prepareResult.context.quote.intent;
      console.log('   Intent details:');
      console.log('     - Sender:', intent.sender);
      console.log('     - Calls count:', intent.calls?.length || 0);
      if (intent.calls && intent.calls[0]) {
        console.log('     - Call to:', intent.calls[0].to);
        console.log('     - Call data length:', intent.calls[0].data?.length);
        console.log('     - Call value:', intent.calls[0].value);
      }
    }
    
    // Step 5: Send transaction
    console.log('\n5️⃣ Sending transaction...');
    const sendResult = await sendPreparedCalls(account, prepareResult);
    console.log('   Bundle ID:', sendResult.id);
    
    // Step 6: Wait and check status
    console.log('\n6️⃣ Checking transaction status...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const status = await getCallsStatus(sendResult.id);
    console.log('   Status code:', status.status);
    
    if (status.receipts && status.receipts[0]) {
      const receipt = status.receipts[0];
      console.log('   Receipt:');
      console.log('     - Status:', receipt.status === '0x1' ? '✅ Success' : '❌ Failed');
      console.log('     - To:', receipt.to);
      console.log('     - From:', receipt.from);
      console.log('     - Gas used:', receipt.gasUsed);
      console.log('     - Logs count:', receipt.logs?.length || 0);
      
      if (receipt.logs && receipt.logs.length > 0) {
        console.log('   Transaction logs:');
        receipt.logs.forEach((log, i) => {
          console.log(`     Log ${i}:`);
          console.log(`       - Address: ${log.address}`);
          console.log(`       - Topics: ${log.topics?.length || 0}`);
        });
      }
    }
    
    // Step 7: Check if pet was created
    console.log('\n7️⃣ Checking if pet exists...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const hasPet = await rpcClient.readContract({
      address: FRENPET_ADDRESS,
      abi: FRENPET_ABI,
      functionName: 'hasPet',
      args: [account.address],
    });
    console.log('   Has pet:', hasPet ? '✅ Yes' : '❌ No');
    
    // Check account code
    const code = await rpcClient.getCode({ address: account.address });
    console.log('   Account has code:', code && code !== '0x' ? '✅ Yes' : '❌ No');
    
    // Get balance
    const balance = await rpcClient.getBalance({ address: account.address });
    console.log('   Balance:', balance.toString(), 'wei');
    
    console.log('\n' + '=' .repeat(60));
    if (!hasPet) {
      console.log('❌ Pet creation failed despite successful transaction!');
      console.log('   This suggests the transaction executed but the call to FrenPet failed');
      console.log('   Possible issues:');
      console.log('   1. Contract address mismatch');
      console.log('   2. Delegation not properly configured');
      console.log('   3. Contract call reverting silently');
    } else {
      console.log('✅ Pet created successfully!');
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

main().catch(console.error);