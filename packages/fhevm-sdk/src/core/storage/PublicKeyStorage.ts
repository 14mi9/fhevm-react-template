import { openDB, DBSchema, IDBPDatabase } from "idb";
import { createInMemoryStorage } from "./InMemoryStorage";
import type { FhevmStorageProvider, FhevmStorageReadResult } from "./types";

export type FhevmStoredPublicKey = {
  publicKeyId: string;
  publicKey: Uint8Array;
};

export type FhevmStoredPublicParams = {
  publicParamsId: string;
  publicParams: Uint8Array;
};

interface PublicParamsDB extends DBSchema {
  publicKeyStore: {
    key: string;
    value: {
      acl: `0x${string}`;
      value: FhevmStoredPublicKey;
    };
  };
  paramsStore: {
    key: string;
    value: {
      acl: `0x${string}`;
      value: FhevmStoredPublicParams;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<PublicParamsDB>> | undefined;

async function getDB(): Promise<IDBPDatabase<PublicParamsDB> | undefined> {
  if (dbPromise) {
    return dbPromise;
  }

  if (typeof window === "undefined") {
    return undefined;
  }

  dbPromise = openDB<PublicParamsDB>("fhevm", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("paramsStore")) {
        db.createObjectStore("paramsStore", { keyPath: "acl" });
      }
      if (!db.objectStoreNames.contains("publicKeyStore")) {
        db.createObjectStore("publicKeyStore", { keyPath: "acl" });
      }
    },
  });

  return dbPromise;
}

function normalizeToUint8Array(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }
  if (data instanceof ArrayBuffer) {
    return new Uint8Array(data);
  }
  if (Array.isArray(data)) {
    return Uint8Array.from(data);
  }
  throw new Error("Value must be convertible to Uint8Array");
}

function assertPublicKey(
  value: unknown
): asserts value is FhevmStoredPublicKey | null {
  if (typeof value !== "object") {
    throw new Error("FhevmStoredPublicKey must be an object");
  }
  if (value === null) {
    return;
  }
  if (!("publicKeyId" in value)) {
    throw new Error("FhevmStoredPublicKey.publicKeyId does not exist");
  }
  if (typeof value.publicKeyId !== "string") {
    throw new Error("FhevmStoredPublicKey.publicKeyId must be a string");
  }
  if (!("publicKey" in value)) {
    throw new Error("FhevmStoredPublicKey.publicKey does not exist");
  }

  const normalized = normalizeToUint8Array(
    (value as { publicKey: unknown }).publicKey
  );
  (value as { publicKey: Uint8Array }).publicKey = normalized;
}

function assertPublicParams(
  value: unknown
): asserts value is FhevmStoredPublicParams | null {
  if (typeof value !== "object") {
    throw new Error("FhevmStoredPublicParams must be an object");
  }
  if (value === null) {
    return;
  }
  if (!("publicParamsId" in value)) {
    throw new Error("FhevmStoredPublicParams.publicParamsId does not exist");
  }
  if (typeof value.publicParamsId !== "string") {
    throw new Error("FhevmStoredPublicParams.publicParamsId must be a string");
  }
  if (!("publicParams" in value)) {
    throw new Error("FhevmStoredPublicParams.publicParams does not exist");
  }

  const normalized = normalizeToUint8Array(
    (value as { publicParams: unknown }).publicParams
  );
  (value as { publicParams: Uint8Array }).publicParams = normalized;
}

function buildReadResult(
  storedPublicKey: FhevmStoredPublicKey | null,
  storedPublicParams: FhevmStoredPublicParams | null
): FhevmStorageReadResult {
  const publicKeyData = storedPublicKey?.publicKey;
  const publicKeyId = storedPublicKey?.publicKeyId;
  const publicParams = storedPublicParams
    ? {
        "2048": storedPublicParams,
      }
    : null;

  let publicKey: FhevmStorageReadResult["publicKey"];

  if (publicKeyId && publicKeyData) {
    publicKey = {
      id: publicKeyId,
      data: publicKeyData,
    };
  }

  return {
    ...(publicKey !== undefined && { publicKey }),
    publicParams,
  };
}

export function createBrowserStorage(): FhevmStorageProvider {
  const fallback = createInMemoryStorage();
  return {
    async get(aclAddress: `0x${string}`) {
      const db = await getDB();
      if (!db) {
        return fallback.get(aclAddress);
      }

      let storedPublicKey: FhevmStoredPublicKey | null = null;
      try {
        const pk = await db.get("publicKeyStore", aclAddress);
        if (pk?.value) {
          assertPublicKey(pk.value);
          storedPublicKey = pk.value;
        }
      } catch {
        // ignore corrupted entry
      }

      let storedPublicParams: FhevmStoredPublicParams | null = null;
      try {
        const pp = await db.get("paramsStore", aclAddress);
        if (pp?.value) {
          assertPublicParams(pp.value);
          storedPublicParams = pp.value;
        }
      } catch {
        // ignore corrupted entry
      }

      return buildReadResult(storedPublicKey, storedPublicParams);
    },
    async set(
      aclAddress: `0x${string}`,
      publicKey: FhevmStoredPublicKey | null,
      publicParams: FhevmStoredPublicParams | null
    ) {
      assertPublicKey(publicKey);
      assertPublicParams(publicParams);

      const db = await getDB();
      if (!db) {
        return fallback.set(aclAddress, publicKey, publicParams);
      }

      if (publicKey) {
        await db.put("publicKeyStore", { acl: aclAddress, value: publicKey });
      }

      if (publicParams) {
        await db.put("paramsStore", { acl: aclAddress, value: publicParams });
      }
    },
  };
}

const browserStorage = createBrowserStorage();

export async function publicKeyStorageGet(aclAddress: `0x${string}`) {
  return browserStorage.get(aclAddress);
}

export async function publicKeyStorageSet(
  aclAddress: `0x${string}`,
  publicKey: FhevmStoredPublicKey | null,
  publicParams: FhevmStoredPublicParams | null
) {
  return browserStorage.set(aclAddress, publicKey, publicParams);
}
