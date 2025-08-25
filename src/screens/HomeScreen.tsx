import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import ContractInteraction from '../components/ContractInteraction';
import { PortoClient } from '../lib/porto/client';
import { SessionManager } from '../lib/porto/session';

const portoClient = new PortoClient();
const sessionManager = new SessionManager(portoClient);

export default function HomeScreen() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initializeWallet();
  }, []);

  const initializeWallet = async () => {
    try {
      // Initialize main wallet
      const mainAddr = await sessionManager.initMainWallet();
      setWalletAddress(mainAddr);
      
      // Create session key
      const sessionAddr = await sessionManager.createSessionKey();
      setSessionAddress(sessionAddr);
      
      // Check Porto health
      const isHealthy = await portoClient.checkHealth();
      if (!isHealthy) {
        console.warn('Porto relay health check failed');
      }
      
      setIsInitialized(true);
    } catch (err: any) {
      setError(err.message);
      console.error('Initialization error:', err);
    }
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Error: {error}</Text>
      </View>
    );
  }

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Initializing wallet...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Contract Interaction</Text>
        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Wallet:</Text>
          <Text style={styles.address}>{walletAddress?.slice(0, 6)}...{walletAddress?.slice(-4)}</Text>
        </View>
        <View style={styles.addressContainer}>
          <Text style={styles.addressLabel}>Session:</Text>
          <Text style={styles.address}>{sessionAddress?.slice(0, 6)}...{sessionAddress?.slice(-4)}</Text>
        </View>
      </View>
      
      <ContractInteraction 
        portoClient={portoClient}
        walletAddress={walletAddress}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  addressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  addressLabel: {
    fontSize: 14,
    color: '#666',
    marginRight: 8,
  },
  address: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#007AFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
    padding: 16,
  },
});