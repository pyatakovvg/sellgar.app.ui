import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from '../../contract/user-request-service';

export type UserRequestKind = 'alert' | 'confirm' | 'prompt';

export interface UserRequestAlertRequest<TContent = unknown> {
  readonly id: string;
  readonly kind: 'alert';
  readonly payload: UserRequestAlertPayload<TContent>;
}

export interface UserRequestConfirmRequest<TContent = unknown> {
  readonly id: string;
  readonly kind: 'confirm';
  readonly payload: UserRequestConfirmPayload<TContent>;
}

export interface UserRequestPromptRequest<TContent = unknown> {
  readonly id: string;
  readonly kind: 'prompt';
  readonly payload: UserRequestPromptPayload<TContent>;
}

export type UserRequestRequest<TContent = unknown> =
  UserRequestAlertRequest<TContent> | UserRequestConfirmRequest<TContent> | UserRequestPromptRequest<TContent>;
