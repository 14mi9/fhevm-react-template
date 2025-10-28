import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FhevmInstance } from "../fhevmTypes.js";
import { FhevmClient } from "../core/client/FhevmClient";
import type { FhevmRelayerStatus } from "../core/types/status";
import type { FhevmInitSDKOptions } from "../core/types/relayer";
import type { FhevmStorageProvider } from "../core/storage/types";
import type { Eip1193Provider } from "ethers";

export type FhevmGoState = "idle" | "loading" | "ready" | "error";

type ProviderInput = string | Eip1193Provider | undefined;

export type UseFhevmOptions = {
  provider: ProviderInput;
  chainId?: number;
  enabled?: boolean;
  initialMockChains?: Readonly<Record<number, string>>;
  mockChains?: Readonly<Record<number, string>>;
  initOptions?: FhevmInitSDKOptions;
  storage?: FhevmStorageProvider;
  client?: FhevmClient;
  onStatusChange?: (status: FhevmRelayerStatus) => void;
};

type UseFhevmResult = {
  instance: FhevmInstance | undefined;
  refresh: () => void;
  error: Error | undefined;
  status: FhevmGoState;
};

export function useFhevm(options: UseFhevmOptions): UseFhevmResult {
  const {
    provider,
    enabled = true,
    mockChains,
    initialMockChains,
    initOptions,
    storage,
    client: clientOverride,
    onStatusChange,
  } = options;

  const resolvedMockChains = mockChains ?? initialMockChains;

  const client = useMemo(() => {
    if (clientOverride) {
      return clientOverride;
    }
    if (storage) {
      return new FhevmClient({ storage });
    }
    return new FhevmClient();
  }, [clientOverride, storage]);

  const [instance, setInstance] = useState<FhevmInstance | undefined>(undefined);
  const [status, setStatus] = useState<FhevmGoState>("idle");
  const [error, setError] = useState<Error | undefined>(undefined);
  const [refreshToken, setRefreshToken] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    setInstance(undefined);
    setError(undefined);
    setStatus("idle");
    setRefreshToken(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (!enabled || provider === undefined) {
      abortRef.current?.abort();
      abortRef.current = null;
      setInstance(undefined);
      setStatus("idle");
      setError(undefined);
      return;
    }

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;

    setStatus("loading");
    setError(undefined);

    const handleStatus = (s: FhevmRelayerStatus) => {
      onStatusChange?.(s);
      if (controller.signal.aborted) {
        return;
      }
      setStatus("loading");
    };

    client
      .createInstance({
        provider,
        signal: controller.signal,
        mockChains: resolvedMockChains as Record<number, string> | undefined,
        onStatusChange: handleStatus,
        initOptions,
      })
      .then(result => {
        if (controller.signal.aborted) {
          return;
        }
        setInstance(result);
        setStatus("ready");
      })
      .catch(err => {
        if (controller.signal.aborted) {
          return;
        }
        setInstance(undefined);
        setError(err as Error);
        setStatus("error");
      });

    return () => {
      controller.abort();
    };
  }, [client, provider, enabled, resolvedMockChains, initOptions, onStatusChange, refreshToken]);

  return { instance, refresh, error, status };
}
