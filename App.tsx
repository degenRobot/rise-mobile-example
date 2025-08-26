import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View, TouchableOpacity, Text } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import NetworkTest from './src/screens/NetworkTest';
import ExampleScreen from './src/screens/ExampleScreen';

export default function App() {
  const [showNetworkTest, setShowNetworkTest] = useState(true);
  
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />
      <View style={styles.tabs}>
        <TouchableOpacity 
          style={[styles.tab, showNetworkTest && styles.activeTab]}
          onPress={() => setShowNetworkTest(true)}
        >
          <Text style={[styles.tabText, showNetworkTest && styles.activeTabText]}>Network Test</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, !showNetworkTest && styles.activeTab]}
          onPress={() => setShowNetworkTest(false)}
        >
          <Text style={[styles.tabText, !showNetworkTest && styles.activeTabText]}>Porto Demo</Text>
        </TouchableOpacity>
      </View>
      {showNetworkTest ? <NetworkTest /> : <ExampleScreen />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#007AFF',
  },
  tabText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#666',
  },
  activeTabText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});