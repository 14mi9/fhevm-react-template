import type {
  FhevmStorageProvider,
  FhevmStorageReadResult,
} from "./types";

export function createInMemoryStorage(): FhevmStorageProvider {
  const publicKeys = new Map<
    `0x${string}`,
    { publicKeyId: string; publicKey: Uint8Array }
  >();
  const publicParams = new Map<
    `0x${string}`,
    { publicParamsId: string; publicParams: Uint8Array }
  >();

  const read = (aclAddress: `0x${string}`): FhevmStorageReadResult => {
    const storedKey = publicKeys.get(aclAddress);
    const storedParams = publicParams.get(aclAddress);

    const key =
      storedKey && storedKey.publicKey && storedKey.publicKeyId
        ? {
            id: storedKey.publicKeyId,
            data: storedKey.publicKey,
          }
        : undefined;

    const params = storedParams
      ? {
          "2048": storedParams,
        }
      : null;

    return {
      ...(key !== undefined && { publicKey: key }),
      publicParams: params,
    };
  };

  return {
    async get(aclAddress) {
      return read(aclAddress);
    },
    async set(aclAddress, pk, params) {
      if (pk) {
        publicKeys.set(aclAddress, pk);
      }
      if (params) {
        publicParams.set(aclAddress, params);
      }
    },
  };
}
