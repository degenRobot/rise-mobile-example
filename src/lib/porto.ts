/**
 * Simplified Porto Module
 * A clean interface for Porto relay interactions on RISE
 */

import { 
  createPublicClient, 
  createWalletClient,
  http, 
  encodeFunctionData,
  type Hex,
  type Address
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import * as SecureStore from 'expo-secure-store';

// Configuration
const RISE_TESTNET = {
  id: 11155931,
  name: 'RISE Testnet',
  rpcUrl: 'https://testnet.riselabs.xyz',
};

const PORTO_CONFIG = {
  relayUrl: 'https://rise-testnet-porto.fly.dev',
  proxy: '0xf463d5cbc64916caa2775a8e9b264f8c35f4b8a4' as Address,
  ethAddress: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE' as Address,
};

// Storage keys
const STORAGE_KEYS = {
  MAIN_WALLET: 'RISE_MAIN_WALLET',
  SESSION_KEY: 'RISE_SESSION_KEY',
  SESSION_EXPIRY: 'RISE_SESSION_EXPIRY',
};

/**
 * Porto class - Main interface for Porto relay operations
 */
export class Porto {
  private mainAccount: any = null;
  private sessionAccount: any = null;
  private publicClient: any;
  private sessionExpiry: number = 0;

  constructor() {
    // Initialize public client for RPC reads
    this.publicClient = createPublicClient({
      chain: { 
        id: RISE_TESTNET.id, 
        name: RISE_TESTNET.name, 
        rpcUrls: { default: { http: [RISE_TESTNET.rpcUrl] } } 
      },
      transport: http(RISE_TESTNET.rpcUrl),
    });
  }

  /**
   * Initialize wallet (load existing or create new)
   */
  async init(): Promise<{ mainAddress: Address; sessionAddress: Address }> {
    // Load or create main wallet
    let mainPrivateKey = await SecureStore.getItemAsync(STORAGE_KEYS.MAIN_WALLET);
    if (!mainPrivateKey) {
      mainPrivateKey = generatePrivateKey();
      await SecureStore.setItemAsync(STORAGE_KEYS.MAIN_WALLET, mainPrivateKey);
    }
    this.mainAccount = privateKeyToAccount(mainPrivateKey as Hex);

    // Load or create session key
    let sessionPrivateKey = await SecureStore.getItemAsync(STORAGE_KEYS.SESSION_KEY);
    const storedExpiry = await SecureStore.getItemAsync(STORAGE_KEYS.SESSION_EXPIRY);
    
    // Check if session key exists and is valid
    if (sessionPrivateKey && storedExpiry) {
      this.sessionExpiry = parseInt(storedExpiry);
      if (Date.now() < this.sessionExpiry) {
        // Session still valid
        this.sessionAccount = privateKeyToAccount(sessionPrivateKey as Hex);
      } else {
        // Session expired, create new one
        sessionPrivateKey = null;
      }
    }

    if (!sessionPrivateKey) {
      sessionPrivateKey = generatePrivateKey();
      this.sessionExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours
      await SecureStore.setItemAsync(STORAGE_KEYS.SESSION_KEY, sessionPrivateKey);
      await SecureStore.setItemAsync(STORAGE_KEYS.SESSION_EXPIRY, this.sessionExpiry.toString());
      this.sessionAccount = privateKeyToAccount(sessionPrivateKey as Hex);
    }

    // Setup delegation if needed
    await this.setupDelegation();

    return {
      mainAddress: this.mainAccount.address,
      sessionAddress: this.sessionAccount.address,
    };
  }

  /**
   * Check if EOA is setup with delegation
   */
  async isEOASetup(): Promise<boolean> {
    if (!this.mainAccount) return false;
    
    try {
      // Check if delegation is active by querying capabilities
      const response = await this.relayCall('wallet_getCapabilities', [this.mainAccount.address]);
      return !!response;
    } catch {
      return false;
    }
  }

  /**
   * Get keys associated with EOA from chain via RPC
   */
  async getAssociatedKeys(): Promise<Address[]> {
    if (!this.mainAccount) return [];
    
    try {
      // Query registered keys from relay
      const response = await this.relayCall('wallet_getKeys', [this.mainAccount.address]);
      return response?.keys || [];
    } catch {
      return [];
    }
  }

  /**
   * Setup delegation for gasless transactions
   */
  async setupDelegation(): Promise<boolean> {
    if (!this.mainAccount || !this.sessionAccount) {
      throw new Error('Wallet not initialized');
    }

    try {
      // Check if already setup
      if (await this.isEOASetup()) {
        return true;
      }

      // Prepare delegation with session key
      const prepareParams = {
        address: this.mainAccount.address,
        delegation: PORTO_CONFIG.proxy,
        capabilities: {
          authorizeKeys: [{
            expiry: '0x' + Math.floor(this.sessionExpiry / 1000).toString(16),
            prehash: false,
            publicKey: this.serializePublicKey(this.sessionAccount.address),
            role: 'session',
            type: 'secp256k1',
            permissions: []
          }]
        },
        chainId: RISE_TESTNET.id
      };

      const prepareResponse = await this.relayCall('wallet_prepareUpgradeAccount', [prepareParams]);
      
      // Sign with main account
      const authSig = await this.mainAccount.sign({ hash: prepareResponse.digests.auth });
      const execSig = await this.mainAccount.sign({ hash: prepareResponse.digests.exec });

      // Store delegation
      await this.relayCall('wallet_upgradeAccount', [{
        context: prepareResponse.context,
        signatures: { auth: authSig, exec: execSig }
      }]);

      return true;
    } catch (error) {
      console.error('Failed to setup delegation:', error);
      return false;
    }
  }

  /**
   * Send a transaction through Porto relay
   */
  async sendTransaction(
    to: Address,
    data: Hex,
    value: Hex = '0x0'
  ): Promise<{ bundleId: string; status: any }> {
    if (!this.sessionAccount) {
      throw new Error('Session not initialized');
    }

    // Prepare the call
    const callParams = {
      from: this.mainAccount.address,
      chainId: RISE_TESTNET.id,
      calls: [{
        to,
        data,
        value
      }],
      capabilities: {
        meta: {
          feeToken: PORTO_CONFIG.ethAddress
        }
      },
      key: {
        prehash: false,
        publicKey: this.serializePublicKey(this.sessionAccount.address),
        type: 'secp256k1'
      }
    };

    const prepareResult = await this.relayCall('wallet_prepareCalls', [callParams]);
    
    // Sign with session key
    const signature = await this.sessionAccount.sign({ hash: prepareResult.digest });

    // Send the transaction
    const sendResult = await this.relayCall('wallet_sendPreparedCalls', [{
      context: prepareResult.context,
      signature
    }]);

    // Wait for confirmation
    const bundleId = sendResult.id;
    let attempts = 0;
    let status;
    
    while (attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      status = await this.relayCall('wallet_getCallsStatus', [bundleId]);
      
      if (status.status === 200 || status.status === 'success') {
        break;
      }
      attempts++;
    }

    return { bundleId, status };
  }

  /**
   * Get wallet info
   */
  getWalletInfo() {
    return {
      mainAddress: this.mainAccount?.address || null,
      sessionAddress: this.sessionAccount?.address || null,
      sessionExpiry: new Date(this.sessionExpiry),
      isSessionValid: Date.now() < this.sessionExpiry,
      timeRemaining: Math.max(0, this.sessionExpiry - Date.now()),
    };
  }

  /**
   * Rotate session key
   */
  async rotateSessionKey(): Promise<Address> {
    const newSessionKey = generatePrivateKey();
    this.sessionExpiry = Date.now() + (24 * 60 * 60 * 1000);
    
    await SecureStore.setItemAsync(STORAGE_KEYS.SESSION_KEY, newSessionKey);
    await SecureStore.setItemAsync(STORAGE_KEYS.SESSION_EXPIRY, this.sessionExpiry.toString());
    
    this.sessionAccount = privateKeyToAccount(newSessionKey as Hex);
    await this.setupDelegation();
    
    return this.sessionAccount.address;
  }

  /**
   * Clear all wallet data
   */
  async reset() {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.MAIN_WALLET);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION_KEY);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.SESSION_EXPIRY);
    
    this.mainAccount = null;
    this.sessionAccount = null;
    this.sessionExpiry = 0;
  }

  /**
   * Get balance of main wallet
   */
  async getBalance(): Promise<bigint> {
    if (!this.mainAccount) return 0n;
    return await this.publicClient.getBalance({ address: this.mainAccount.address });
  }

  /**
   * Read from a contract
   */
  async readContract(address: Address, abi: any[], functionName: string, args: any[] = []) {
    return await this.publicClient.readContract({
      address,
      abi,
      functionName,
      args
    });
  }

  // Private helper methods

  private async relayCall(method: string, params: any[]): Promise<any> {
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
      throw new Error(data.error.message || 'Relay call failed');
    }
    return data.result;
  }

  private serializePublicKey(address: string): string {
    const cleanAddress = address.toLowerCase();
    if (cleanAddress.length < 66) {
      const withoutPrefix = cleanAddress.slice(2);
      const padded = withoutPrefix.padStart(64, '0');
      return '0x' + padded;
    }
    return cleanAddress;
  }
}

// Export a singleton instance
export const porto = new Porto();