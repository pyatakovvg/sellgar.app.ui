import type { GuardToken } from '../guard';

export interface GuardRejectedExceptionOptions {
  readonly guard: GuardToken;
  readonly method?: string | symbol;
}

export class GuardRejectedException extends Error {
  readonly guard: GuardToken;
  readonly method: string | symbol | undefined;

  constructor(options: GuardRejectedExceptionOptions) {
    super(createGuardRejectedMessage(options));

    this.name = 'GuardRejectedException';
    this.guard = options.guard;
    this.method = options.method;
  }
}

const createGuardRejectedMessage = (options: GuardRejectedExceptionOptions): string => {
  if (options.method === undefined) {
    return 'Guard rejected operation.';
  }

  return `Guard rejected operation: ${String(options.method)}.`;
};
