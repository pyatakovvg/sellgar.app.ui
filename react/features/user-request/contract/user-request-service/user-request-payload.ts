import type React from 'react';

import type {
  UserRequestAlertPayload as CoreUserRequestAlertPayload,
  UserRequestBasePayload as CoreUserRequestBasePayload,
  UserRequestConfirmPayload as CoreUserRequestConfirmPayload,
  UserRequestPromptPayload as CoreUserRequestPromptPayload,
} from '../../../../../core/features/user-request/contract/user-request-service';
import type {
  UserRequestAlertRequest as CoreUserRequestAlertRequest,
  UserRequestConfirmRequest as CoreUserRequestConfirmRequest,
  UserRequestPromptRequest as CoreUserRequestPromptRequest,
  UserRequestRequest as CoreUserRequestRequest,
} from '../../../../../core/features/user-request/runtime/user-request-runtime';

export type UserRequestBasePayload = CoreUserRequestBasePayload<React.ReactNode>;
export type UserRequestAlertPayload = CoreUserRequestAlertPayload<React.ReactNode>;
export type UserRequestConfirmPayload = CoreUserRequestConfirmPayload<React.ReactNode>;
export type UserRequestPromptPayload = CoreUserRequestPromptPayload<React.ReactNode>;

export type UserRequestAlertRequest = CoreUserRequestAlertRequest<React.ReactNode>;
export type UserRequestConfirmRequest = CoreUserRequestConfirmRequest<React.ReactNode>;
export type UserRequestPromptRequest = CoreUserRequestPromptRequest<React.ReactNode>;
export type UserRequestRequest = CoreUserRequestRequest<React.ReactNode>;

export interface UserRequestService {
  alert(payload: UserRequestAlertPayload): Promise<void>;

  confirm(payload: UserRequestConfirmPayload): Promise<boolean>;

  prompt(payload: UserRequestPromptPayload): Promise<string | null>;
}
