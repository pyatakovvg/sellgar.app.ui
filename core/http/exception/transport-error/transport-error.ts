import { Exception } from '../../../exception/contract/exception';
import type { HttpRequestSource } from '../http-exception';

export interface TransportErrorOptions {
  readonly cause?: unknown;
  readonly request?: HttpRequestSource;
}

export class NetworkError extends Exception {
  constructor(message: string, options: TransportErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.request = options.request;
  }

  readonly request: HttpRequestSource | undefined;
}

export class TransportTimeoutError extends Exception {
  constructor(message: string, options: TransportErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.request = options.request;
  }

  readonly request: HttpRequestSource | undefined;
}
