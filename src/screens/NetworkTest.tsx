import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';

export default function NetworkTest() {
  const [results, setResults] = useState<string[]>([]);

  const addResult = (msg: string) => {
    setResults(prev => [...prev, `${new Date().toISOString().split('T')[1].split('.')[0]} - ${msg}`]);
  };

  const testDirectFetch = async () => {
    addResult('Testing direct fetch to Porto relay...');
    try {
      const response = await fetch('https://rise-testnet-porto.fly.dev', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'health',
          params: [],
          id: 1,
        }),
      });
      
      if (!response.ok) {
        addResult(`HTTP Error: ${response.status}`);
        return;
      }
      
      const data = await response.json();
      addResult(`✅ Success: ${JSON.stringify(data.result)}`);
    } catch (error: any) {
      addResult(`❌ Error: ${error.message}`);
    }
  };

  const testRiselabsFetch = async () => {
    addResult('Testing fetch to testnet.riselabs.xyz...');
    try {
      const response = await fetch('https://testnet.riselabs.xyz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_chainId',
          params: [],
          id: 1,
        }),
      });
      
      const data = await response.json();
      addResult(`✅ ChainId: ${data.result}`);
    } catch (error: any) {
      addResult(`❌ Error: ${error.message}`);
    }
  };

  const testGoogleFetch = async () => {
    addResult('Testing fetch to google.com...');
    try {
      const response = await fetch('https://www.google.com');
      addResult(`✅ Google status: ${response.status}`);
    } catch (error: any) {
      addResult(`❌ Error: ${error.message}`);
    }
  };

  const clearResults = () => {
    setResults([]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Network Connectivity Test</Text>
      
      <View style={styles.buttons}>
        <TouchableOpacity style={styles.button} onPress={testDirectFetch}>
          <Text style={styles.buttonText}>Test Porto Relay</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testRiselabsFetch}>
          <Text style={styles.buttonText}>Test RISE RPC</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.button} onPress={testGoogleFetch}>
          <Text style={styles.buttonText}>Test Google</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.button, styles.clearButton]} onPress={clearResults}>
          <Text style={styles.buttonText}>Clear</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.results}>
        <Text style={styles.resultsTitle}>Results:</Text>
        {results.map((result, index) => (
          <Text key={index} style={styles.resultText}>{result}</Text>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 40,
  },
  buttons: {
    gap: 10,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  clearButton: {
    backgroundColor: '#FF3B30',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 16,
  },
  results: {
    marginTop: 20,
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 8,
    minHeight: 200,
  },
  resultsTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: 10,
  },
  resultText: {
    fontFamily: 'monospace',
    fontSize: 12,
    marginBottom: 5,
    color: '#333',
  },
});