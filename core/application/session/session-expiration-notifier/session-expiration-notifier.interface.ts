import type { HttpException } from '../../../http/exception/http-exception';

export interface SessionExpirationNotificationContext {
  readonly error: HttpException;
  readonly signal: AbortSignal;
}

export abstract class SessionExpirationNotifierInterface {
  abstract notify(context: SessionExpirationNotificationContext): void | Promise<void>;
}
