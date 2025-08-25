import { PortoClient } from '../client';
import { privateKeyToAccount } from 'viem/accounts';

// Mock viem
jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn(),
}));

describe('PortoClient', () => {
  let client: PortoClient;
  let mockFetch: jest.Mock;
  
  beforeEach(() => {
    client = new PortoClient('https://test-relay.com', 123);
    mockFetch = global.fetch as jest.Mock;
    mockFetch.mockClear();
    
    // Mock privateKeyToAccount
    (privateKeyToAccount as jest.Mock).mockReturnValue({
      address: '0x1234567890123456789012345678901234567890',
      sign: jest.fn().mockResolvedValue('0xsignature'),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('init', () => {
    it('should initialize with a private key', async () => {
      await client.init('0xprivatekey');
      expect(privateKeyToAccount).toHaveBeenCalledWith('0xprivatekey');
      expect(client.getAddress()).toBe('0x1234567890123456789012345678901234567890');
    });
  });

  describe('checkHealth', () => {
    it('should return true when healthy', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: 'healthy' }),
      });

      const result = await client.checkHealth();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-relay.com',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"method":"health"'),
        })
      );
    });

    it('should return false on error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      const result = await client.checkHealth();
      expect(result).toBe(false);
    });
  });

  describe('getCapabilities', () => {
    it('should fetch capabilities', async () => {
      const mockCapabilities = { test: 'capabilities' };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: mockCapabilities }),
      });

      const result = await client.getCapabilities('0xaddress');
      expect(result).toEqual(mockCapabilities);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://test-relay.com',
        expect.objectContaining({
          body: expect.stringContaining('"method":"wallet_getCapabilities"'),
        })
      );
    });
  });

  describe('setupDelegation', () => {
    it('should setup delegation successfully', async () => {
      await client.init('0xprivatekey');
      
      // Mock prepareUpgradeAccount response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            context: { test: 'context' },
            digests: {
              auth: '0xauthdigest',
              exec: '0xexecdigest',
            },
          },
        }),
      });

      // Mock upgradeAccount response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ result: {} }),
      });

      const result = await client.setupDelegation();
      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should return false on error', async () => {
      await client.init('0xprivatekey');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));
      
      const result = await client.setupDelegation();
      expect(result).toBe(false);
    });

    it('should throw error if not initialized', async () => {
      await expect(client.setupDelegation()).rejects.toThrow('Client not initialized');
    });
  });

  describe('executeTransaction', () => {
    it('should execute a transaction successfully', async () => {
      await client.init('0xprivatekey');
      
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

      const result = await client.executeTransaction('0xto', '0xdata', '0x0');
      expect(result.bundleId).toBe('0xbundleid');
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('serializePublicKey', () => {
    it('should pad addresses shorter than 32 bytes', () => {
      const client = new PortoClient();
      const padded = client['serializePublicKey']('0x123');
      expect(padded).toHaveLength(66); // 0x + 64 chars
      expect(padded).toMatch(/^0x0+123$/);
    });

    it('should return address as-is if already 32 bytes', () => {
      const client = new PortoClient();
      const address = '0x' + '1'.repeat(64);
      const result = client['serializePublicKey'](address);
      expect(result).toBe(address.toLowerCase());
    });
  });

  describe('waitForTransaction', () => {
    it('should wait for successful transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: 200, receipts: [{ status: '0x1' }] },
        }),
      });

      const status = await client.waitForTransaction('0xbundleid', 1, 10);
      expect(status.status).toBe(200);
    });

    it('should throw on failed transaction', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: { status: 400 },
        }),
      });

      await expect(
        client.waitForTransaction('0xbundleid', 1, 10)
      ).rejects.toThrow('Transaction failed with status 400');
    });

    it('should throw on timeout', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          result: { status: 0 }, // Pending
        }),
      });

      await expect(
        client.waitForTransaction('0xbundleid', 2, 10)
      ).rejects.toThrow('Transaction timeout');
    });
  });
});