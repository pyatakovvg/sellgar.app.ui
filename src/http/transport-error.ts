import type { HttpRequestSource } from './http-exception.ts';

export interface TransportErrorOptions {
  readonly cause?: unknown;
  readonly request?: HttpRequestSource;
}

export class NetworkError extends Error {
  constructor(message: string, options: TransportErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.request = options.request;
  }

  readonly request: HttpRequestSource | undefined;
}

export class TransportTimeoutError extends Error {
  constructor(message: string, options: TransportErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.request = options.request;
  }

  readonly request: HttpRequestSource | undefined;
}
