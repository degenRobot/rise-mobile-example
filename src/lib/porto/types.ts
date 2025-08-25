import type { Hex } from 'viem';

export interface PortoCall {
  to: string;
  data: string;
  value: string;
}

export interface PortoKey {
  prehash: boolean;
  publicKey: string;
  type: 'secp256k1' | 'secp256r1';
  role?: 'admin' | 'session';
  expiry?: string;
  permissions?: string[];
}

export interface PortoCapabilities {
  meta?: {
    feeToken: string;
  };
  authorizeKeys?: PortoKey[];
}

export interface PrepareCallsRequest {
  from: string;
  chainId: number;
  calls: PortoCall[];
  capabilities: PortoCapabilities;
  key?: PortoKey;
}

export interface PrepareCallsResponse {
  context: any;
  digest: string;
  typedData?: any;
  key?: PortoKey;
  capabilities?: PortoCapabilities;
}

export interface SendPreparedCallsRequest {
  context: any;
  key: PortoKey;
  signature: string;
}

export interface TransactionStatus {
  id: string;
  status: number;
  receipts?: Array<{
    status: string;
    gasUsed: string;
    transactionHash: string;
    blockNumber: string;
  }>;
}

export interface PrepareUpgradeRequest {
  address: string;
  delegation: string;
  capabilities: PortoCapabilities;
  chainId: number;
}

export interface PrepareUpgradeResponse {
  context: any;
  digests: {
    auth: string;
    exec: string;
  };
}

export interface UpgradeAccountRequest {
  context: any;
  signatures: {
    auth: string;
    exec: string;
  };
}