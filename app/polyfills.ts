// Polyfills for React Native web3/crypto support
import "react-native-url-polyfill/auto";
import "react-native-get-random-values";
import { randomUUID } from "expo-crypto";

// Add randomUUID to crypto
if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
  crypto.randomUUID = randomUUID;
}

// Global BigInt serialization fix (for viem)
(BigInt.prototype as any).toJSON = function() {
  return this.toString();
};

// Ensure global fetch has proper headers handling
if (typeof global !== 'undefined' && !global.Headers) {
  global.Headers = Headers;
}

console.log('[Polyfills] React Native polyfills loaded');