import type { Eip1193Provider } from "ethers";
import { FhevmInstance, FhevmInstanceConfig } from "../../fhevmTypes";
import { createBrowserStorage } from "../storage/PublicKeyStorage";
import { createInMemoryStorage } from "../storage/InMemoryStorage";
import type { FhevmStorageProvider } from "../storage/types";
import { RelayerSDKLoader, isFhevmWindow } from "./RelayerSDKLoader";
import {
  FhevmAbortError,
  FhevmError,
  throwFhevmError,
} from "../errors/FhevmError";
import { isHexAddress } from "../utils/address";
import {
  FhevmResolvedNetwork,
  resolveNetwork,
  tryFetchHardhatNodeRelayerMetadata,
} from "../utils/network";
import type { FhevmRelayerStatus } from "../types/status";
import type { FhevmInitSDKOptions } from "../types/relayer";

type StatusListener = (status: FhevmRelayerStatus) => void;

export type CreateFhevmInstanceParams = {
  provider: Eip1193Provider | string;
  signal: AbortSignal;
  mockChains?: Record<number, string>;
  onStatusChange?: StatusListener;
  initOptions?: FhevmInitSDKOptions;
};

type Dependencies = {
  createLoader: () => RelayerSDKLoader;
  storage: FhevmStorageProvider;
  getWindow: () => Window & typeof globalThis;
};

const defaultDependencies: Dependencies = {
  createLoader: () => new RelayerSDKLoader({ trace: console.log }),
  storage:
    typeof window === "undefined"
      ? createInMemoryStorage()
      : createBrowserStorage(),
  getWindow: () => window,
};

export class FhevmClient {
  private readonly deps: Dependencies;

  constructor(dependencies?: Partial<Dependencies>) {
    this.deps = {
      ...defaultDependencies,
      ...(dependencies ?? {}),
    };
  }

  public async createInstance(
    params: CreateFhevmInstanceParams
  ): Promise<FhevmInstance> {
    const { provider, signal, mockChains, onStatusChange, initOptions } =
      params;

    const notify = (status: FhevmRelayerStatus) => {
      onStatusChange?.(status);
    };

    const resolved = await resolveNetwork(provider, mockChains);
    this.ensureNotAborted(signal);

    const mockInstance = await this.tryCreateMockInstance(
      resolved,
      signal,
      notify
    );
    if (mockInstance) {
      return mockInstance;
    }

    await this.ensureRelayerAvailable(signal, notify);
    await this.ensureRelayerInitialized(signal, notify, initOptions);

    const win = this.deps.getWindow();
    if (!isFhevmWindow(win)) {
      throw new FhevmError(
        "RELAYER_UNAVAILABLE",
        "window.relayerSDK is not available"
      );
    }

    const relayerSDK = win.relayerSDK;

    const aclAddress = relayerSDK.SepoliaConfig.aclContractAddress;
    if (!isHexAddress(aclAddress)) {
      throw new FhevmError("INVALID_ACL_ADDRESS", `Invalid address: ${aclAddress}`);
    }

    const publicKeyCache = await this.deps.storage.get(aclAddress);
    this.ensureNotAborted(signal);

    const config: FhevmInstanceConfig = {
      ...relayerSDK.SepoliaConfig,
      network: provider,
      publicKey: publicKeyCache.publicKey,
      publicParams: publicKeyCache.publicParams,
    };

    notify("creating");

    const instance = await relayerSDK.createInstance(config);

    await this.deps.storage.set(
      aclAddress,
      instance.getPublicKey(),
      instance.getPublicParams(2048)
    );

    this.ensureNotAborted(signal);

    return instance;
  }

  private ensureNotAborted(signal: AbortSignal) {
    if (signal.aborted) {
      throw new FhevmAbortError();
    }
  }

  private async tryCreateMockInstance(
    resolved: FhevmResolvedNetwork,
    signal: AbortSignal,
    notify: StatusListener
  ): Promise<FhevmInstance | undefined> {
    if (resolved.kind !== "mock") {
      return undefined;
    }

    const metadata = await tryFetchHardhatNodeRelayerMetadata(resolved.rpcUrl);
    this.ensureNotAborted(signal);

    if (!metadata) {
      return undefined;
    }

    notify("creating");

    const fhevmMock = await import("../../internal/mock/fhevmMock");
    const instance = await fhevmMock.fhevmMockCreateInstance({
      rpcUrl: resolved.rpcUrl,
      chainId: resolved.chainId,
      metadata,
    });

    this.ensureNotAborted(signal);

    return instance;
  }

  private async ensureRelayerAvailable(
    signal: AbortSignal,
    notify: StatusListener
  ) {
    if (isFhevmWindow(this.deps.getWindow())) {
      return;
    }

    notify("sdk-loading");

    const loader = this.deps.createLoader();
    await loader.load();

    this.ensureNotAborted(signal);

    notify("sdk-loaded");

    if (!isFhevmWindow(this.deps.getWindow())) {
      throw new FhevmError(
        "RELAYER_UNAVAILABLE",
        "window.relayerSDK is not available after loading"
      );
    }
  }

  private async ensureRelayerInitialized(
    signal: AbortSignal,
    notify: StatusListener,
    initOptions?: FhevmInitSDKOptions
  ) {
    const win = this.deps.getWindow();

    if (!isFhevmWindow(win)) {
      throw new FhevmError(
        "RELAYER_UNAVAILABLE",
        "window.relayerSDK is not available"
      );
    }

    if (win.relayerSDK.__initialized__ === true) {
      return;
    }

    notify("sdk-initializing");

    const initialized = await win.relayerSDK.initSDK(initOptions);
    this.ensureNotAborted(signal);

    win.relayerSDK.__initialized__ = initialized;

    if (!initialized) {
      throw new FhevmError(
        "RELAYER_INIT_FAILED",
        "window.relayerSDK.initSDK failed."
      );
    }

    notify("sdk-initialized");
  }
}

export function createFhevmInstance(params: CreateFhevmInstanceParams) {
  const client = new FhevmClient();
  return client.createInstance(params);
}
