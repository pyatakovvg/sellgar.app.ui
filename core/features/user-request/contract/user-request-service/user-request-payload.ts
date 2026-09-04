export interface UserRequestBasePayload<TContent = unknown> {
  readonly applyText?: TContent;
  readonly description?: TContent;
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
