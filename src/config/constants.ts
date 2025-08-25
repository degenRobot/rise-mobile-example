export const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  contracts: {
    proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4', // Correct Porto proxy
    orchestrator: '0x046832405512D508b873E65174E51613291083bC',
    frenPetSimple: '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25' // Must be uppercase for relay whitelisting
  }
};

export const RISE_TESTNET = {
  id: 11155931,
  name: 'RISE Testnet',
  rpcUrl: 'https://testnet.riselabs.xyz',
  explorer: 'https://explorer.testnet.riselabs.xyz',
  faucet: 'https://faucet.riselabs.xyz'
};

export const DEFAULT_SESSION_CONFIG = {
  expiryHours: 24,
  autoRenew: true
};

// Import FrenPet ABI from shared location
import FrenPetSimpleJson from '../abi/FrenPetSimple.json';

export const FRENPET_ABI = FrenPetSimpleJson.abi;