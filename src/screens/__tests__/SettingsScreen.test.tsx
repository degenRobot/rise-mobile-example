import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from '../SettingsScreen';
import { SessionManager } from '../../lib/porto/session';
import { PortoClient } from '../../lib/porto/client';

// Mock dependencies
jest.mock('../../lib/porto/client');
jest.mock('../../lib/porto/session');
jest.spyOn(Alert, 'alert');

describe('SettingsScreen', () => {
  let mockSessionManager: jest.Mocked<SessionManager>;
  
  beforeEach(() => {
    jest.clearAllMocks();
    
    mockSessionManager = {
      getConfig: jest.fn().mockReturnValue({
        expiryHours: 24,
        autoRenew: true,
      }),
      getMainAddress: jest.fn().mockReturnValue('0xmainwallet123'),
      getSessionAddress: jest.fn().mockReturnValue('0xsessionkey456'),
      getSessionExpiry: jest.fn().mockReturnValue(new Date(Date.now() + 3600000)),
      getTimeRemaining: jest.fn().mockReturnValue(3600000), // 1 hour
      updateConfig: jest.fn(),
      clearSession: jest.fn(),
      createSessionKey: jest.fn().mockResolvedValue('0xnewsession'),
      resetAll: jest.fn(),
    } as any;
    
    (SessionManager as jest.Mock).mockImplementation(() => mockSessionManager);
    (PortoClient as jest.Mock).mockImplementation(() => ({}));
  });

  it('renders wallet information', () => {
    const { getByText } = render(<SettingsScreen />);
    
    expect(getByText('Wallet Information')).toBeTruthy();
    expect(getByText('Main Wallet:')).toBeTruthy();
    expect(getByText('0xmainwal...llet123')).toBeTruthy();
    expect(getByText('Session Key:')).toBeTruthy();
    expect(getByText('0xsession...key456')).toBeTruthy();
  });

  it('displays session expiry information', () => {
    const { getByText } = render(<SettingsScreen />);
    
    expect(getByText('Session Expires:')).toBeTruthy();
    expect(getByText('Time Remaining:')).toBeTruthy();
    // Time remaining should show approximately 1 hour
    expect(getByText(/\d+h \d+m/)).toBeTruthy();
  });

  it('shows expired session', () => {
    mockSessionManager.getTimeRemaining.mockReturnValue(0);
    
    const { getByText } = render(<SettingsScreen />);
    
    expect(getByText('Expired')).toBeTruthy();
  });

  it('updates session configuration', () => {
    const { getByText, getByDisplayValue } = render(<SettingsScreen />);
    
    const durationInput = getByDisplayValue('24');
    fireEvent.changeText(durationInput, '48');
    
    const updateButton = getByText('Update Configuration');
    fireEvent.press(updateButton);
    
    expect(mockSessionManager.updateConfig).toHaveBeenCalledWith({
      expiryHours: 48,
      autoRenew: true,
    });
    
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Configuration updated');
  });

  it('toggles auto-renew setting', () => {
    const { getByText, getByTestId } = render(<SettingsScreen />);
    
    // Find the switch (might need testID in actual component)
    const autoRenewLabel = getByText('Auto-renew Session:');
    const switchElement = autoRenewLabel.parent?.children.find(
      child => child.type === 'Switch'
    );
    
    if (switchElement) {
      fireEvent(switchElement, 'valueChange', false);
    }
    
    const updateButton = getByText('Update Configuration');
    fireEvent.press(updateButton);
    
    expect(mockSessionManager.updateConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        autoRenew: false,
      })
    );
  });

  it('creates new session', async () => {
    const { getByText } = render(<SettingsScreen />);
    
    const refreshButton = getByText('Create New Session');
    fireEvent.press(refreshButton);
    
    await waitFor(() => {
      expect(mockSessionManager.clearSession).toHaveBeenCalled();
      expect(mockSessionManager.createSessionKey).toHaveBeenCalled();
    });
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'New session created: 0xnewsession'
    );
  });

  it('handles session creation errors', async () => {
    mockSessionManager.createSessionKey.mockRejectedValue(
      new Error('Session creation failed')
    );
    
    const { getByText } = render(<SettingsScreen />);
    
    const refreshButton = getByText('Create New Session');
    fireEvent.press(refreshButton);
    
    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'Session creation failed'
      );
    });
  });

  it('confirms before clearing session', () => {
    const { getByText } = render(<SettingsScreen />);
    
    const clearButton = getByText('Clear Session');
    fireEvent.press(clearButton);
    
    // Check confirmation dialog
    expect(Alert.alert).toHaveBeenCalledWith(
      'Clear Session',
      'Are you sure you want to clear the current session?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Clear' }),
      ])
    );
  });

  it('clears session when confirmed', async () => {
    const { getByText } = render(<SettingsScreen />);
    
    const clearButton = getByText('Clear Session');
    fireEvent.press(clearButton);
    
    // Get the clear action from the alert
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const clearAction = alertCall[2].find((btn: any) => btn.text === 'Clear');
    
    // Execute the clear action
    await clearAction.onPress();
    
    expect(mockSessionManager.clearSession).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('Success', 'Session cleared');
  });

  it('confirms before resetting all data', () => {
    const { getByText } = render(<SettingsScreen />);
    
    const resetButton = getByText('Reset All Data');
    fireEvent.press(resetButton);
    
    expect(Alert.alert).toHaveBeenCalledWith(
      'Reset All Data',
      'This will delete your wallet and all session data. Are you sure?',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Reset' }),
      ])
    );
  });

  it('resets all data when confirmed', async () => {
    const { getByText } = render(<SettingsScreen />);
    
    const resetButton = getByText('Reset All Data');
    fireEvent.press(resetButton);
    
    // Get the reset action from the alert
    const alertCall = (Alert.alert as jest.Mock).mock.calls[0];
    const resetAction = alertCall[2].find((btn: any) => btn.text === 'Reset');
    
    // Execute the reset action
    await resetAction.onPress();
    
    expect(mockSessionManager.resetAll).toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Success',
      'All data reset. Please restart the app.'
    );
  });

  it('displays network information', () => {
    const { getByText } = render(<SettingsScreen />);
    
    expect(getByText('Network Information')).toBeTruthy();
    expect(getByText('Network:')).toBeTruthy();
    expect(getByText('RISE Testnet')).toBeTruthy();
    expect(getByText('Chain ID:')).toBeTruthy();
    expect(getByText('11155931')).toBeTruthy();
    expect(getByText('Relay URL:')).toBeTruthy();
    expect(getByText('rise-testnet-porto.fly.dev')).toBeTruthy();
  });

  it('handles null addresses gracefully', () => {
    mockSessionManager.getMainAddress.mockReturnValue(null);
    mockSessionManager.getSessionAddress.mockReturnValue(null);
    mockSessionManager.getSessionExpiry.mockReturnValue(null);
    
    const { getByText } = render(<SettingsScreen />);
    
    expect(getByText('Not initialized')).toBeTruthy();
    expect(getByText('Not created')).toBeTruthy();
    expect(getByText('N/A')).toBeTruthy();
  });
});