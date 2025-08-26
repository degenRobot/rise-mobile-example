/**
 * FrenPet Demo Screen
 * Complete gasless pet interaction via Porto relay
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encodeFunctionData, createPublicClient, http, type Address, type Hex } from 'viem';
import type { PrivateKeyAccount } from 'viem/accounts';
import { generatePrivateKey } from 'viem/accounts';

// Import Porto functions
import {
  checkHealth,
  prepareUpgradeAccount,
  upgradeAccount,
  sendTransaction,
  createAccount,
} from '../lib/simple-porto';

// FrenPet contract
const FRENPET_ADDRESS = '0x3FDE139A94eEf14C4eBa229FDC80A54f7F5Fbf25' as Address;
const FRENPET_JSON = require('../abi/FrenPetSimple.json');
const FRENPET_ABI = FRENPET_JSON.abi;

// RPC client for reading contract state
const rpcClient = createPublicClient({
  chain: { id: 11155931 },
  transport: http('https://testnet.riselabs.xyz'),
});

interface PetData {
  name: string;
  level: bigint;
  experience: bigint;
  happiness: bigint;
  hunger: bigint;
  isAlive: boolean;
}

export default function FrenPetScreen() {
  const [account, setAccount] = useState<PrivateKeyAccount | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);
  const [isHealthy, setIsHealthy] = useState(false);
  const [petName, setPetName] = useState('');
  const [myPet, setMyPet] = useState<PetData | null>(null);
  const [hasPet, setHasPet] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Initialize or load account on mount
  useEffect(() => {
    loadOrCreateAccount();
    checkRelayHealth();
  }, []);

  // Load or create account
  const loadOrCreateAccount = async () => {
    try {
      const privateKey = await AsyncStorage.getItem('RISE_WALLET_KEY');
      if (privateKey) {
        const existingAccount = createAccount(privateKey as Hex);
        setAccount(existingAccount);
        await checkDelegationStatus(existingAccount.address);
        await loadPetData(existingAccount.address);
      } else {
        // Create new account automatically
        await createNewAccount();
      }
    } catch (error) {
      console.error('Failed to load account:', error);
    }
  };

  // Create new account
  const createNewAccount = async () => {
    const privateKey = generatePrivateKey();
    const newAccount = createAccount(privateKey);
    await AsyncStorage.setItem('RISE_WALLET_KEY', privateKey);
    setAccount(newAccount);
    setIsDelegated(false);
    setMyPet(null);
    setHasPet(false);
    console.log('Created new account:', newAccount.address);
  };

  // Check relay health
  const checkRelayHealth = async () => {
    try {
      const health = await checkHealth();
      setIsHealthy(health === 'healthy');
    } catch (error) {
      console.error('Health check failed:', error);
      setIsHealthy(false);
    }
  };

  // Check if account has delegation set up
  const checkDelegationStatus = async (address: Address) => {
    try {
      const code = await rpcClient.getCode({ address });
      const delegated = code && code !== '0x';
      setIsDelegated(delegated);
      return delegated;
    } catch (error) {
      console.error('Failed to check delegation:', error);
      return false;
    }
  };

  // Load pet data from contract
  const loadPetData = async (address: Address) => {
    try {
      // Check if has pet
      const hasPetResult = await rpcClient.readContract({
        address: FRENPET_ADDRESS,
        abi: FRENPET_ABI,
        functionName: 'hasPet',
        args: [address],
      }) as boolean;
      
      setHasPet(hasPetResult);
      
      if (hasPetResult) {
        // Get pet stats
        const stats = await rpcClient.readContract({
          address: FRENPET_ADDRESS,
          abi: FRENPET_ABI,
          functionName: 'getPetStats',
          args: [address],
        }) as any[];
        
        setMyPet({
          name: stats[0],
          level: stats[1],
          experience: stats[2],
          happiness: stats[3],
          hunger: stats[4],
          isAlive: stats[5],
        });
      }
    } catch (error) {
      console.error('Failed to load pet data:', error);
    }
  };

  // Refresh data
  const onRefresh = useCallback(async () => {
    if (!account) return;
    setIsRefreshing(true);
    await checkRelayHealth();
    await checkDelegationStatus(account.address);
    await loadPetData(account.address);
    setIsRefreshing(false);
  }, [account]);

  // Setup delegation
  const setupDelegation = async () => {
    if (!account) return;
    
    setIsLoading(true);
    try {
      const prepareResponse = await prepareUpgradeAccount(account);
      await upgradeAccount(account, prepareResponse);
      
      Alert.alert('Success', 'Delegation setup stored! Will be deployed on first transaction.');
      // Note: Delegation isn't on-chain yet, will be deployed with first tx
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Create pet
  const handleCreatePet = async () => {
    if (!account) return;
    if (!petName.trim()) {
      Alert.alert('Error', 'Please enter a pet name');
      return;
    }

    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'createPet',
        args: [petName]
      });

      const result = await sendTransaction(
        account,
        FRENPET_ADDRESS,
        data
      );

      Alert.alert(
        'Success!', 
        `Pet created!\nTx: ${result.bundleId.slice(0, 10)}...`,
        [{ text: 'OK', onPress: () => onRefresh() }]
      );
      
      setPetName('');
    } catch (error: any) {
      Alert.alert('Transaction Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Feed pet
  const handleFeedPet = async () => {
    if (!account || !myPet) return;

    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'feedPet',
        args: []
      });

      const result = await sendTransaction(
        account,
        FRENPET_ADDRESS,
        data
      );

      Alert.alert(
        'Success!', 
        'Pet fed successfully!',
        [{ text: 'OK', onPress: () => onRefresh() }]
      );
    } catch (error: any) {
      Alert.alert('Transaction Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Play with pet
  const handlePlayWithPet = async () => {
    if (!account || !myPet) return;

    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'playWithPet',
        args: []
      });

      const result = await sendTransaction(
        account,
        FRENPET_ADDRESS,
        data
      );

      Alert.alert(
        'Success!', 
        'Your pet is happy!',
        [{ text: 'OK', onPress: () => onRefresh() }]
      );
    } catch (error: any) {
      Alert.alert('Transaction Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Reset wallet
  const handleResetWallet = () => {
    Alert.alert(
      'Reset Wallet',
      'This will create a new wallet. Your current pet will be lost. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('RISE_WALLET_KEY');
            await createNewAccount();
          }
        }
      ]
    );
  };

  // Get status emoji
  const getStatusEmoji = (value: bigint) => {
    const num = Number(value);
    if (num >= 80) return '😊';
    if (num >= 60) return '🙂';
    if (num >= 40) return '😐';
    if (num >= 20) return '😟';
    return '😢';
  };

  return (
    <ScrollView 
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.title}>🐾 FrenPet Demo</Text>
        <View style={styles.statusRow}>
          <View style={[styles.badge, isHealthy ? styles.badgeSuccess : styles.badgeError]}>
            <Text style={styles.badgeText}>
              {isHealthy ? '✅ Relay OK' : '❌ Relay Down'}
            </Text>
          </View>
          <View style={[styles.badge, isDelegated ? styles.badgeSuccess : styles.badgeWarning]}>
            <Text style={styles.badgeText}>
              {isDelegated ? '✅ Delegated' : '⚠️ Not Delegated'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Wallet</Text>
        <Text style={styles.address}>
          {account ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}` : 'No account'}
        </Text>
        <View style={styles.buttonRow}>
          {!isDelegated && (
            <TouchableOpacity 
              style={[styles.button, styles.primaryButton]}
              onPress={setupDelegation}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Setup Delegation</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity 
            style={[styles.button, styles.dangerButton]}
            onPress={handleResetWallet}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Reset Wallet</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!hasPet ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Your Pet</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter pet name..."
            value={petName}
            onChangeText={setPetName}
            editable={!isLoading}
          />
          <TouchableOpacity 
            style={[styles.button, styles.primaryButton]}
            onPress={handleCreatePet}
            disabled={isLoading || !petName.trim()}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Create Pet</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : myPet && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Pet: {myPet.name}</Text>
          
          <View style={styles.statsContainer}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Level</Text>
              <Text style={styles.statValue}>⬆️ {myPet.level.toString()}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Experience</Text>
              <Text style={styles.statValue}>⭐ {myPet.experience.toString()}</Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Happiness</Text>
              <Text style={styles.statValue}>
                {getStatusEmoji(myPet.happiness)} {myPet.happiness.toString()}%
              </Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Hunger</Text>
              <Text style={styles.statValue}>
                {getStatusEmoji(100n - myPet.hunger)} {myPet.hunger.toString()}%
              </Text>
            </View>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Status</Text>
              <Text style={styles.statValue}>
                {myPet.isAlive ? '✅ Alive' : '💀 Dead'}
              </Text>
            </View>
          </View>

          {myPet.isAlive && (
            <View style={styles.actionButtons}>
              <TouchableOpacity 
                style={[styles.button, styles.actionButton]}
                onPress={handleFeedPet}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>🍎 Feed</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, styles.actionButton]}
                onPress={handlePlayWithPet}
                disabled={isLoading}
              >
                <Text style={styles.buttonText}>🎮 Play</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>Processing transaction...</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  badgeSuccess: {
    backgroundColor: '#d4edda',
  },
  badgeWarning: {
    backgroundColor: '#fff3cd',
  },
  badgeError: {
    backgroundColor: '#f8d7da',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
  },
  card: {
    margin: 15,
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  address: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#666',
    marginBottom: 15,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 15,
  },
  button: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  primaryButton: {
    backgroundColor: '#007AFF',
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  actionButton: {
    backgroundColor: '#34C759',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 10,
  },
  stat: {
    alignItems: 'center',
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -75 }, { translateY: -50 }],
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
  },
});