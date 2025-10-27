import { describe, it, expect, beforeEach, vi } from "vitest";
import { FhevmClient } from "../src/core/client/FhevmClient";
import { isFhevmWindow } from "../src/core/client/RelayerSDKLoader";
import type { FhevmStorageProvider } from "../src/core/storage/types";
import type { Mock } from "vitest";

const networkMocks = vi.hoisted(() => ({
  resolveNetwork: vi.fn(),
  tryFetchHardhatNodeRelayerMetadata: vi.fn(),
}));

const loaderMocks = vi.hoisted(() => ({
  isWindowReady: vi.fn(),
}));

const resolveNetworkMock = networkMocks.resolveNetwork;
const tryFetchHardhatNodeRelayerMetadataMock =
  networkMocks.tryFetchHardhatNodeRelayerMetadata;

vi.mock("../src/core/utils/network", async () => {
  const actual = await vi.importActual<
    typeof import("../src/core/utils/network")
  >("../src/core/utils/network");
  return {
    ...actual,
    resolveNetwork: networkMocks.resolveNetwork,
    tryFetchHardhatNodeRelayerMetadata:
      networkMocks.tryFetchHardhatNodeRelayerMetadata,
  };
});

vi.mock("../src/core/client/RelayerSDKLoader", async () => {
  const actual = await vi.importActual<
    typeof import("../src/core/client/RelayerSDKLoader")
  >("../src/core/client/RelayerSDKLoader");
  return {
    ...actual,
    isFhevmWindow: loaderMocks.isWindowReady,
  };
});

type RelayerSdkMock = {
  SepoliaConfig: {
    aclContractAddress: `0x${string}`;
  };
  __initialized__?: boolean;
  initSDK: (options?: unknown) => Promise<boolean>;
  createInstance: (config: unknown) => Promise<typeof fakeInstance>;
};

const loaderMock = {
  load: vi.fn(async () => {}),
  isLoaded: vi.fn(() => true),
};

const storageMock: FhevmStorageProvider = {
  get: vi.fn(async () => ({ publicParams: null })),
  set: vi.fn(async () => {}),
};
let storageGetSpy: Mock;
let storageSetSpy: Mock;

const fakeInstance = {
  getPublicKey: () => ({
    publicKeyId: "pk-id",
    publicKey: new Uint8Array([1, 2]),
  }),
  getPublicParams: () => ({
    publicParamsId: "pp-id",
    publicParams: new Uint8Array([3, 4]),
  }),
};

const relayerSdk: RelayerSdkMock = {
  SepoliaConfig: {
    aclContractAddress: "0x0000000000000000000000000000000000000001",
  },
  initSDK: async () => true,
  createInstance: async () => fakeInstance,
};
const initSpy = vi.spyOn(relayerSdk, "initSDK");
const createInstanceSpy = vi.spyOn(relayerSdk, "createInstance");

const fakeWindow = window as Window & typeof globalThis;

describe("FhevmClient", () => {
  beforeEach(() => {
    resolveNetworkMock.mockReset();
    tryFetchHardhatNodeRelayerMetadataMock.mockReset();
    loaderMocks.isWindowReady.mockReset();
    loaderMocks.isWindowReady.mockImplementation((win: unknown) =>
      Boolean(win && typeof win === "object" && "relayerSDK" in (win as object))
    );
    loaderMock.load.mockReset();
    storageGetSpy = vi.fn(async () => ({ publicParams: null }));
    storageSetSpy = vi.fn(async () => {});
    storageMock.get = storageGetSpy as unknown as typeof storageMock.get;
    storageMock.set = storageSetSpy as unknown as typeof storageMock.set;
    initSpy.mockClear();
    createInstanceSpy.mockClear();
    relayerSdk.__initialized__ = undefined;
    (fakeWindow as unknown as {
      relayerSDK?: typeof relayerSdk & { __initialized__?: boolean };
    }).relayerSDK = relayerSdk as unknown as typeof relayerSdk & {
      __initialized__?: boolean;
    };

    resolveNetworkMock.mockResolvedValue({
      kind: "rpc",
      chainId: 11155111,
      rpcUrl: "https://example-rpc",
    });
    tryFetchHardhatNodeRelayerMetadataMock.mockResolvedValue(undefined);
  });

  it("loads relayer, initializes SDK, and stores keys", async () => {
    const client = new FhevmClient({
      createLoader: () => loaderMock as unknown as typeof loaderMock,
      storage: storageMock,
      getWindow: () => fakeWindow,
    });

    const controller = new AbortController();
    const statuses: string[] = [];

    expect("relayerSDK" in fakeWindow).toBe(true);
    const candidate = relayerSdk as unknown as Record<string, unknown>;
    expect("initSDK" in candidate).toBe(true);
    expect(typeof candidate.initSDK).toBe("function");
    expect(typeof candidate.createInstance).toBe("function");
    expect(typeof candidate.SepoliaConfig).toBe("object");
    expect(typeof relayerSdk.initSDK).toBe("function");
    expect(typeof relayerSdk.createInstance).toBe("function");
    expect(typeof relayerSdk.SepoliaConfig).toBe("object");
    expect(isFhevmWindow({ relayerSDK: relayerSdk } as unknown as Window & typeof globalThis)).toBe(true);
    expect(isFhevmWindow(fakeWindow)).toBe(true);

    await client.createInstance({
      provider: "https://example-rpc",
      signal: controller.signal,
      onStatusChange: (status) => statuses.push(status),
    });

    expect(resolveNetworkMock).toHaveBeenCalledWith("https://example-rpc", undefined);
    expect(loaderMock.load).not.toHaveBeenCalled();
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(createInstanceSpy).toHaveBeenCalledTimes(1);

    const aclAddress = relayerSdk.SepoliaConfig.aclContractAddress;
    expect(storageGetSpy).toHaveBeenCalledWith(aclAddress);
    const [setAcl, setKey, setParams] = storageSetSpy.mock.calls[0];
    expect(setAcl).toBe(aclAddress);
    expect(setKey).toEqual(fakeInstance.getPublicKey());
    expect(setParams).toEqual(fakeInstance.getPublicParams());

    expect(statuses).toEqual([
      "sdk-initializing",
      "sdk-initialized",
      "creating",
    ]);
  });
});
