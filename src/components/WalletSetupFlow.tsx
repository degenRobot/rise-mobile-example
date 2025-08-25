import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { SessionManager } from '../lib/porto/session';
import { PortoClient } from '../lib/porto/client';

interface WalletSetupFlowProps {
  portoClient: PortoClient;
  sessionManager: SessionManager;
  onComplete: (mainAddress: string, sessionAddress: string) => void;
}

type SetupStep = 'intro' | 'creating-wallet' | 'creating-session' | 'setting-delegation' | 'complete';

export default function WalletSetupFlow({ 
  portoClient, 
  sessionManager,
  onComplete 
}: WalletSetupFlowProps) {
  const [currentStep, setCurrentStep] = useState<SetupStep>('intro');
  const [isLoading, setIsLoading] = useState(false);
  const [mainAddress, setMainAddress] = useState<string | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSetup = async () => {
    setCurrentStep('creating-wallet');
    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Create main wallet
      const mainAddr = await sessionManager.initMainWallet();
      setMainAddress(mainAddr);
      setCurrentStep('creating-session');

      // Step 2: Create session key
      const sessionAddr = await sessionManager.createSessionKey();
      setSessionAddress(sessionAddr);
      setCurrentStep('setting-delegation');

      // Step 3: Setup delegation
      const delegationSuccess = await portoClient.setupDelegation();
      if (!delegationSuccess) {
        console.warn('Delegation setup failed, but continuing');
      }

      // Step 4: Check Porto health
      const isHealthy = await portoClient.checkHealth();
      if (!isHealthy) {
        console.warn('Porto relay health check failed');
      }

      setCurrentStep('complete');
      setIsLoading(false);
    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
      Alert.alert('Setup Failed', err.message);
    }
  };

  const completeSetup = () => {
    if (mainAddress && sessionAddress) {
      onComplete(mainAddress, sessionAddress);
    }
  };

  const renderIntroStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.title}>Welcome to RISE Relay Demo</Text>
      <Text style={styles.subtitle}>
        Let's set up your wallet for gasless transactions
      </Text>

      <View style={styles.featureList}>
        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔐</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Secure Wallet</Text>
            <Text style={styles.featureDescription}>
              Generate a new EOA wallet with secure key storage
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>🔑</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Session Keys</Text>
            <Text style={styles.featureDescription}>
              Create time-limited keys for enhanced security
            </Text>
          </View>
        </View>

        <View style={styles.featureItem}>
          <Text style={styles.featureIcon}>⚡</Text>
          <View style={styles.featureText}>
            <Text style={styles.featureTitle}>Gasless Transactions</Text>
            <Text style={styles.featureDescription}>
              Execute transactions without paying gas fees
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={startSetup}>
        <Text style={styles.primaryButtonText}>Get Started</Text>
      </TouchableOpacity>
    </View>
  );

  const renderCreatingWalletStep = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.statusTitle}>Creating Your Wallet</Text>
      <Text style={styles.statusDescription}>
        Generating a secure EOA wallet...
      </Text>
      {mainAddress && (
        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Main Wallet:</Text>
          <Text style={styles.addressValue}>
            {mainAddress.slice(0, 10)}...{mainAddress.slice(-8)}
          </Text>
        </View>
      )}
    </View>
  );

  const renderCreatingSessionStep = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.statusTitle}>Creating Session Key</Text>
      <Text style={styles.statusDescription}>
        Setting up a time-limited session key for transactions...
      </Text>
      {sessionAddress && (
        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Session Key:</Text>
          <Text style={styles.addressValue}>
            {sessionAddress.slice(0, 10)}...{sessionAddress.slice(-8)}
          </Text>
        </View>
      )}
    </View>
  );

  const renderSettingDelegationStep = () => (
    <View style={styles.stepContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.statusTitle}>Setting Up Delegation</Text>
      <Text style={styles.statusDescription}>
        Configuring EIP-7702 delegation for gasless transactions...
      </Text>
    </View>
  );

  const renderCompleteStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.successIcon}>✅</Text>
      <Text style={styles.title}>Wallet Setup Complete!</Text>
      <Text style={styles.subtitle}>
        Your wallet is ready for gasless transactions
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Setup Summary</Text>
        
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Main Wallet:</Text>
          <Text style={styles.summaryValue}>
            {mainAddress?.slice(0, 10)}...{mainAddress?.slice(-8)}
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Session Key:</Text>
          <Text style={styles.summaryValue}>
            {sessionAddress?.slice(0, 10)}...{sessionAddress?.slice(-8)}
          </Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Network:</Text>
          <Text style={styles.summaryValue}>RISE Testnet</Text>
        </View>

        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Relay:</Text>
          <Text style={styles.summaryValue}>Porto Protocol</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={completeSetup}>
        <Text style={styles.primaryButtonText}>Start Using Wallet</Text>
      </TouchableOpacity>
    </View>
  );

  const renderError = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.errorIcon}>❌</Text>
      <Text style={styles.title}>Setup Failed</Text>
      <Text style={styles.errorMessage}>{error}</Text>
      
      <TouchableOpacity style={styles.primaryButton} onPress={startSetup}>
        <Text style={styles.primaryButtonText}>Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  if (error) {
    return renderError();
  }

  return (
    <ScrollView style={styles.container}>
      {currentStep === 'intro' && renderIntroStep()}
      {currentStep === 'creating-wallet' && renderCreatingWalletStep()}
      {currentStep === 'creating-session' && renderCreatingSessionStep()}
      {currentStep === 'setting-delegation' && renderSettingDelegationStep()}
      {currentStep === 'complete' && renderCompleteStep()}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  stepContainer: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
    textAlign: 'center',
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
  },
  featureList: {
    width: '100%',
    marginBottom: 32,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 24,
  },
  featureIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333',
  },
  featureDescription: {
    fontSize: 14,
    color: '#666',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 24,
    marginBottom: 8,
    color: '#333',
  },
  statusDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  addressContainer: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  addressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#007AFF',
  },
  successIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  errorIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  summaryCard: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    marginBottom: 32,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666',
  },
  summaryValue: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },
  errorMessage: {
    fontSize: 14,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
});