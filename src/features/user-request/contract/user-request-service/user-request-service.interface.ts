import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from './user-request-payload.ts';

export abstract class UserRequestServiceInterface {
  abstract alert(payload: UserRequestAlertPayload): Promise<void>;

  abstract confirm(payload: UserRequestConfirmPayload): Promise<boolean>;

  abstract prompt(payload: UserRequestPromptPayload): Promise<string | null>;
}
