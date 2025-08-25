import { SessionManager, SessionConfig } from '../session';
import { PortoClient } from '../client';
import * as SecureStore from 'expo-secure-store';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Mock dependencies
jest.mock('viem/accounts');
jest.mock('../client');

describe('SessionManager', () => {
  let sessionManager: SessionManager;
  let mockPortoClient: jest.Mocked<PortoClient>;
  
  beforeEach(() => {
    mockPortoClient = new PortoClient() as jest.Mocked<PortoClient>;
    mockPortoClient.init = jest.fn();
    mockPortoClient.setupDelegation = jest.fn().mockResolvedValue(true);
    
    sessionManager = new SessionManager(mockPortoClient);
    
    // Mock secure store
    (SecureStore.getItemAsync as jest.Mock).mockClear();
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    (SecureStore.deleteItemAsync as jest.Mock).mockClear();
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    
    // Mock viem functions
    (generatePrivateKey as jest.Mock).mockClear();
    (privateKeyToAccount as jest.Mock).mockClear();
    (generatePrivateKey as jest.Mock).mockReturnValue('0xgeneratedkey');
    (privateKeyToAccount as jest.Mock).mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
    });
  });

  describe('initMainWallet', () => {
    it('should generate new wallet if none exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      const address = await sessionManager.initMainWallet();
      
      expect(generatePrivateKey).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_MAIN_WALLET',
        '0xgeneratedkey'
      );
      expect(mockPortoClient.init).toHaveBeenCalledWith('0xgeneratedkey');
      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should use existing wallet if available', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('0xexistingkey');
      
      const address = await sessionManager.initMainWallet();
      
      expect(generatePrivateKey).not.toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(mockPortoClient.init).toHaveBeenCalledWith('0xexistingkey');
      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('createSessionKey', () => {
    it('should create new session key if none exists', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      const address = await sessionManager.createSessionKey();
      
      expect(generatePrivateKey).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xgeneratedkey'
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_EXPIRY',
        expect.any(String)
      );
      expect(mockPortoClient.setupDelegation).toHaveBeenCalledWith(
        '0x1234567890123456789012345678901234567890'
      );
      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should use existing session key if not expired', async () => {
      const futureExpiry = Date.now() + 1000000;
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('0xexistingkey') // Session key
        .mockResolvedValueOnce(futureExpiry.toString()); // Expiry
      
      const address = await sessionManager.createSessionKey();
      
      expect(generatePrivateKey).not.toHaveBeenCalled();
      expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should create new session key if expired', async () => {
      const pastExpiry = Date.now() - 1000000;
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('0xoldkey') // Session key
        .mockResolvedValueOnce(pastExpiry.toString()); // Expired
      
      const address = await sessionManager.createSessionKey();
      
      expect(generatePrivateKey).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xgeneratedkey'
      );
      expect(address).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('clearSession', () => {
    it('should clear session data', async () => {
      await sessionManager.clearSession();
      
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_KEY');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_EXPIRY');
      expect(sessionManager.getSessionAddress()).toBeNull();
    });
  });

  describe('resetAll', () => {
    it('should reset all wallet data', async () => {
      await sessionManager.resetAll();
      
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_MAIN_WALLET');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_KEY');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_EXPIRY');
      expect(sessionManager.getMainAddress()).toBeNull();
      expect(sessionManager.getSessionAddress()).toBeNull();
    });
  });

  describe('configuration', () => {
    it('should update config', () => {
      const newConfig: Partial<SessionConfig> = {
        expiryHours: 48,
        autoRenew: false,
      };
      
      sessionManager.updateConfig(newConfig);
      const config = sessionManager.getConfig();
      
      expect(config.expiryHours).toBe(48);
      expect(config.autoRenew).toBe(false);
    });

    it('should return default config', () => {
      const config = sessionManager.getConfig();
      
      expect(config.expiryHours).toBe(24);
      expect(config.autoRenew).toBe(true);
    });
  });

  describe('session validation', () => {
    it('should validate session expiry', async () => {
      // Create session with short expiry
      sessionManager.updateConfig({ expiryHours: 0.001 }); // Very short
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      await sessionManager.createSessionKey();
      
      // Session should be valid initially
      expect(sessionManager.isSessionValid()).toBe(true);
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Session should be expired
      expect(sessionManager.isSessionValid()).toBe(false);
    });

    it('should calculate time remaining', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      await sessionManager.createSessionKey();
      const remaining = sessionManager.getTimeRemaining();
      
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(24 * 60 * 60 * 1000); // 24 hours
    });
  });

  describe('getters', () => {
    it('should return null when not initialized', () => {
      expect(sessionManager.getMainAddress()).toBeNull();
      expect(sessionManager.getSessionAddress()).toBeNull();
      expect(sessionManager.getSessionExpiry()).toBeNull();
    });

    it('should return addresses after initialization', async () => {
      (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
      
      await sessionManager.initMainWallet();
      await sessionManager.createSessionKey();
      
      expect(sessionManager.getMainAddress()).toBe('0x1234567890123456789012345678901234567890');
      expect(sessionManager.getSessionAddress()).toBe('0x1234567890123456789012345678901234567890');
      expect(sessionManager.getSessionExpiry()).toBeInstanceOf(Date);
    });
  });
});