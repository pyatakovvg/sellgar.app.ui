import type {
  UserRequestAlertRequest,
  UserRequestConfirmRequest,
  UserRequestPromptRequest,
  UserRequestRequest,
} from '../../contract/user-request-service';

export interface UserRequestViewProps<TRequest extends UserRequestRequest = UserRequestRequest> {
  readonly request: TRequest;

  apply(value?: string): void;

  cancel(): void;
}

export type UserRequestAlertViewProps = UserRequestViewProps<UserRequestAlertRequest>;
export type UserRequestConfirmViewProps = UserRequestViewProps<UserRequestConfirmRequest>;
export type UserRequestPromptViewProps = UserRequestViewProps<UserRequestPromptRequest>;
