import type {
  UserRequestAlertRequest,
  UserRequestConfirmRequest,
  UserRequestPromptRequest,
  UserRequestRequest,
} from '../../runtime/user-request-runtime';

export interface UserRequestViewProps<TRequest extends UserRequestRequest = UserRequestRequest> {
  readonly request: TRequest;
  readonly apply: (value?: string) => void;
  readonly cancel: () => void;
}

export type UserRequestAlertViewProps = UserRequestViewProps<UserRequestAlertRequest>;

export type UserRequestConfirmViewProps = UserRequestViewProps<UserRequestConfirmRequest>;

export type UserRequestPromptViewProps = UserRequestViewProps<UserRequestPromptRequest>;
