import type {
  UserRequestAlertPayload,
  UserRequestConfirmPayload,
  UserRequestPromptPayload,
} from '../../contract/user-request-service';

export type UserRequestKind = 'alert' | 'confirm' | 'prompt';

export interface UserRequestBaseRequest<TKind extends UserRequestKind, TResult> {
  readonly id: string;
  readonly kind: TKind;
  readonly payload: UserRequestPayloadByKind<TKind>;
  readonly resolve: (result: TResult) => void;
}

export type UserRequestAlertRequest = UserRequestBaseRequest<'alert', void>;

export type UserRequestConfirmRequest = UserRequestBaseRequest<'confirm', boolean>;

export type UserRequestPromptRequest = UserRequestBaseRequest<'prompt', string | null>;

export type UserRequestRequest = UserRequestAlertRequest | UserRequestConfirmRequest | UserRequestPromptRequest;

export interface UserRequestPayloadMap {
  readonly alert: UserRequestAlertPayload;
  readonly confirm: UserRequestConfirmPayload;
  readonly prompt: UserRequestPromptPayload;
}

export interface UserRequestResultMap {
  readonly alert: void;
  readonly confirm: boolean;
  readonly prompt: string | null;
}

export type UserRequestPayloadByKind<TKind extends UserRequestKind> = UserRequestPayloadMap[TKind];

export type UserRequestResultByKind<TKind extends UserRequestKind> = UserRequestResultMap[TKind];
