import type React from 'react';

import type {
  UserRequestAlertViewProps,
  UserRequestConfirmViewProps,
  UserRequestPromptViewProps,
} from '../../react/user-request-view-props';
import type { UserRequestKind } from '../../runtime/user-request-runtime';

export interface UserRequestPresentationEntries {
  readonly alert?: React.ComponentType<UserRequestAlertViewProps>;
  readonly confirm?: React.ComponentType<UserRequestConfirmViewProps>;
  readonly prompt?: React.ComponentType<UserRequestPromptViewProps>;
}

export class UserRequestPresentationRegistry {
  private entries: UserRequestPresentationEntries = {};

  alert(view: React.ComponentType<UserRequestAlertViewProps>): void {
    this.entries = {
      ...this.entries,
      alert: view,
    };
  }

  confirm(view: React.ComponentType<UserRequestConfirmViewProps>): void {
    this.entries = {
      ...this.entries,
      confirm: view,
    };
  }

  getEntries(): UserRequestPresentationEntries {
    return { ...this.entries };
  }

  has(kind: UserRequestKind): boolean {
    return this.entries[kind] !== undefined;
  }

  prompt(view: React.ComponentType<UserRequestPromptViewProps>): void {
    this.entries = {
      ...this.entries,
      prompt: view,
    };
  }
}
