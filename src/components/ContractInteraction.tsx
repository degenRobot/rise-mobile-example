import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import { encodeFunctionData } from 'viem';
import { PortoClient } from '../lib/porto/client';
import { PORTO_CONFIG, FRENPET_ABI } from '../config/constants';

interface ContractDebuggerProps {
  portoClient: PortoClient;
  walletAddress: string | null;
}

interface FunctionInput {
  name: string;
  type: string;
  value: string;
}

export default function ContractDebugger({ portoClient, walletAddress }: ContractDebuggerProps) {
  const [contractAddress, setContractAddress] = useState(PORTO_CONFIG.contracts.frenPetSimple);
  const [abiInput, setAbiInput] = useState(JSON.stringify(FRENPET_ABI, null, 2));
  const [parsedAbi, setParsedAbi] = useState<any[]>(FRENPET_ABI.filter((item: any) => 
    item.type === 'function' && 
    (item.stateMutability === 'nonpayable' || item.stateMutability === 'payable')
  ));
  const [selectedFunction, setSelectedFunction] = useState<any>(null);
  const [functionInputs, setFunctionInputs] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<string>('');

  const parseAbi = () => {
    try {
      const abi = JSON.parse(abiInput);
      const writeFunctions = abi.filter((item: any) => 
        item.type === 'function' && 
        (item.stateMutability === 'nonpayable' || item.stateMutability === 'payable')
      );
      setParsedAbi(writeFunctions);
      Alert.alert('Success', `Loaded ${writeFunctions.length} write functions`);
    } catch (error) {
      Alert.alert('Error', 'Invalid ABI JSON');
    }
  };

  const selectFunction = (func: any) => {
    setSelectedFunction(func);
    const inputs: Record<string, string> = {};
    func.inputs?.forEach((input: any) => {
      inputs[input.name] = '';
    });
    setFunctionInputs(inputs);
  };

  const executeFunction = async () => {
    if (!selectedFunction || !walletAddress) {
      Alert.alert('Error', 'Please connect wallet and select a function');
      return;
    }

    setIsLoading(true);
    setTransactionStatus('Preparing transaction...');

    try {
      const args = selectedFunction.inputs?.map((input: any) => {
        const value = functionInputs[input.name];
        if (input.type === 'uint256' || input.type.startsWith('uint')) {
          return BigInt(value || 0);
        }
        if (input.type === 'bool') {
          return value === 'true';
        }
        return value;
      }) || [];

      const data = encodeFunctionData({
        abi: [selectedFunction],
        functionName: selectedFunction.name,
        args
      });

      setTransactionStatus('Sending to relayer...');
      const result = await portoClient.executeTransaction(
        contractAddress,
        data,
        '0x0'
      );

      setTransactionStatus(`Transaction sent! Bundle ID: ${result.bundleId}`);
      
      if (result.status) {
        setTransactionStatus(`Status: ${result.status.status}`);
      }

      // Wait for confirmation
      setTransactionStatus('Waiting for confirmation...');
      const finalStatus = await portoClient.waitForTransaction(result.bundleId);
      
      if (finalStatus.receipts && finalStatus.receipts[0]) {
        const receipt = finalStatus.receipts[0];
        setTransactionStatus(
          `✅ Success!\nTx: ${receipt.transactionHash}\nGas: ${receipt.gasUsed}`
        );
      } else {
        setTransactionStatus(`Transaction confirmed with status: ${finalStatus.status}`);
      }
    } catch (error: any) {
      setTransactionStatus(`❌ Error: ${error.message}`);
      Alert.alert('Transaction Failed', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract Address</Text>
        <TextInput
          style={styles.input}
          value={contractAddress}
          onChangeText={setContractAddress}
          placeholder="0x..."
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Contract ABI (Write Functions)</Text>
        <TextInput
          style={[styles.input, styles.abiInput]}
          value={abiInput}
          onChangeText={setAbiInput}
          multiline
          placeholder="Paste ABI JSON here..."
        />
        <TouchableOpacity style={styles.button} onPress={parseAbi}>
          <Text style={styles.buttonText}>Load ABI</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Functions</Text>
        {parsedAbi.map((func, index) => (
          <TouchableOpacity
            key={index}
            style={[
              styles.functionButton,
              selectedFunction?.name === func.name && styles.selectedFunction
            ]}
            onPress={() => selectFunction(func)}
          >
            <Text style={styles.functionName}>{func.name}()</Text>
          </TouchableOpacity>
        ))}
      </View>

      {selectedFunction && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            Execute: {selectedFunction.name}
          </Text>
          
          {selectedFunction.inputs?.map((input: any, index: number) => (
            <View key={index} style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                {input.name} ({input.type})
              </Text>
              <TextInput
                style={styles.input}
                value={functionInputs[input.name] || ''}
                onChangeText={(value) => 
                  setFunctionInputs({...functionInputs, [input.name]: value})
                }
                placeholder={`Enter ${input.type}`}
              />
            </View>
          ))}

          <TouchableOpacity
            style={[styles.button, styles.executeButton]}
            onPress={executeFunction}
            disabled={isLoading || !walletAddress}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.buttonText}>Execute Transaction</Text>
            )}
          </TouchableOpacity>

          {!walletAddress && (
            <Text style={styles.warningText}>
              Please wait for wallet initialization...
            </Text>
          )}
        </View>
      )}

      {transactionStatus !== '' && (
        <View style={styles.statusSection}>
          <Text style={styles.sectionTitle}>Transaction Status</Text>
          <Text style={styles.statusText}>{transactionStatus}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  abiInput: {
    height: 150,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
    fontSize: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  functionButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    marginBottom: 8,
  },
  selectedFunction: {
    backgroundColor: '#E3F2FD',
    borderColor: '#007AFF',
  },
  functionName: {
    fontSize: 14,
    fontFamily: 'monospace',
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    marginBottom: 4,
    color: '#666',
  },
  executeButton: {
    backgroundColor: '#4CAF50',
    marginTop: 16,
  },
  warningText: {
    color: '#FF9800',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
  },
  statusSection: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  statusText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#333',
  },
});