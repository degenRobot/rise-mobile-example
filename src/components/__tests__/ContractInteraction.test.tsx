import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import ContractInteraction from '../ContractInteraction';
import { PortoClient } from '../../lib/porto/client';
import { encodeFunctionData, createPublicClient, http } from 'viem';

// Mock dependencies
jest.mock('viem', () => ({
  encodeFunctionData: jest.fn(),
  createPublicClient: jest.fn(() => ({
    readContract: jest.fn(),
  })),
  http: jest.fn(),
}));

jest.spyOn(Alert, 'alert');

describe('ContractInteraction', () => {
  let mockPortoClient: jest.Mocked<PortoClient>;
  let mockPublicClient: any;
  
  beforeEach(() => {
    mockPortoClient = {
      executeTransaction: jest.fn(),
      waitForTransaction: jest.fn(),
    } as any;
    
    mockPublicClient = {
      readContract: jest.fn(),
    };
    
    (createPublicClient as jest.Mock).mockReturnValue(mockPublicClient);
    (encodeFunctionData as jest.Mock).mockReturnValue('0xencodeddata');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', () => {
    const { getByText, getByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    expect(getByText('Contract Address')).toBeTruthy();
    expect(getByText('Contract ABI (Write Functions)')).toBeTruthy();
    expect(getByText('Functions')).toBeTruthy();
    expect(getByPlaceholderText('0x...')).toBeTruthy();
  });

  it('parses ABI and displays write functions', () => {
    const { getByText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    // Should show write functions
    expect(getByText('createPet()')).toBeTruthy();
    expect(getByText('feedPet()')).toBeTruthy();
    expect(getByText('playWithPet()')).toBeTruthy();
  });

  it('handles ABI parsing errors', () => {
    const { getByText, getByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    const abiInput = getByPlaceholderText('Paste ABI JSON here...');
    const loadButton = getByText('Load ABI');
    
    fireEvent.changeText(abiInput, 'invalid json');
    fireEvent.press(loadButton);
    
    expect(Alert.alert).toHaveBeenCalledWith('Error', 'Invalid ABI JSON');
  });

  it('selects function and shows input fields', () => {
    const { getByText, queryByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    // Select createPet function
    fireEvent.press(getByText('createPet()'));
    
    // Should show input field for name parameter
    expect(getByText('Execute: createPet')).toBeTruthy();
    expect(getByText('name (string)')).toBeTruthy();
    expect(queryByPlaceholderText('Enter string')).toBeTruthy();
  });

  it('executes function successfully', async () => {
    mockPortoClient.executeTransaction.mockResolvedValue({
      bundleId: '0xbundle123',
      status: { status: 200 },
    });
    
    mockPortoClient.waitForTransaction.mockResolvedValue({
      id: '0xbundle123',
      status: 200,
      receipts: [{
        status: '0x1',
        transactionHash: '0xtxhash',
        gasUsed: '0x1000',
        blockNumber: '0x100',
      }],
    });
    
    const { getByText, getByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    // Select and fill createPet function
    fireEvent.press(getByText('createPet()'));
    const nameInput = getByPlaceholderText('Enter string');
    fireEvent.changeText(nameInput, 'TestPet');
    
    // Execute transaction
    const executeButton = getByText('Execute Transaction');
    fireEvent.press(executeButton);
    
    await waitFor(() => {
      expect(mockPortoClient.executeTransaction).toHaveBeenCalledWith(
        expect.any(String), // contract address
        '0xencodeddata',
        '0x0'
      );
    });
    
    await waitFor(() => {
      expect(mockPortoClient.waitForTransaction).toHaveBeenCalledWith('0xbundle123');
    });
  });

  it('handles transaction errors', async () => {
    mockPortoClient.executeTransaction.mockRejectedValue(
      new Error('Transaction failed')
    );
    
    const { getByText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    // Select and execute function
    fireEvent.press(getByText('feedPet()'));
    fireEvent.press(getByText('Execute Transaction'));
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Transaction Failed',
        'Transaction failed'
      );
    });
  });

  it('disables execution when no wallet connected', () => {
    const { getByText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress={null}
      />
    );
    
    fireEvent.press(getByText('feedPet()'));
    
    expect(getByText('Please wait for wallet initialization...')).toBeTruthy();
  });

  it('handles different input types correctly', () => {
    const customAbi = [
      {
        name: 'testFunction',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
          { name: 'amount', type: 'uint256' },
          { name: 'enabled', type: 'bool' },
          { name: 'text', type: 'string' },
        ],
      },
    ];
    
    const { getByText, getByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    // Load custom ABI
    const abiInput = getByPlaceholderText('Paste ABI JSON here...');
    fireEvent.changeText(abiInput, JSON.stringify(customAbi));
    fireEvent.press(getByText('Load ABI'));
    
    // Select function
    fireEvent.press(getByText('testFunction()'));
    
    // Check all input fields are rendered
    expect(getByText('amount (uint256)')).toBeTruthy();
    expect(getByText('enabled (bool)')).toBeTruthy();
    expect(getByText('text (string)')).toBeTruthy();
  });

  it('updates contract address', () => {
    const { getByPlaceholderText } = render(
      <ContractInteraction 
        portoClient={mockPortoClient}
        walletAddress="0x123"
      />
    );
    
    const addressInput = getByPlaceholderText('0x...');
    fireEvent.changeText(addressInput, '0xnewaddress');
    
    expect(addressInput.props.value).toBe('0xnewaddress');
  });
});