export interface ExceptionOptions {
  readonly cause?: unknown;
}

export class Exception extends Error {
  constructor(message?: string, options: ExceptionOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
  }
}
