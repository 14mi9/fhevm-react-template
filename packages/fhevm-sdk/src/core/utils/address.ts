import { isAddress } from "ethers";

export function isHexAddress(value: unknown): value is `0x${string}` {
  if (typeof value !== "string") {
    return false;
  }
  return isAddress(value);
}
