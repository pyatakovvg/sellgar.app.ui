import type React from 'react';

import type { UserRequestKind } from '../../../../../core/features/user-request/runtime/user-request-runtime';
import type {
  UserRequestAlertViewProps,
  UserRequestConfirmViewProps,
  UserRequestPromptViewProps,
} from '../../presentation/user-request-view-props';

import { UserRequestPresentationNotConfiguredException } from './user-request-presentation-not-configured.exception.ts';
import {
  UserRequestPresentationRegistry,
  type UserRequestPresentationEntries,
} from './user-request-presentation-registry.ts';

export type UserRequestPresentationDefinition = (registry: UserRequestPresentationRegistry) => void;

type UserRequestView =
  | React.ComponentType<UserRequestAlertViewProps>
  | React.ComponentType<UserRequestConfirmViewProps>
  | React.ComponentType<UserRequestPromptViewProps>;

export class UserRequestPresentation {
  private constructor(private readonly entries: UserRequestPresentationEntries) {}

  static define(definition: UserRequestPresentationDefinition): UserRequestPresentation {
    const registry = new UserRequestPresentationRegistry();

    definition(registry);

    return new UserRequestPresentation(registry.getEntries());
  }

  resolve(kind: 'alert'): React.ComponentType<UserRequestAlertViewProps>;
  resolve(kind: 'confirm'): React.ComponentType<UserRequestConfirmViewProps>;
  resolve(kind: 'prompt'): React.ComponentType<UserRequestPromptViewProps>;
  resolve(kind: UserRequestKind): UserRequestView {
    const view = this.entries[kind];

    if (!view) {
      throw new UserRequestPresentationNotConfiguredException(kind);
    }

    return view;
  }
}
