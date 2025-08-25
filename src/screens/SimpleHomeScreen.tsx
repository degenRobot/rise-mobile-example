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
import { porto } from '../lib/porto';
import { encodeFunctionData } from 'viem';
import { FRENPET_ABI } from '../config/constants';

const FRENPET_ADDRESS = '0xc73341541Ad7910c31e54EFf5f1FfD893C78Cf90';

export default function SimpleHomeScreen() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [petName, setPetName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [petStats, setPetStats] = useState<any>(null);

  useEffect(() => {
    initializeWallet();
  }, []);

  const initializeWallet = async () => {
    try {
      setIsLoading(true);
      const { mainAddress, sessionAddress } = await porto.init();
      const info = porto.getWalletInfo();
      setWalletInfo(info);
      setIsInitialized(true);
      
      // Load pet stats if exists
      await loadPetStats();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPetStats = async () => {
    try {
      const info = porto.getWalletInfo();
      if (!info.mainAddress) return;

      const petId = await porto.readContract(
        FRENPET_ADDRESS as any,
        FRENPET_ABI,
        'ownerToPet',
        [info.mainAddress]
      );

      if (petId && petId !== 0n) {
        const pet = await porto.readContract(
          FRENPET_ADDRESS as any,
          FRENPET_ABI,
          'pets',
          [petId]
        );
        setPetStats(pet);
      }
    } catch (error) {
      console.log('No pet found');
    }
  };

  const createPet = async () => {
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

      const result = await porto.sendTransaction(
        FRENPET_ADDRESS as any,
        data
      );

      Alert.alert('Success', `Pet created! Bundle ID: ${result.bundleId}`);
      setPetName('');
      
      // Reload pet stats
      setTimeout(loadPetStats, 3000);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const feedPet = async () => {
    if (!petStats) {
      Alert.alert('Error', 'No pet to feed');
      return;
    }

    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'feedPet',
        args: []
      });

      const result = await porto.sendTransaction(
        FRENPET_ADDRESS as any,
        data
      );

      Alert.alert('Success', 'Pet fed!');
      setTimeout(loadPetStats, 3000);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const playWithPet = async () => {
    if (!petStats) {
      Alert.alert('Error', 'No pet to play with');
      return;
    }

    setIsLoading(true);
    try {
      const data = encodeFunctionData({
        abi: FRENPET_ABI,
        functionName: 'playWithPet',
        args: []
      });

      const result = await porto.sendTransaction(
        FRENPET_ADDRESS as any,
        data
      );

      Alert.alert('Success', 'Played with pet!');
      setTimeout(loadPetStats, 3000);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isInitialized) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Initializing wallet...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Wallet Info */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Wallet Info</Text>
        <Text style={styles.infoText}>
          Main: {walletInfo?.mainAddress?.slice(0, 10)}...
        </Text>
        <Text style={styles.infoText}>
          Session: {walletInfo?.sessionAddress?.slice(0, 10)}...
        </Text>
        <Text style={styles.infoText}>
          Valid: {walletInfo?.isSessionValid ? 'Yes' : 'No'}
        </Text>
      </View>

      {/* Pet Stats */}
      {petStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Pet</Text>
          <Text style={styles.infoText}>Name: {petStats.name}</Text>
          <Text style={styles.infoText}>Level: {petStats.level?.toString()}</Text>
          <Text style={styles.infoText}>Happiness: {petStats.happiness?.toString()}</Text>
          <Text style={styles.infoText}>Hunger: {petStats.hunger?.toString()}</Text>
        </View>
      )}

      {/* Create Pet */}
      {!petStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Create Your Pet</Text>
          <TextInput
            style={styles.input}
            value={petName}
            onChangeText={setPetName}
            placeholder="Enter pet name"
          />
          <TouchableOpacity 
            style={styles.button}
            onPress={createPet}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Create Pet</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Pet Actions */}
      {petStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Pet Actions</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity 
              style={[styles.button, styles.smallButton]}
              onPress={feedPet}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Feed</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.button, styles.smallButton]}
              onPress={playWithPet}
              disabled={isLoading}
            >
              <Text style={styles.buttonText}>Play</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity 
            style={[styles.button, styles.refreshButton]}
            onPress={loadPetStats}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Refresh Stats</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  infoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace',
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
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  smallButton: {
    flex: 0.48,
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
  },
});