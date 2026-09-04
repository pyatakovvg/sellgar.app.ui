import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from '../../contract/user-request-service';

import type { UserRequestRequest } from './user-request-request.ts';

export type UserRequestRuntimeListener = () => void;

export abstract class UserRequestRuntimeInterface {
  abstract apply(requestId: string, value?: string): void;

  abstract cancel(requestId: string): void;

  abstract dispose(): void;

  abstract getSnapshot<TContent = unknown>(): UserRequestRequest<TContent> | null;

  abstract open<TContent>(kind: 'alert', payload: UserRequestAlertPayload<TContent>): Promise<void>;

  abstract open<TContent>(kind: 'confirm', payload: UserRequestConfirmPayload<TContent>): Promise<boolean>;

  abstract open<TContent>(kind: 'prompt', payload: UserRequestPromptPayload<TContent>): Promise<string | null>;

  abstract subscribe(listener: UserRequestRuntimeListener): () => void;
}
