import { SDK_CDN_URL } from "../constants";
import type { FhevmRelayerSDK, FhevmWindow } from "../types/relayer";

type Trace = (message?: unknown, ...optionalParams: unknown[]) => void;

export class RelayerSDKLoader {
  private readonly trace?: Trace;

  constructor(options: { trace?: Trace }) {
    this.trace = options.trace;
  }

  public isLoaded() {
    if (typeof window === "undefined") {
      throw new Error("RelayerSDKLoader: can only be used in the browser.");
    }
    return isFhevmWindow(window, this.trace);
  }

  public load(): Promise<void> {
    console.log("[RelayerSDKLoader] load...");

    if (typeof window === "undefined") {
      console.log("[RelayerSDKLoader] window === undefined");
      return Promise.reject(
        new Error("RelayerSDKLoader: can only be used in the browser.")
      );
    }

    if ("relayerSDK" in window) {
      if (!isFhevmRelayerSDK(window.relayerSDK, this.trace)) {
        console.log("[RelayerSDKLoader] window.relayerSDK === undefined");
        throw new Error("RelayerSDKLoader: Unable to load FHEVM Relayer SDK");
      }
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const existingScript = document.querySelector(
        `script[src="${SDK_CDN_URL}"]`
      );

      if (existingScript) {
        if (!isFhevmWindow(window, this.trace)) {
          reject(
            new Error(
              "RelayerSDKLoader: window object does not contain a valid relayerSDK object."
            )
          );
        }
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = SDK_CDN_URL;
      script.type = "text/javascript";
      script.async = true;

      script.onload = () => {
        if (!isFhevmWindow(window, this.trace)) {
          console.log("[RelayerSDKLoader] script onload FAILED...");
          reject(
            new Error(
              `RelayerSDKLoader: Relayer SDK script has been successfully loaded from ${SDK_CDN_URL}, however, the window.relayerSDK object is invalid.`
            )
          );
        }
        resolve();
      };

      script.onerror = () => {
        console.log("[RelayerSDKLoader] script onerror... ");
        reject(
          new Error(
            `RelayerSDKLoader: Failed to load Relayer SDK from ${SDK_CDN_URL}`
          )
        );
      };

      console.log("[RelayerSDKLoader] add script to DOM...");
      document.head.appendChild(script);
      console.log("[RelayerSDKLoader] script added!");
    });
  }
}

export function isFhevmWindow(
  win: unknown,
  trace?: Trace
): win is FhevmWindow {
  if (typeof win === "undefined") {
    trace?.("RelayerSDKLoader: window object is undefined");
    return false;
  }
  if (win === null) {
    trace?.("RelayerSDKLoader: window object is null");
    return false;
  }
  if (typeof win !== "object") {
    trace?.("RelayerSDKLoader: window is not an object");
    return false;
  }
  if (!("relayerSDK" in win)) {
    trace?.("RelayerSDKLoader: window does not contain 'relayerSDK' property");
    return false;
  }
  return isFhevmRelayerSDK((win as FhevmWindow).relayerSDK, trace);
}

function isFhevmRelayerSDK(
  value: unknown,
  trace?: Trace
): value is FhevmRelayerSDK {
  if (typeof value === "undefined") {
    trace?.("RelayerSDKLoader: relayerSDK is undefined");
    return false;
  }
  if (value === null) {
    trace?.("RelayerSDKLoader: relayerSDK is null");
    return false;
  }
  if (typeof value !== "object") {
    trace?.("RelayerSDKLoader: relayerSDK is not an object");
    return false;
  }
  if (!hasProperty(value, "initSDK", "function", trace)) {
    trace?.("RelayerSDKLoader: relayerSDK.initSDK is invalid");
    return false;
  }
  if (!hasProperty(value, "createInstance", "function", trace)) {
    trace?.("RelayerSDKLoader: relayerSDK.createInstance is invalid");
    return false;
  }
  if (!hasProperty(value, "SepoliaConfig", "object", trace)) {
    trace?.("RelayerSDKLoader: relayerSDK.SepoliaConfig is invalid");
    return false;
  }
  if ("__initialized__" in value) {
    const initialized =
      (value as { __initialized__?: unknown }).__initialized__;
    if (initialized !== true && initialized !== false) {
      trace?.("RelayerSDKLoader: relayerSDK.__initialized__ is invalid");
      return false;
    }
  }
  return true;
}

function hasProperty<
  T extends object,
  K extends PropertyKey,
  V extends string
>(
  obj: T,
  propertyName: K,
  propertyType: V,
  trace?: Trace
): obj is T &
  Record<
    K,
    V extends "string"
      ? string
      : V extends "number"
      ? number
      : V extends "object"
      ? object
      : V extends "boolean"
      ? boolean
      : V extends "function"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (...args: any[]) => any
      : unknown
  > {
  if (!obj || typeof obj !== "object") {
    return false;
  }

  if (!(propertyName in obj)) {
    trace?.(`RelayerSDKLoader: missing ${String(propertyName)}.`);
    return false;
  }

  const value = (obj as Record<K, unknown>)[propertyName];

  if (value === null || value === undefined) {
    trace?.(`RelayerSDKLoader: ${String(propertyName)} is null or undefined.`);
    return false;
  }

  if (typeof value !== propertyType) {
    trace?.(
      `RelayerSDKLoader: ${String(propertyName)} is not a ${propertyType}.`
    );
    return false;
  }

  return true;
}
