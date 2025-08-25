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
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4' as Address, // delegation_proxy
  orchestrator: '0x046832405512d508b873e65174e51613291083bc' as Address, // orchestrator
  ethAddress: '0x0000000000000000000000000000000000000000' as Address, // ETH for gasless
};

/**
 * Make a JSON-RPC call to Porto relay
 */
export async function relayCall(method: string, params: any[]): Promise<any> {
  const response = await fetch(PORTO_CONFIG.relayUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method,
      params,
      id: Date.now(),
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${data.error.message}`);
  }
  return data.result;
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
  return await relayCall('health', []);
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

  return await relayCall('wallet_prepareUpgradeAccount', [params]);
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
  calls: Array<{ to: Address; data: Hex; value: Hex }>
): Promise<{
  digest: Hex;
  context: any;
}> {
  const params = {
    from: account.address,
    chainId: PORTO_CONFIG.chainId,
    calls,
    capabilities: {
      meta: {
        feeToken: PORTO_CONFIG.ethAddress // For gasless
      }
    }
  };

  // Include key in the request like the working test
  return await relayCall('wallet_prepareCalls', [{
    ...params,
    key: {
      prehash: false,
      publicKey: serializePublicKey(account.address),
      type: 'secp256k1'
    }
  }]);
}

/**
 * Send prepared calls to relay
 */
export async function sendPreparedCalls(
  account: PrivateKeyAccount,
  prepareResult: any
): Promise<{ id: string }> {
  const signature = await account.sign({ hash: prepareResult.digest });

  return await relayCall('wallet_sendPreparedCalls', [{
    context: prepareResult.context,
    signature
  }]);
}

/**
 * Get transaction status
 */
export async function getCallsStatus(bundleId: string): Promise<any> {
  return await relayCall('wallet_getCallsStatus', [bundleId]);
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