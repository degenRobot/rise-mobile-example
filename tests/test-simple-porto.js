#!/usr/bin/env node

/**
 * Test simple-porto functions directly
 */

import { checkHealth, generateAccount, prepareUpgradeAccount } from '../src/lib/simple-porto.ts';

async function testHealth() {
  console.log('Testing health check...');
  try {
    const health = await checkHealth();
    console.log('✅ Health check result:', health);
    return health === 'healthy';
  } catch (error) {
    console.error('❌ Health check failed:', error.message);
    return false;
  }
}

async function testPrepareUpgrade() {
  console.log('\nTesting prepareUpgradeAccount...');
  try {
    const account = generateAccount();
    console.log('Generated account:', account.address);
    
    const result = await prepareUpgradeAccount(account);
    console.log('✅ Prepare upgrade result:', {
      hasAuthDigest: !!result.digests?.auth,
      hasExecDigest: !!result.digests?.exec,
      hasContext: !!result.context
    });
    return true;
  } catch (error) {
    console.error('❌ Prepare upgrade failed:', error.message);
    return false;
  }
}

async function main() {
  console.log('🧪 Testing Simple Porto Functions\n');
  console.log('=' .repeat(60));
  
  const results = [];
  
  results.push(await testHealth());
  results.push(await testPrepareUpgrade());
  
  console.log('\n' + '=' .repeat(60));
  const passed = results.filter(r => r).length;
  console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);
  
  if (passed === results.length) {
    console.log('✅ All tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);