export class FhevmError extends Error {
  public readonly code: string;

  constructor(code: string, message?: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "FhevmError";
  }
}

export function throwFhevmError(
  code: string,
  message?: string,
  cause?: unknown
): never {
  throw new FhevmError(code, message, cause ? { cause } : undefined);
}

export class FhevmAbortError extends Error {
  constructor(message = "FHEVM operation was cancelled") {
    super(message);
    this.name = "FhevmAbortError";
  }
}
