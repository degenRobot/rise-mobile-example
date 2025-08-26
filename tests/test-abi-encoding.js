#!/usr/bin/env node

/**
 * Test ABI encoding to ensure it works
 */

import { encodeFunctionData } from 'viem';
import fs from 'fs';

// Load the ABI
const FRENPET_JSON = JSON.parse(fs.readFileSync(new URL('../src/abi/FrenPetSimple.json', import.meta.url)));
const FRENPET_ABI = FRENPET_JSON.abi;

console.log('Testing ABI encoding...\n');

// Check ABI structure
console.log('ABI type:', typeof FRENPET_ABI);
console.log('Is Array?:', Array.isArray(FRENPET_ABI));
console.log('ABI length:', FRENPET_ABI.length);

// Find createPet function
const createPetFunc = FRENPET_ABI.find(item => item.type === 'function' && item.name === 'createPet');
console.log('\ncreatePet function found:', !!createPetFunc);
if (createPetFunc) {
  console.log('createPet inputs:', createPetFunc.inputs);
}

// Test encoding
try {
  const data = encodeFunctionData({
    abi: FRENPET_ABI,
    functionName: 'createPet',
    args: ['TestPet']
  });
  
  console.log('\n✅ Encoding successful!');
  console.log('Encoded data:', data.slice(0, 10) + '...');
  
  // Also test other functions
  const feedData = encodeFunctionData({
    abi: FRENPET_ABI,
    functionName: 'feedPet',
    args: []
  });
  console.log('feedPet encoded:', feedData.slice(0, 10) + '...');
  
  const playData = encodeFunctionData({
    abi: FRENPET_ABI,
    functionName: 'playWithPet',
    args: []
  });
  console.log('playWithPet encoded:', playData.slice(0, 10) + '...');
  
} catch (error) {
  console.error('\n❌ Encoding failed:', error.message);
  process.exit(1);
}

console.log('\n✅ All ABI encoding tests passed!');