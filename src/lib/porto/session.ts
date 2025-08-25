import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import * as SecureStore from 'expo-secure-store';
import { PortoClient } from './client';

const MAIN_WALLET_KEY = 'RISE_MAIN_WALLET';
const SESSION_KEY = 'RISE_SESSION_KEY';
const SESSION_EXPIRY = 'RISE_SESSION_EXPIRY';

export interface SessionConfig {
  expiryHours: number;
  autoRenew: boolean;
}

export class SessionManager {
  private mainAccount: PrivateKeyAccount | null = null;
  private sessionAccount: PrivateKeyAccount | null = null;
  private portoClient: PortoClient;
  private sessionExpiry: number = 0;
  private config: SessionConfig = {
    expiryHours: 24,
    autoRenew: true
  };

  constructor(portoClient: PortoClient) {
    this.portoClient = portoClient;
  }

  async initMainWallet(): Promise<string> {
    let privateKey = await SecureStore.getItemAsync(MAIN_WALLET_KEY);
    
    if (!privateKey) {
      privateKey = generatePrivateKey();
      await SecureStore.setItemAsync(MAIN_WALLET_KEY, privateKey);
      console.log('[Session] Generated new main wallet');
    }
    
    this.mainAccount = privateKeyToAccount(privateKey as `0x${string}`);
    await this.portoClient.init(privateKey);
    console.log('[Session] Main wallet initialized:', this.mainAccount.address);
    
    return this.mainAccount.address;
  }

  async createSessionKey(): Promise<string> {
    const existingKey = await SecureStore.getItemAsync(SESSION_KEY);
    const existingExpiry = await SecureStore.getItemAsync(SESSION_EXPIRY);
    
    if (existingKey && existingExpiry) {
      const expiry = parseInt(existingExpiry);
      if (Date.now() < expiry) {
        this.sessionAccount = privateKeyToAccount(existingKey as `0x${string}`);
        this.sessionExpiry = expiry;
        console.log('[Session] Using existing session key');
        return this.sessionAccount.address;
      }
    }
    
    const sessionPrivateKey = generatePrivateKey();
    this.sessionAccount = privateKeyToAccount(sessionPrivateKey);
    this.sessionExpiry = Date.now() + (this.config.expiryHours * 60 * 60 * 1000);
    
    await SecureStore.setItemAsync(SESSION_KEY, sessionPrivateKey);
    await SecureStore.setItemAsync(SESSION_EXPIRY, this.sessionExpiry.toString());
    
    console.log('[Session] Created new session key:', this.sessionAccount.address);
    
    // Setup delegation with session key
    await this.portoClient.setupDelegation(this.sessionAccount.address);
    
    return this.sessionAccount.address;
  }

  async clearSession(): Promise<void> {
    await SecureStore.deleteItemAsync(SESSION_KEY);
    await SecureStore.deleteItemAsync(SESSION_EXPIRY);
    this.sessionAccount = null;
    this.sessionExpiry = 0;
    console.log('[Session] Session cleared');
  }

  async resetAll(): Promise<void> {
    await SecureStore.deleteItemAsync(MAIN_WALLET_KEY);
    await this.clearSession();
    this.mainAccount = null;
    console.log('[Session] All data reset');
  }

  updateConfig(config: Partial<SessionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): SessionConfig {
    return { ...this.config };
  }

  getMainAddress(): string | null {
    return this.mainAccount?.address || null;
  }

  getSessionAddress(): string | null {
    return this.sessionAccount?.address || null;
  }

  getSessionExpiry(): Date | null {
    return this.sessionExpiry ? new Date(this.sessionExpiry) : null;
  }

  isSessionValid(): boolean {
    return this.sessionExpiry > Date.now();
  }

  getTimeRemaining(): number {
    return Math.max(0, this.sessionExpiry - Date.now());
  }
}