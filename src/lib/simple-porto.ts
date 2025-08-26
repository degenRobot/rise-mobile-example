/**
 * Simple Porto Relay Functions
 * Direct mappings to Porto relay API - no abstractions
 */

import { privateKeyToAccount, generatePrivateKey, type PrivateKeyAccount } from 'viem/accounts';
import type { Hex, Address } from 'viem';

// Configuration
export const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  chainId: 11155931,
  proxy: '0x894C14A66508D221A219Dd0064b4A6718d0AAA52' as Address, // delegation_proxy (UPDATED!)
  orchestrator: '0xa4D0537eEAB875C9a880580f38862C1f946bFc1c' as Address, // orchestrator (UPDATED!)
  ethAddress: '0x0000000000000000000000000000000000000000' as Address, // ETH for gasless
};

/**
 * Make a JSON-RPC call to Porto relay
 * Simple fetch without AbortController - matches working external/mobile-demo pattern
 */
export async function relayCall(method: string, params: any[]): Promise<any> {
  const requestId = Math.floor(Math.random() * 10000);
  
  const response = await fetch(PORTO_CONFIG.relayUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  return result;
}

/**
 * Serialize public key for Porto (pads address to 64 bytes)
 */
export function serializePublicKey(address: string): string {
  const cleanAddress = address.toLowerCase();
  if (cleanAddress.length < 66) {
    const withoutPrefix = cleanAddress.slice(2);
    const padded = withoutPrefix.padStart(64, '0');
    return '0x' + padded;
  }
  return cleanAddress;
}

/**
 * Check Porto health
 */
export async function checkHealth(): Promise<string> {
  const response = await relayCall('health', []);
  return response.result;
}

/**
 * Prepare account delegation (EIP-7702)
 * This sets up the delegation that will be deployed on first transaction
 */
export async function prepareUpgradeAccount(
  account: PrivateKeyAccount,
  sessionKey?: PrivateKeyAccount
): Promise<{
  digests: { auth: Hex; exec: Hex };
  context: any;
}> {
  const params = {
    address: account.address,
    delegation: PORTO_CONFIG.proxy,
    capabilities: {
      authorizeKeys: sessionKey ? [{
        expiry: '0x0', // Never expires for demo
        prehash: false,
        publicKey: serializePublicKey(sessionKey.address),
        role: 'session',
        type: 'secp256k1',
        permissions: []
      }] : []
    },
    chainId: PORTO_CONFIG.chainId
  };

  const response = await relayCall('wallet_prepareUpgradeAccount', [params]);
  return response.result;
}

/**
 * Store account delegation in relay
 */
export async function upgradeAccount(
  account: PrivateKeyAccount,
  prepareResponse: any
): Promise<void> {
  // Sign the digests
  const authSig = await account.sign({ hash: prepareResponse.digests.auth });
  const execSig = await account.sign({ hash: prepareResponse.digests.exec });

  await relayCall('wallet_upgradeAccount', [{
    context: prepareResponse.context,
    signatures: { auth: authSig, exec: execSig }
  }]);
}

/**
 * Prepare transaction calls
 */
export async function prepareCalls(
  account: PrivateKeyAccount,
  calls: Array<{ to: Address | string; data: Hex; value: Hex }>
): Promise<{
  digest: Hex;
  context: any;
}> {
  // Make sure addresses are lowercase for Porto
  const formattedCalls = calls.map(call => ({
    ...call,
    to: call.to.toLowerCase() as Address
  }));
  
  const params = {
    from: account.address,
    chainId: PORTO_CONFIG.chainId,
    calls: formattedCalls,
    capabilities: {
      meta: {
        feeToken: PORTO_CONFIG.ethAddress // For gasless
      }
    }
  };

  // Include key in the request like the working test
  const response = await relayCall('wallet_prepareCalls', [{
    ...params,
    key: {
      prehash: false,
      publicKey: serializePublicKey(account.address),
      type: 'secp256k1'
    }
  }]);
  return response.result;
}

/**
 * Send prepared calls to relay
 */
export async function sendPreparedCalls(
  account: PrivateKeyAccount,
  prepareResult: any
): Promise<{ id: string }> {
  const signature = await account.sign({ hash: prepareResult.digest });

  const response = await relayCall('wallet_sendPreparedCalls', [{
    context: prepareResult.context,
    key: {
      prehash: false,
      publicKey: serializePublicKey(account.address),
      type: 'secp256k1'
    },
    signature
  }]);
  
  // response.result should have the bundle ID
  // It might be { id: string } or just a string
  if (typeof response.result === 'string') {
    return { id: response.result };
  }
  return response.result;
}

/**
 * Get transaction status
 */
export async function getCallsStatus(bundleId: string): Promise<any> {
  const response = await relayCall('wallet_getCallsStatus', [bundleId]);
  return response.result;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  bundleId: string,
  maxAttempts: number = 30
): Promise<any> {
  let attempts = 0;
  
  while (attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const status = await getCallsStatus(bundleId);
    if (status.status === 200 || status.status === 'success') {
      return status;
    }
    
    attempts++;
  }
  
  throw new Error('Transaction timeout');
}

/**
 * Complete flow: Setup delegation and send transaction
 * This is what most apps will use
 */
export async function sendTransaction(
  account: PrivateKeyAccount,
  to: Address,
  data: Hex,
  value: Hex = '0x0'
): Promise<{ bundleId: string; status: any }> {
  // Prepare the transaction
  const prepareResult = await prepareCalls(account, [{
    to,
    data,
    value
  }]);

  // Send it
  const sendResult = await sendPreparedCalls(account, prepareResult);

  // Wait for confirmation
  const status = await waitForTransaction(sendResult.id);

  return {
    bundleId: sendResult.id,
    status
  };
}

/**
 * Helper: Generate a new account
 */
export function generateAccount(): PrivateKeyAccount {
  const privateKey = generatePrivateKey();
  return privateKeyToAccount(privateKey);
}

/**
 * Helper: Create account from private key
 */
export function createAccount(privateKey: Hex): PrivateKeyAccount {
  return privateKeyToAccount(privateKey);
}