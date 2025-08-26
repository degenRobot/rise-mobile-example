import React, { useEffect } from 'react';
import { View, Text } from 'react-native';

export default function TestConnection() {
  useEffect(() => {
    // Test direct fetch
    fetch('https://rise-testnet-porto.fly.dev', {
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
    })
      .then(r => r.json())
      .then(data => console.log('Direct fetch success:', data))
      .catch(err => console.error('Direct fetch error:', err));
  }, []);

  return (
    <View>
      <Text>Check console for connection test</Text>
    </View>
  );
}