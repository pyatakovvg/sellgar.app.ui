import type React from 'react';

export interface UserRequestBasePayload {
  readonly applyText?: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly title?: React.ReactNode;
}

export interface UserRequestAlertPayload extends UserRequestBasePayload {}

export interface UserRequestConfirmPayload extends UserRequestBasePayload {
  readonly cancelText?: React.ReactNode;
}

export interface UserRequestPromptPayload extends UserRequestBasePayload {
  readonly cancelText?: React.ReactNode;
  readonly defaultValue?: string;
  readonly placeholder?: string;
}
