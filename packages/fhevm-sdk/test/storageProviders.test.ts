import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import { createBrowserStorage } from "../src/core/storage/PublicKeyStorage";
import { createInMemoryStorage } from "../src/core/storage/InMemoryStorage";

if (typeof indexedDB !== "undefined") {
  const globalWindow = (globalThis as unknown as { window?: Window }).window;
  if (globalWindow) {
    (globalWindow as unknown as { indexedDB?: IDBFactory }).indexedDB = indexedDB;
  }
}

const acl = "0x0000000000000000000000000000000000000001" as const;

const keyEntry = {
  publicKeyId: "pk-id",
  publicKey: new Uint8Array([1, 2, 3, 4]),
};

const paramsEntry = {
  publicParamsId: "pp-id",
  publicParams: new Uint8Array([5, 6, 7, 8]),
};

async function resetIndexedDb() {
  if (typeof indexedDB === "undefined") {
    return;
  }
  await new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("fhevm");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

describe("storage providers", () => {
  beforeEach(async () => {
    await resetIndexedDb();
  });

  it("persists values in browser storage", async () => {
    const storage = createBrowserStorage();
    const empty = await storage.get(acl);
    expect(empty.publicKey).toBeUndefined();
    expect(empty.publicParams).toBeNull();

    await storage.set(acl, keyEntry, paramsEntry);
    const result = await storage.get(acl);

    expect(result).toHaveProperty("publicParams");
  });

  it("stores data in memory storage", async () => {
    const storage = createInMemoryStorage();
    await storage.set(acl, keyEntry, paramsEntry);
    const result = await storage.get(acl);

    expect(result.publicKey?.id).toBe(keyEntry.publicKeyId);
    expect(result.publicParams?.["2048"].publicParamsId).toBe(
      paramsEntry.publicParamsId
    );
  });
});
