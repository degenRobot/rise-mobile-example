import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { type Hex } from 'viem';
import type {
  PortoCall,
  PortoKey,
  PrepareCallsRequest,
  PrepareCallsResponse,
  SendPreparedCallsRequest,
  TransactionStatus,
  PrepareUpgradeRequest,
  PrepareUpgradeResponse,
  UpgradeAccountRequest,
} from './types';
import { PORTO_CONFIG } from '../../config/constants';

export class PortoClient {
  private account: PrivateKeyAccount | null = null;
  private relayUrl: string;
  private chainId: number;

  constructor(relayUrl: string = PORTO_CONFIG.relayUrl, chainId: number = PORTO_CONFIG.chainId) {
    this.relayUrl = relayUrl;
    this.chainId = chainId;
  }

  async init(privateKey: string) {
    this.account = privateKeyToAccount(privateKey as Hex);
    console.log('[Porto] Initialized with account:', this.account.address);
  }

  private serializePublicKey(address: string): string {
    // Porto expects padded 32-byte public key
    // Using viem's pad function equivalent
    const cleanAddress = address.toLowerCase();
    if (cleanAddress.length < 66) { // If less than 32 bytes (0x + 64 chars)
      // Pad to 32 bytes
      const withoutPrefix = cleanAddress.slice(2);
      const padded = withoutPrefix.padStart(64, '0');
      return '0x' + padded;
    }
    return cleanAddress;
  }

  private async rpcCall(method: string, params: any[]): Promise<any> {
    const response = await fetch(this.relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Math.floor(Math.random() * 10000),
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error.message || 'RPC call failed');
    }
    return result.result;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const result = await this.rpcCall('health', []);
      return result === 'healthy';
    } catch {
      return false;
    }
  }

  async getCapabilities(address?: string): Promise<any> {
    const params = address ? [address] : [];
    return await this.rpcCall('wallet_getCapabilities', params);
  }

  async setupDelegation(adminKeyAddress?: string): Promise<boolean> {
    if (!this.account) throw new Error('Client not initialized');

    try {
      const authorizeKeys: PortoKey[] = [];
      if (adminKeyAddress) {
        authorizeKeys.push({
          expiry: '0x0',
          prehash: false,
          publicKey: this.serializePublicKey(adminKeyAddress),
          role: 'admin',
          type: 'secp256k1',
          permissions: []
        });
      }

      const prepareRequest: PrepareUpgradeRequest = {
        address: this.account.address,
        delegation: PORTO_CONFIG.contracts.proxy,
        capabilities: { authorizeKeys },
        chainId: this.chainId
      };

      const prepareResponse: PrepareUpgradeResponse = await this.rpcCall(
        'wallet_prepareUpgradeAccount',
        [prepareRequest]
      );

      const authSig = await this.account.sign({ hash: prepareResponse.digests.auth as Hex });
      const execSig = await this.account.sign({ hash: prepareResponse.digests.exec as Hex });

      const upgradeRequest: UpgradeAccountRequest = {
        context: prepareResponse.context,
        signatures: {
          auth: authSig,
          exec: execSig
        }
      };

      await this.rpcCall('wallet_upgradeAccount', [upgradeRequest]);
      console.log('[Porto] Delegation setup complete');
      return true;
    } catch (error) {
      console.error('[Porto] Delegation setup failed:', error);
      return false;
    }
  }

  async prepareCalls(calls: PortoCall[]): Promise<PrepareCallsResponse> {
    if (!this.account) throw new Error('Client not initialized');

    const request: PrepareCallsRequest = {
      from: this.account.address,
      chainId: this.chainId,
      calls,
      capabilities: {
        meta: {
          feeToken: '0x0000000000000000000000000000000000000000'
        }
      },
      key: {
        prehash: false,
        publicKey: this.serializePublicKey(this.account.address),
        type: 'secp256k1'
      }
    };

    return await this.rpcCall('wallet_prepareCalls', [request]);
  }

  async sendPreparedCalls(
    context: any,
    digest: string
  ): Promise<string> {
    if (!this.account) throw new Error('Client not initialized');

    const signature = await this.account.sign({ hash: digest as Hex });

    const request: SendPreparedCallsRequest = {
      context,
      key: {
        prehash: false,
        publicKey: this.serializePublicKey(this.account.address),
        type: 'secp256k1'
      },
      signature,
    };

    const response = await this.rpcCall('wallet_sendPreparedCalls', [request]);
    return response.id || response;
  }

  async getCallsStatus(bundleId: string): Promise<TransactionStatus> {
    return await this.rpcCall('wallet_getCallsStatus', [bundleId]);
  }

  async executeTransaction(
    to: string,
    data: string,
    value: string = '0x0'
  ): Promise<{ bundleId: string; status?: TransactionStatus }> {
    const prepareResult = await this.prepareCalls([{ to, data, value }]);
    const bundleId = await this.sendPreparedCalls(prepareResult.context, prepareResult.digest);
    
    let status;
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      status = await this.getCallsStatus(bundleId);
    } catch (error) {
      console.log('[Porto] Status check failed (may be too early)');
    }

    return { bundleId, status };
  }

  async waitForTransaction(
    bundleId: string,
    maxAttempts: number = 30,
    delayMs: number = 2000
  ): Promise<TransactionStatus> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.getCallsStatus(bundleId);
        if (status.status === 200 || status.status === 1) {
          return status;
        }
        if (status.status >= 400) {
          throw new Error(`Transaction failed with status ${status.status}`);
        }
      } catch (error) {
        if (i === maxAttempts - 1) throw error;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
    throw new Error('Transaction timeout');
  }

  getAddress(): string | null {
    return this.account?.address || null;
  }

  isReady(): boolean {
    return this.account !== null;
  }
}