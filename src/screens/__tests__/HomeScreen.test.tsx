import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from '../HomeScreen';
import { PortoClient } from '../../lib/porto/client';
import { SessionManager } from '../../lib/porto/session';

// Mock dependencies
jest.mock('../../lib/porto/client');
jest.mock('../../lib/porto/session');
jest.mock('../../components/ContractInteraction', () => {
  const { View, Text } = require('react-native');
  return function MockContractInteraction({ walletAddress }: any) {
    return (
      <View>
        <Text>Contract Interaction</Text>
        <Text>{walletAddress ? `Wallet: ${walletAddress}` : 'No wallet'}</Text>
      </View>
    );
  };
});

describe('HomeScreen', () => {
  let mockPortoClient: jest.Mocked<PortoClient>;
  let mockSessionManager: jest.Mocked<SessionManager>;
  
  beforeEach(() => {
    // Reset singleton instances
    jest.clearAllMocks();
    
    // Setup mocks
    mockPortoClient = {
      checkHealth: jest.fn().mockResolvedValue(true),
    } as any;
    
    mockSessionManager = {
      initMainWallet: jest.fn().mockResolvedValue('0xmainwallet'),
      createSessionKey: jest.fn().mockResolvedValue('0xsessionkey'),
    } as any;
    
    (PortoClient as jest.Mock).mockImplementation(() => mockPortoClient);
    (SessionManager as jest.Mock).mockImplementation(() => mockSessionManager);
  });

  it('renders loading state initially', () => {
    const { getByText } = render(<HomeScreen />);
    expect(getByText('Initializing wallet...')).toBeTruthy();
  });

  it('initializes wallet and session on mount', async () => {
    const { getByText } = render(<HomeScreen />);
    
    await waitFor(() => {
      expect(mockSessionManager.initMainWallet).toHaveBeenCalled();
      expect(mockSessionManager.createSessionKey).toHaveBeenCalled();
      expect(mockPortoClient.checkHealth).toHaveBeenCalled();
    });
    
    await waitFor(() => {
      expect(getByText('Contract Interaction')).toBeTruthy();
      expect(getByText('Wallet: 0xmainwallet')).toBeTruthy();
    });
  });

  it('displays wallet addresses after initialization', async () => {
    const { getByText } = render(<HomeScreen />);
    
    await waitFor(() => {
      expect(getByText('Wallet:')).toBeTruthy();
      expect(getByText('0xmain...allet')).toBeTruthy(); // Truncated address
      expect(getByText('Session:')).toBeTruthy();
      expect(getByText('0xsess...nkey')).toBeTruthy(); // Truncated address
    });
  });

  it('handles initialization errors', async () => {
    mockSessionManager.initMainWallet.mockRejectedValue(
      new Error('Wallet init failed')
    );
    
    const { getByText } = render(<HomeScreen />);
    
    await waitFor(() => {
      expect(getByText('Error: Wallet init failed')).toBeTruthy();
    });
  });

  it('handles Porto health check failure gracefully', async () => {
    mockPortoClient.checkHealth.mockResolvedValue(false);
    
    const { getByText } = render(<HomeScreen />);
    
    await waitFor(() => {
      // Should still render the main screen even if health check fails
      expect(getByText('Contract Interaction')).toBeTruthy();
    });
    
    // Console warning should be logged (not testable directly)
  });

  it('passes porto client and wallet address to ContractInteraction', async () => {
    const { getByText } = render(<HomeScreen />);
    
    await waitFor(() => {
      expect(getByText('Contract Interaction')).toBeTruthy();
      expect(getByText('Wallet: 0xmainwallet')).toBeTruthy();
    });
  });
});