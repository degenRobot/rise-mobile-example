import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { porto } from '../lib/porto';

export default function WalletInfoScreen() {
  const [walletInfo, setWalletInfo] = useState<any>(null);
  const [balance, setBalance] = useState<string>('0');
  const [associatedKeys, setAssociatedKeys] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadWalletInfo();
  }, []);

  const loadWalletInfo = async () => {
    setIsLoading(true);
    try {
      // Get wallet info
      const info = porto.getWalletInfo();
      setWalletInfo(info);

      // Get balance
      const bal = await porto.getBalance();
      setBalance((Number(bal) / 1e18).toFixed(6));

      // Get associated keys
      const keys = await porto.getAssociatedKeys();
      setAssociatedKeys(keys);
    } catch (error) {
      console.error('Error loading wallet info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateSessionKey = async () => {
    setIsLoading(true);
    try {
      const newAddress = await porto.rotateSessionKey();
      Alert.alert('Success', `New session key: ${newAddress.slice(0, 10)}...`);
      await loadWalletInfo();
    } catch (error: any) {
      Alert.alert('Error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetWallet = () => {
    Alert.alert(
      'Reset Wallet',
      'This will delete all wallet data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await porto.reset();
            Alert.alert('Success', 'Wallet reset. Please restart the app.');
          },
        },
      ]
    );
  };

  const formatAddress = (address: string | null) => {
    if (!address) return 'Not initialized';
    return `${address.slice(0, 10)}...${address.slice(-8)}`;
  };

  const formatTime = (ms: number) => {
    if (ms <= 0) return 'Expired';
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  if (isLoading && !walletInfo) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading wallet info...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Main Wallet */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Main Wallet (EOA)</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>{formatAddress(walletInfo?.mainAddress)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Balance:</Text>
          <Text style={styles.value}>{balance} ETH</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Network:</Text>
          <Text style={styles.value}>RISE Testnet</Text>
        </View>
      </View>

      {/* Session Key */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Session Key</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Address:</Text>
          <Text style={styles.value}>{formatAddress(walletInfo?.sessionAddress)}</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[
            styles.value,
            walletInfo?.isSessionValid ? styles.validText : styles.expiredText
          ]}>
            {walletInfo?.isSessionValid ? 'Valid' : 'Expired'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Time Remaining:</Text>
          <Text style={styles.value}>
            {formatTime(walletInfo?.timeRemaining || 0)}
          </Text>
        </View>

        <TouchableOpacity 
          style={styles.button}
          onPress={handleRotateSessionKey}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Rotate Session Key</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Associated Keys */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Associated Keys</Text>
        
        {associatedKeys.length > 0 ? (
          associatedKeys.map((key, index) => (
            <Text key={index} style={styles.keyText}>
              {index + 1}. {formatAddress(key)}
            </Text>
          ))
        ) : (
          <Text style={styles.emptyText}>No additional keys registered</Text>
        )}
      </View>

      {/* Porto Configuration */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Porto Relay</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Status:</Text>
          <Text style={styles.validText}>Active</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Proxy:</Text>
          <Text style={styles.value}>0xf463d5...f4b8a4</Text>
        </View>

        <View style={styles.infoRow}>
          <Text style={styles.label}>Features:</Text>
          <Text style={styles.value}>Gasless Transactions</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.card}>
        <TouchableOpacity 
          style={[styles.button, styles.dangerButton]}
          onPress={handleResetWallet}
        >
          <Text style={styles.buttonText}>Reset Wallet</Text>
        </TouchableOpacity>
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
    borderRadius: 12,
    padding: 16,
    margin: 16,
    marginBottom: 0,
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
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  dangerButton: {
    backgroundColor: '#FF3B30',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  validText: {
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  expiredText: {
    color: '#F44336',
  },
  keyText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
  },
});