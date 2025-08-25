import { PortoClient } from '../lib/porto/client';
import { SessionManager } from '../lib/porto/session';
import * as SecureStore from 'expo-secure-store';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Mock dependencies
jest.mock('viem/accounts');

describe('Integration Tests', () => {
  let portoClient: PortoClient;
  let sessionManager: SessionManager;
  let mockFetch: jest.Mock;
  
  beforeEach(() => {
    // Setup mocks
    mockFetch = global.fetch as jest.Mock;
    mockFetch.mockClear();
    
    (generatePrivateKey as jest.Mock).mockReturnValue('0xgeneratedkey');
    (privateKeyToAccount as jest.Mock).mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      sign: jest.fn().mockResolvedValue('0xsignature'),
    });
    
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    
    // Create instances
    portoClient = new PortoClient('https://test-relay.com', 123);
    sessionManager = new SessionManager(portoClient);
  });

  describe('Full wallet setup and transaction flow', () => {
    it('should complete full flow from wallet creation to transaction', async () => {
      // Step 1: Initialize main wallet
      const mainAddress = await sessionManager.initMainWallet();
      expect(mainAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_MAIN_WALLET',
        '0xgeneratedkey'
      );
      
      // Step 2: Create session key
      // Mock Porto setupDelegation
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              context: { test: 'context' },
              digests: { auth: '0xauth', exec: '0xexec' },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: {} }),
        });
      
      const sessionAddress = await sessionManager.createSessionKey();
      expect(sessionAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xgeneratedkey'
      );
      
      // Step 3: Execute transaction
      // Mock prepareCalls
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            context: { test: 'context' },
            digest: '0xdigest',
          },
        }),
      });
      
      // Mock sendPreparedCalls
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { id: '0xbundleid' },
        }),
      });
      
      // Mock getCallsStatus
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: 200 },
        }),
      });
      
      const result = await portoClient.executeTransaction(
        '0xcontract',
        '0xdata',
        '0x0'
      );
      
      expect(result.bundleId).toBe('0xbundleid');
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('Session expiry and renewal', () => {
    it('should handle session expiry correctly', async () => {
      // Setup expired session
      const pastExpiry = Date.now() - 1000;
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('0xoldkey') // Session key
        .mockResolvedValueOnce(pastExpiry.toString()) // Expired
        .mockResolvedValue(null); // For new session creation
      
      // Mock Porto setupDelegation for new session
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              context: { test: 'context' },
              digests: { auth: '0xauth', exec: '0xexec' },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: {} }),
        });
      
      // Should create new session
      const sessionAddress = await sessionManager.createSessionKey();
      
      // Verify new session was created
      expect(generatePrivateKey).toHaveBeenCalled();
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xgeneratedkey'
      );
      expect(sessionManager.isSessionValid()).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should handle network errors gracefully', async () => {
      await sessionManager.initMainWallet();
      
      // Mock network error
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      // Should handle error without crashing
      const result = await portoClient.setupDelegation();
      expect(result).toBe(false);
    });
    
    it('should handle Porto relay errors', async () => {
      await portoClient.init('0xprivatekey');
      
      // Mock Porto error response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          error: { message: 'Invalid request' },
        }),
      });
      
      // Should throw with proper error message
      await expect(
        portoClient.executeTransaction('0xto', '0xdata', '0x0')
      ).rejects.toThrow('Invalid request');
    });
  });

  describe('Configuration management', () => {
    it('should apply custom session configuration', async () => {
      // Update configuration
      sessionManager.updateConfig({
        expiryHours: 48,
        autoRenew: false,
      });
      
      const config = sessionManager.getConfig();
      expect(config.expiryHours).toBe(48);
      expect(config.autoRenew).toBe(false);
      
      // Create session with new config
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            result: {
              context: { test: 'context' },
              digests: { auth: '0xauth', exec: '0xexec' },
            },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ result: {} }),
        });
      
      await sessionManager.createSessionKey();
      
      // Check expiry is set according to config
      const timeRemaining = sessionManager.getTimeRemaining();
      expect(timeRemaining).toBeLessThanOrEqual(48 * 60 * 60 * 1000);
      expect(timeRemaining).toBeGreaterThan(47 * 60 * 60 * 1000);
    });
  });
});