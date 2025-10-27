import { Eip1193Provider, JsonRpcProvider } from "ethers";
import { throwFhevmError } from "../errors/FhevmError";

export type FhevmResolvedNetwork =
  | { kind: "mock"; chainId: number; rpcUrl: string }
  | { kind: "rpc"; chainId: number; rpcUrl?: string };

export async function getChainId(
  providerOrUrl: Eip1193Provider | string
): Promise<number> {
  if (typeof providerOrUrl === "string") {
    const provider = new JsonRpcProvider(providerOrUrl);
    const network = await provider.getNetwork();
    provider.destroy();
    return Number(network.chainId);
  }

  const chainId = await providerOrUrl.request({ method: "eth_chainId" });
  return Number.parseInt(chainId as string, 16);
}

export async function resolveNetwork(
  providerOrUrl: Eip1193Provider | string,
  mockChains?: Record<number, string>
): Promise<FhevmResolvedNetwork> {
  const chainId = await getChainId(providerOrUrl);

  let rpcUrl = typeof providerOrUrl === "string" ? providerOrUrl : undefined;
  const mockLookup: Record<number, string> = {
    31337: "http://localhost:8545",
    ...(mockChains ?? {}),
  };

  if (Object.hasOwn(mockLookup, chainId)) {
    if (!rpcUrl) {
      rpcUrl = mockLookup[chainId];
    }
    return { kind: "mock", chainId, rpcUrl };
  }

  return { kind: "rpc", chainId, rpcUrl };
}

export async function getWeb3ClientVersion(rpcUrl: string) {
  const rpc = new JsonRpcProvider(rpcUrl);
  try {
    return await rpc.send("web3_clientVersion", []);
  } catch (error) {
    throwFhevmError(
      "WEB3_CLIENTVERSION_ERROR",
      `The URL ${rpcUrl} is not a Web3 node or is not reachable. Please check the endpoint.`,
      error
    );
  } finally {
    rpc.destroy();
  }
}

export async function fetchFhevmRelayerMetadata(rpcUrl: string) {
  const rpc = new JsonRpcProvider(rpcUrl);
  try {
    return await rpc.send("fhevm_relayer_metadata", []);
  } catch (error) {
    throwFhevmError(
      "FHEVM_RELAYER_METADATA_ERROR",
      `The URL ${rpcUrl} is not a FHEVM Hardhat node or is not reachable. Please check the endpoint.`,
      error
    );
  } finally {
    rpc.destroy();
  }
}

export async function tryFetchHardhatNodeRelayerMetadata(
  rpcUrl: string
):
  Promise<
    | {
        ACLAddress: `0x${string}`;
        InputVerifierAddress: `0x${string}`;
        KMSVerifierAddress: `0x${string}`;
      }
    | undefined
  > {
  const version = await getWeb3ClientVersion(rpcUrl);
  if (typeof version !== "string" || !version.toLowerCase().includes("hardhat")) {
    return undefined;
  }

  try {
    const metadata = await fetchFhevmRelayerMetadata(rpcUrl);
    if (!metadata || typeof metadata !== "object") {
      return undefined;
    }

    if (
      !(
        "ACLAddress" in metadata &&
        typeof metadata.ACLAddress === "string" &&
        metadata.ACLAddress.startsWith("0x")
      )
    ) {
      return undefined;
    }

    if (
      !(
        "InputVerifierAddress" in metadata &&
        typeof metadata.InputVerifierAddress === "string" &&
        metadata.InputVerifierAddress.startsWith("0x")
      )
    ) {
      return undefined;
    }

    if (
      !(
        "KMSVerifierAddress" in metadata &&
        typeof metadata.KMSVerifierAddress === "string" &&
        metadata.KMSVerifierAddress.startsWith("0x")
      )
    ) {
      return undefined;
    }

    return metadata as {
      ACLAddress: `0x${string}`;
      InputVerifierAddress: `0x${string}`;
      KMSVerifierAddress: `0x${string}`;
    };
  } catch {
    return undefined;
  }
}
