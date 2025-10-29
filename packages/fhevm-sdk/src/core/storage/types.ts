export type FhevmPublicKeyEntry = {
  id: string | null;
  data: Uint8Array | null;
};

export type FhevmPublicParamsEntry = {
  "2048": {
    publicParamsId: string;
    publicParams: Uint8Array;
  };
};

export type FhevmStorageReadResult = {
  publicKey?: FhevmPublicKeyEntry;
  publicParams: FhevmPublicParamsEntry | null;
};

export type FhevmStorageProvider = {
  get(aclAddress: `0x${string}`): Promise<FhevmStorageReadResult>;
  set(
    aclAddress: `0x${string}`,
    publicKey: {
      publicKeyId: string;
      publicKey: Uint8Array;
    } | null,
    publicParams: {
      publicParamsId: string;
      publicParams: Uint8Array;
    } | null
  ): Promise<void>;
};
