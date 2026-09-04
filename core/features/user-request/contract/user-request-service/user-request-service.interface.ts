import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from './user-request-payload.ts';

export abstract class UserRequestServiceInterface<TContent = unknown> {
  abstract alert(payload: UserRequestAlertPayload<TContent>): Promise<void>;

  abstract confirm(payload: UserRequestConfirmPayload<TContent>): Promise<boolean>;

  abstract prompt(payload: UserRequestPromptPayload<TContent>): Promise<string | null>;
}
