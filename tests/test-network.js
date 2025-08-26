#!/usr/bin/env node

/**
 * Test network connectivity to Porto relay
 */

async function testDirectFetch() {
  console.log('Testing direct fetch to Porto relay...');
  try {
    const response = await fetch('https://rise-testnet-porto.fly.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'health',
        params: [],
        id: 1,
      }),
    });
    
    const data = await response.json();
    console.log('✅ Success:', data);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function testWithTimeout() {
  console.log('\nTesting with AbortController timeout...');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch('https://rise-testnet-porto.fly.dev', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'health',
        params: [],
        id: 1,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeout);
    
    const data = await response.json();
    console.log('✅ Success with timeout:', data);
    return true;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.error('❌ Request timeout');
    } else {
      console.error('❌ Error:', error.message);
    }
    return false;
  }
}

async function testRiseRPC() {
  console.log('\nTesting RISE RPC...');
  try {
    const response = await fetch('https://testnet.riselabs.xyz', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'eth_chainId',
        params: [],
        id: 1,
      }),
    });
    
    const data = await response.json();
    console.log('✅ ChainId:', data.result);
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return false;
  }
}

async function main() {
  console.log('🔍 Network Connectivity Test\n');
  console.log('=' .repeat(60));
  
  const results = [];
  
  results.push(await testDirectFetch());
  results.push(await testWithTimeout());
  results.push(await testRiseRPC());
  
  console.log('\n' + '=' .repeat(60));
  const passed = results.filter(r => r).length;
  console.log(`\n📊 Results: ${passed}/${results.length} tests passed`);
  
  if (passed === results.length) {
    console.log('✅ All network tests passed!');
  } else {
    console.log('❌ Some tests failed');
    process.exit(1);
  }
}

main().catch(console.error);