export type UserRequestStatus = 'info' | 'success' | 'warning' | 'destructive';

export interface UserRequestBasePayload<TContent = unknown> {
  readonly applyText?: TContent;
  readonly description?: TContent;
  /** Presentation status; omitted keeps the view's neutral appearance. */
  readonly status?: UserRequestStatus;
  readonly title?: TContent;
}

export interface UserRequestAlertPayload<TContent = unknown> extends UserRequestBasePayload<TContent> {}

export interface UserRequestConfirmPayload<TContent = unknown> extends UserRequestBasePayload<TContent> {
  readonly cancelText?: TContent;
}

export interface UserRequestPromptPayload<TContent = unknown> extends UserRequestBasePayload<TContent> {
  readonly cancelText?: TContent;
  readonly defaultValue?: string;
  readonly placeholder?: string;
}
