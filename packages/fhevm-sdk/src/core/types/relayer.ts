import type { FhevmInstance, FhevmInstanceConfig } from "../../fhevmTypes";

export type FhevmInitSDKOptions = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tfheParams?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  kmsParams?: any;
  thread?: number;
};

export type FhevmCreateInstance = () => Promise<FhevmInstance>;
export type FhevmInitSDK = (options?: FhevmInitSDKOptions) => Promise<boolean>;
export type FhevmLoadSDK = () => Promise<void>;
export type IsFhevmSupported = (chainId: number) => boolean;

export type FhevmRelayerSDK = {
  initSDK: FhevmInitSDK;
  createInstance: (config: FhevmInstanceConfig) => Promise<FhevmInstance>;
  SepoliaConfig: FhevmInstanceConfig;
  __initialized__?: boolean;
};

export type FhevmWindow = {
  relayerSDK: FhevmRelayerSDK;
};
