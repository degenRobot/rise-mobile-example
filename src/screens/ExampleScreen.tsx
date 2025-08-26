/**
 * Simple Example Screen
 * Shows exactly how to use Porto relay functions
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
// Using AsyncStorage for demo - use SecureStore in production
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encodeFunctionData } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';

// Import our simple Porto functions
import {
  checkHealth,
  prepareUpgradeAccount,
  upgradeAccount,
  sendTransaction,
  createAccount,
} from '../lib/simple-porto';
import { generatePrivateKey } from 'viem/accounts';

// Example contract (FrenPet)
const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25'; // Must be uppercase!
const FRENPET_JSON = require('../abi/FrenPetSimple.json');
const FRENPET_ABI = FRENPET_JSON.abi;

export default function ExampleScreen() {
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null);
  const [isHealthy, setIsHealthy] = useState(false);
  const [petName, setPetName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [lastTx, setLastTx] = useState<string>('');

  useEffect(() => {
    initializeAccount();
    checkRelayHealth();
  }, []);

  // Step 1: Get or create account
  const initializeAccount = async () => {
    try {
      // Check if we have a saved private key
      let privateKey = await AsyncStorage.getItem('PORTO_PRIVATE_KEY');
      
      if (!privateKey) {
        // Generate new account
        privateKey = generatePrivateKey();
        await AsyncStorage.setItem('PORTO_PRIVATE_KEY', privateKey);
        const newAccount = createAccount(privateKey as `0x${string}`);
        setAccount(newAccount);
        console.log('Created new account:', newAccount.address);
      } else {
        // Load existing account
        const existingAccount = createAccount(privateKey as `0x${string}`);
        setAccount(existingAccount);
        console.log('Loaded account:', existingAccount.address);
      }
    } catch (error) {
      console.error('Failed to initialize account:', error);
    }
  };

  // Step 2: Check relay health
  const checkRelayHealth = async () => {
    try {
      const health = await checkHealth();
      setIsHealthy(health === 'healthy');
      console.log('Porto health:', health);
    } catch (error) {
      console.error('Health check failed:', error);
      setIsHealthy(false);
    }
  };

  // Step 3: Setup delegation (optional - happens automatically on first tx)
  const setupDelegation = async () => {
    if (!account) return;
    
    setIsLoading(true);
    try {
      // Prepare delegation
      const prepareResponse = await prepareUpgradeAccount(account);
      
      // Sign and store it
      await upgradeAccount(account, prepareResponse);
      
      Alert.alert('Success', 'Delegation setup complete!');
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Step 4: Send a transaction
  const createPet = async () => {
    if (!account) {
      Alert.alert('Error', 'No account initialized');
      return;
    }
    
    if (!petName.trim()) {
      Alert.alert('Error', 'Please enter a pet name');
      return;
    }

    setIsLoading(true);
    try {
      // Encode the contract call
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'createPet',
        args: [petName]
      });

      // Send transaction through Porto
      const result = await sendTransaction(
        account,
        FRENPET_ADDRESS as any,
        data
      );

      setLastTx(result.bundleId);
      setPetName('');
      
      Alert.alert(
        'Success!', 
        `Pet created!\nBundle ID: ${result.bundleId.slice(0, 10)}...`
      );
    } catch (error: any) {
      Alert.alert('Transaction Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Status */}
      <View style={styles.card}>
        <Text style={styles.title}>Porto Status</Text>
        <View style={styles.row}>
          <Text style={styles.label}>Relay Health:</Text>
          <Text style={[styles.value, isHealthy ? styles.success : styles.error]}>
            {isHealthy ? '✅ Healthy' : '❌ Unhealthy'}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Account:</Text>
          <Text style={styles.value}>
            {account ? `${account.address.slice(0, 10)}...` : 'Not initialized'}
          </Text>
        </View>
      </View>

      {/* Setup Delegation (Optional) */}
      <View style={styles.card}>
        <Text style={styles.title}>Setup (Optional)</Text>
        <Text style={styles.description}>
          Delegation is set up automatically on first transaction,
          but you can do it manually here:
        </Text>
        <TouchableOpacity 
          style={styles.button}
          onPress={setupDelegation}
          disabled={isLoading || !account}
        >
          <Text style={styles.buttonText}>Setup Delegation</Text>
        </TouchableOpacity>
      </View>

      {/* Send Transaction */}
      <View style={styles.card}>
        <Text style={styles.title}>Send Transaction</Text>
        <Text style={styles.description}>
          Create a pet on FrenPet contract (gasless):
        </Text>
        <TextInput
          style={styles.input}
          value={petName}
          onChangeText={setPetName}
          placeholder="Enter pet name"
        />
        <TouchableOpacity 
          style={[styles.button, styles.primaryButton]}
          onPress={createPet}
          disabled={isLoading || !account}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Create Pet</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Last Transaction */}
      {lastTx && (
        <View style={styles.card}>
          <Text style={styles.title}>Last Transaction</Text>
          <Text style={styles.monospace}>{lastTx}</Text>
        </View>
      )}

      {/* Code Example */}
      <View style={styles.card}>
        <Text style={styles.title}>How It Works</Text>
        <Text style={styles.code}>
{`// 1. Generate account
const account = generateAccount();

// 2. Send transaction
const result = await sendTransaction(
  account,
  contractAddress,
  encodedData
);

// That's it! 🎉`}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  card: {
    backgroundColor: 'white',
    padding: 16,
    margin: 16,
    marginBottom: 0,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },
  success: {
    color: '#4CAF50',
  },
  error: {
    color: '#F44336',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#666',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#333',
    backgroundColor: '#f5f5f5',
    padding: 12,
    borderRadius: 8,
  },
  monospace: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#666',
  },
});