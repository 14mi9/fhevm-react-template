# @fhevm-sdk

An experimental, framework-agnostic SDK that helps you bootstrap FHEVM-enabled dApps. It wraps the Zama Relayer SDK, handles public key caching, and offers optional React adapters so you can focus on encrypted UX rather than wiring.

> The SDK currently ships inside this monorepo. Install it via the workspace (`pnpm add @fhevm-sdk`) or bundler aliases until it is published to a registry.

## Contents
- [Installation](#installation)
- [Core concepts](#core-concepts)
- [Quick start (Node / browser)](#quick-start-node--browser)
- [Advanced client configuration](#advanced-client-configuration)
- [Encryption helpers](#encryption-helpers)
- [User-side decryption flow](#user-side-decryption-flow)
- [React adapters](#react-adapters)
- [Testing utilities](#testing-utilities)

## Installation

The package exposes ESM entrypoints only.

```bash
pnpm add @fhevm-sdk
# peer dependencies – install them in the consuming app
pnpm add ethers @zama-fhe/relayer-sdk

# Optional: utilities for tests / mocks
pnpm add -D @fhevm/mock-utils
```

Peer dependency overview:

| Package | Why |
| --- | --- |
| `ethers@^6` | EIP-1193 provider detection, signer helpers |
| `@zama-fhe/relayer-sdk` | Underlying relayer interface exposed by `window.relayerSDK` |
| `react@^18 \|\| ^19` | Only required when using the React hooks |

## Core concepts

The SDK revolves around three building blocks located under `src/core`:

| Export | Description |
| --- | --- |
| `FhevmClient` | High-level orchestrator that resolves the network, loads/initialises the relayer and returns an `FhevmInstance`. |
| `createFhevmInstance` | Convenience wrapper (`new FhevmClient().createInstance(...)`). |
| Storage providers (`createBrowserStorage`, `createInMemoryStorage`, `FhevmStorageProvider`) | Cache public keys & params per ACL address, configurable per environment. |

`FhevmClient#createInstance` normalises providers coming from `ethers`, raw RPC URLs or wagmi connectors. It supports mock networks (Hardhat + `@fhevm/mock-utils`) and reports lifecycle updates through an optional `onStatusChange` callback:

```
sdk-loading → sdk-loaded → sdk-initializing → sdk-initialized → creating
```

### Network resolution

The helper `resolveNetwork` inspects the supplied provider or URL and, when possible, fetches mock metadata using `tryFetchHardhatNodeRelayerMetadata`. This drives mocked instances on local Hardhat chains without hitting the hosted relayer.

### Error model

Errors extend the `FhevmError` base class (`RELAYER_UNAVAILABLE`, `RELAYER_INIT_FAILED`, `INVALID_ACL_ADDRESS`, …). Aborted operations throw `FhevmAbortError`, allowing consumers to ignore cancelled requests.

## Quick start (Node / browser)

```ts
import { FhevmClient } from "@fhevm-sdk";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

const client = new FhevmClient();
const abort = new AbortController();

const instance = await client.createInstance({
  provider,
  signal: abort.signal,
  mockChains: { 31337: "http://127.0.0.1:8545" }, // Optional Hardhat fallback
  onStatusChange: status => console.debug("[fhevm]", status),
});

// Encrypt data before calling your contract
const user = await provider.getSigner();
const input = instance.createEncryptedInput(contractAddress, await user.getAddress());
input.add64(BigInt(42));
const encrypted = await input.encrypt();

// Use encrypted.handles & encrypted.inputProof as call parameters
```

Usage checklist:

1. Always pass an `AbortSignal`. Abort ongoing work when the user changes networks or closes a modal.
2. Provide `mockChains` for local Hardhat development so the client can short-circuit to the mock relayer.
3. Persist the returned `FhevmInstance`; reuse it across encrypt/decrypt operations instead of recreating it.

## Advanced client configuration

`FhevmClient` accepts dependency overrides that let you tailor storage and relayer loading:

```ts
import { FhevmClient, createInMemoryStorage, RelayerSDKLoader } from "@fhevm-sdk";

const client = new FhevmClient({
  storage: createInMemoryStorage(),            // Node.js friendly storage
  createLoader: () => new RelayerSDKLoader({ trace: console.debug }),
  getWindow: () => globalThis as any,          // Custom window shim (e.g. JSDOM)
});
```

Storage is keyed by the ACL contract address exposed by the relayer. Implement `FhevmStorageProvider` when you need custom persistence (IndexedDB, Redis, etc):

```ts
import type { FhevmStorageProvider } from "@fhevm-sdk";

const storage: FhevmStorageProvider = {
  async get(address) {
    return await redis.hgetall(`fhe:${address}`);
  },
  async set(address, publicKey, publicParams) {
    await redis.hset(`fhe:${address}`, { publicKey, publicParams });
  },
};

const client = new FhevmClient({ storage });
```

## Encryption helpers

The core exports mirror the relayer SDK, so you can call familiar APIs on the `FhevmInstance`. For convenience the React hook `useFHEEncryption` (see below) wraps the pattern, but the bare instance works everywhere:

```ts
import { RelayerEncryptedInput } from "@zama-fhe/relayer-sdk/web";

function buildAdditionInput(instance: FhevmInstance, contractAddress: `0x${string}`, userAddress: `0x${string}`) {
  const input = instance.createEncryptedInput(contractAddress, userAddress) as RelayerEncryptedInput;
  input.add64(BigInt(1));
  input.add64(BigInt(41));
  return input.encrypt(); // => { handles, inputProof }
}
```

Helpers such as `getEncryptionMethod` and `buildParamsFromAbi` live in `src/react/useFHEEncryption.ts` but are usable outside React to align ABI metadata with encrypted payloads.

## User-side decryption flow

`FhevmDecryptionSignature` manages the “sign once, reuse many times” EIP-712 signature required by `instance.userDecrypt`.

```ts
import { FhevmDecryptionSignature, GenericStringInMemoryStorage } from "@fhevm-sdk";

const storage = new GenericStringInMemoryStorage();
const signer = provider.getSigner();

const signature = await FhevmDecryptionSignature.loadOrSign(
  instance,
  [contractAddress],  // Supports multi-contract scopes
  signer,
  storage,
);

if (!signature) throw new Error("Unable to create FHEVM signature");

const decrypted = await instance.userDecrypt(
  [{ contractAddress, handle }],
  signature.privateKey,
  signature.publicKey,
  signature.signature,
  signature.contractAddresses,
  signature.userAddress,
  signature.startTimestamp,
  signature.durationDays,
);
```

To persist signatures across sessions, plug in any `GenericStringStorage` implementation (localStorage, IndexedDB, server KV, …).

## React adapters

The `@fhevm-sdk/react` entrypoint builds on the core client and targets modern React apps (Next.js, Vite, Remix).

### `useFhevm`

Manages the full instance lifecycle and returns `{ instance, status, error, refresh }`.

```tsx
import { useEffect } from "react";
import { useFhevm } from "@fhevm-sdk/react";
import { useAccount, useWalletClient } from "wagmi";

export function FhevmProviderBridge() {
  const { chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const { instance, status, error, refresh } = useFhevm({
    provider: walletClient ?? undefined,
    chainId,
    mockChains: { 31337: "http://127.0.0.1:8545" },
    onStatusChange: status => console.info("[relayer]", status),
  });

  useEffect(() => {
    if (status === "error") {
      console.error("FHEVM failed", error);
    }
  }, [status, error]);

  return (
    <button onClick={refresh} disabled={status === "loading"}>
      {status === "ready" ? "Reload FHEVM" : "Initialising…"}
    </button>
  );
}
```

Key props:

| Prop | Description |
| --- | --- |
| `provider` | Required. Accepts EIP-1193 providers or RPC URLs. |
| `enabled` | Toggle discovery without unmounting the hook. |
| `mockChains` / `initialMockChains` | Inject Hardhat RPC endpoints detected as “mock” networks. |
| `initOptions` | Passed to `relayerSDK.initSDK`. |
| `storage` | Custom `FhevmStorageProvider` (default: browser / memory). |
| `onStatusChange` | Receives low-level relayer status updates. |

### `useFHEEncryption`

Wraps encrypted input creation. Provide the `FhevmInstance`, an `ethers.JsonRpcSigner`, and the contract address:

```tsx
import { useMemo } from "react";
import { useFHEEncryption } from "@fhevm-sdk/react";

const { canEncrypt, encryptWith } = useFHEEncryption({ instance, ethersSigner, contractAddress });

const submit = async () => {
  if (!canEncrypt) return;
  const enc = await encryptWith(builder => {
    builder.add64(BigInt(10));
  });
  // send enc.handles + enc.inputProof to your contract call
};
```

`getEncryptionMethod` and `buildParamsFromAbi` utilities inside the module help map ABI metadata to encrypted handles.

### `useFHEDecrypt`

Coordinates signature caching and `instance.userDecrypt` calls.

```tsx
import { useFHEDecrypt, InMemoryStorageProvider, useInMemoryStorage } from "@fhevm-sdk/react";

function DecryptControls({ instance, signer, chainId, requests }) {
  const { storage } = useInMemoryStorage();
  const { decrypt, canDecrypt, isDecrypting, message, results, error } = useFHEDecrypt({
    instance,
    ethersSigner: signer,
    fhevmDecryptionSignatureStorage: storage,
    chainId,
    requests,
  });

  return (
    <section>
      <button onClick={decrypt} disabled={!canDecrypt}>
        {isDecrypting ? "Decrypting…" : "Decrypt"}
      </button>
      <p>{message}</p>
      {error && <p role="alert">{error}</p>}
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </section>
  );
}

export function DecryptSection(props) {
  return (
    <InMemoryStorageProvider>
      <DecryptControls {...props} />
    </InMemoryStorageProvider>
  );
}
```

If you prefer persistent storage (localStorage, IndexedDB), replace `InMemoryStorageProvider` with a custom context that supplies a `GenericStringStorage`.

## Testing utilities

- `pnpm --filter ./packages/fhevm-sdk test` runs Vitest suites covering the client, storage, and React hooks (with JSDOM).
- `pnpm --filter ./packages/fhevm-sdk build` compiles the TypeScript sources.
- The mock relayer lives under `src/internal/mock` and lets you simulate Hardhat contracts without touching the hosted relayer.

## Next steps

- Explore the Next.js showcase in `packages/nextjs` for a reference integration.
- Follow repository issues or the CHANGELOG for roadmap updates.

Feedback is welcome—open an issue or PR with improvements to the SDK or to this documentation.
