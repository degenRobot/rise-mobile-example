import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  Alert
} from 'react-native';
import { SessionManager } from '../lib/porto/session';
import { PortoClient } from '../lib/porto/client';

const portoClient = new PortoClient();
const sessionManager = new SessionManager(portoClient);

export default function SettingsScreen() {
  const [config, setConfig] = useState(sessionManager.getConfig() || { expiryHours: 24, autoRenew: true });
  const [mainAddress, setMainAddress] = useState<string | null>(null);
  const [sessionAddress, setSessionAddress] = useState<string | null>(null);
  const [sessionExpiry, setSessionExpiry] = useState<Date | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  useEffect(() => {
    loadSessionInfo();
    const interval = setInterval(updateTimeRemaining, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadSessionInfo = () => {
    setMainAddress(sessionManager.getMainAddress());
    setSessionAddress(sessionManager.getSessionAddress());
    setSessionExpiry(sessionManager.getSessionExpiry());
  };

  const updateTimeRemaining = () => {
    const remaining = sessionManager.getTimeRemaining();
    if (remaining > 0) {
      const hours = Math.floor(remaining / 3600000);
      const minutes = Math.floor((remaining % 3600000) / 60000);
      setTimeRemaining(`${hours}h ${minutes}m`);
    } else {
      setTimeRemaining('Expired');
    }
  };

  const handleUpdateConfig = () => {
    sessionManager.updateConfig(config);
    Alert.alert('Success', 'Configuration updated');
  };

  const handleRefreshSession = async () => {
    try {
      await sessionManager.clearSession();
      const newSession = await sessionManager.createSessionKey();
      loadSessionInfo();
      Alert.alert('Success', `New session created: ${newSession}`);
    } catch (error: any) {
      Alert.alert('Error', error.message);
    }
  };

  const handleClearSession = async () => {
    Alert.alert(
      'Clear Session',
      'Are you sure you want to clear the current session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await sessionManager.clearSession();
            loadSessionInfo();
            Alert.alert('Success', 'Session cleared');
          }
        }
      ]
    );
  };

  const handleResetAll = async () => {
    Alert.alert(
      'Reset All Data',
      'This will delete your wallet and all session data. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await sessionManager.resetAll();
            loadSessionInfo();
            Alert.alert('Success', 'All data reset. Please restart the app.');
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Wallet Information</Text>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Main Wallet:</Text>
          <Text style={styles.value}>
            {mainAddress ? `${mainAddress.slice(0, 8)}...${mainAddress.slice(-6)}` : 'Not initialized'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Session Key:</Text>
          <Text style={styles.value}>
            {sessionAddress ? `${sessionAddress.slice(0, 8)}...${sessionAddress.slice(-6)}` : 'Not created'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Session Expires:</Text>
          <Text style={styles.value}>
            {sessionExpiry ? sessionExpiry.toLocaleString() : 'N/A'}
          </Text>
        </View>
        
        <View style={styles.infoRow}>
          <Text style={styles.label}>Time Remaining:</Text>
          <Text style={[styles.value, timeRemaining === 'Expired' && styles.expiredText]}>
            {timeRemaining || 'N/A'}
          </Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Session Configuration</Text>
        
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Session Duration (hours):</Text>
          <TextInput
            style={styles.input}
            value={config?.expiryHours?.toString() || '24'}
            onChangeText={(text) => 
              setConfig({...config, expiryHours: parseInt(text) || 24})
            }
            keyboardType="numeric"
          />
        </View>
        
        <View style={styles.switchRow}>
          <Text style={styles.label}>Auto-renew Session:</Text>
          <Switch
            value={config?.autoRenew ?? true}
            onValueChange={(value) => setConfig({...config, autoRenew: value})}
          />
        </View>
        
        <TouchableOpacity style={styles.button} onPress={handleUpdateConfig}>
          <Text style={styles.buttonText}>Update Configuration</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        
        <TouchableOpacity style={styles.button} onPress={handleRefreshSession}>
          <Text style={styles.buttonText}>Create New Session</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.warningButton]} 
          onPress={handleClearSession}
        >
          <Text style={styles.buttonText}>Clear Session</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={[styles.button, styles.dangerButton]} 
          onPress={handleResetAll}
        >
          <Text style={styles.buttonText}>Reset All Data</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Network Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Network:</Text>
          <Text style={styles.value}>RISE Testnet</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Chain ID:</Text>
          <Text style={styles.value}>11155931</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Relay URL:</Text>
          <Text style={styles.value}>rise-testnet-porto.fly.dev</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  section: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  infoRow: {
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
  expiredText: {
    color: '#F44336',
  },
  inputGroup: {
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginTop: 4,
    fontSize: 14,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    alignItems: 'center',
  },
  warningButton: {
    backgroundColor: '#FF9800',
  },
  dangerButton: {
    backgroundColor: '#F44336',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});