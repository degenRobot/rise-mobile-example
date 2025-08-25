import { Porto } from '../porto';
import * as SecureStore from 'expo-secure-store';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

// Mock dependencies
jest.mock('viem/accounts');
jest.mock('viem', () => ({
  createPublicClient: jest.fn(() => ({
    getBalance: jest.fn().mockResolvedValue(0n),
    readContract: jest.fn(),
  })),
  createWalletClient: jest.fn(),
  http: jest.fn(),
  encodeFunctionData: jest.fn(),
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('Porto', () => {
  let porto: Porto;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup mocks
    (generatePrivateKey as jest.Mock).mockReturnValue('0xprivatekey');
    (privateKeyToAccount as jest.Mock).mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      sign: jest.fn().mockResolvedValue('0xsignature'),
    });
    
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
    (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
    
    (global.fetch as jest.Mock).mockResolvedValue({
      json: async () => ({ result: {} }),
    });
    
    porto = new Porto();
  });

  describe('init', () => {
    it('should create new wallet if none exists', async () => {
      const result = await porto.init();
      
      expect(generatePrivateKey).toHaveBeenCalledTimes(2); // main + session
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_MAIN_WALLET',
        '0xprivatekey'
      );
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xprivatekey'
      );
      expect(result.mainAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(result.sessionAddress).toBe('0x1234567890123456789012345678901234567890');
    });

    it('should load existing wallet', async () => {
      (SecureStore.getItemAsync as jest.Mock)
        .mockResolvedValueOnce('0xexistingmain')
        .mockResolvedValueOnce('0xexistingsession')
        .mockResolvedValueOnce((Date.now() + 100000).toString());
      
      const result = await porto.init();
      
      expect(generatePrivateKey).not.toHaveBeenCalled();
      expect(privateKeyToAccount).toHaveBeenCalledWith('0xexistingmain');
      expect(privateKeyToAccount).toHaveBeenCalledWith('0xexistingsession');
    });
  });

  describe('isEOASetup', () => {
    it('should return false if not initialized', async () => {
      const result = await porto.isEOASetup();
      expect(result).toBe(false);
    });

    it('should check capabilities after init', async () => {
      await porto.init();
      
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        json: async () => ({ result: { capabilities: {} } }),
      });
      
      const result = await porto.isEOASetup();
      expect(result).toBe(true);
    });
  });

  describe('sendTransaction', () => {
    it('should send transaction through relay', async () => {
      await porto.init();
      
      // Mock relay responses
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: async () => ({ 
            result: { 
              digest: '0xdigest',
              context: { test: 'context' }
            } 
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ 
            result: { id: '0xbundleid' } 
          }),
        })
        .mockResolvedValueOnce({
          json: async () => ({ 
            result: { status: 200 } 
          }),
        });
      
      const result = await porto.sendTransaction(
        '0xcontract' as any,
        '0xdata' as any
      );
      
      expect(result.bundleId).toBe('0xbundleid');
      expect(result.status.status).toBe(200);
    });
  });

  describe('getWalletInfo', () => {
    it('should return wallet information', async () => {
      await porto.init();
      
      const info = porto.getWalletInfo();
      
      expect(info.mainAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(info.sessionAddress).toBe('0x1234567890123456789012345678901234567890');
      expect(info.isSessionValid).toBe(true);
      expect(info.timeRemaining).toBeGreaterThan(0);
    });
  });

  describe('rotateSessionKey', () => {
    it('should create new session key', async () => {
      await porto.init();
      
      const newAddress = await porto.rotateSessionKey();
      
      expect(generatePrivateKey).toHaveBeenCalledTimes(3); // init main + session + rotate
      expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
        'RISE_SESSION_KEY',
        '0xprivatekey'
      );
      expect(newAddress).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('reset', () => {
    it('should clear all wallet data', async () => {
      await porto.init();
      await porto.reset();
      
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_MAIN_WALLET');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_KEY');
      expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('RISE_SESSION_EXPIRY');
      
      const info = porto.getWalletInfo();
      expect(info.mainAddress).toBeNull();
      expect(info.sessionAddress).toBeNull();
    });
  });
});