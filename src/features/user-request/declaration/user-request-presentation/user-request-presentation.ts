import type React from 'react';

import type { UserRequestViewProps } from '../../react/user-request-view-props';
import type { UserRequestKind, UserRequestRequest } from '../../runtime/user-request-runtime';

import {
  UserRequestPresentationRegistry,
  type UserRequestPresentationEntries,
} from './user-request-presentation-registry.ts';
import { UserRequestPresentationNotConfiguredException } from './user-request-presentation-not-configured.exception.ts';

export type UserRequestPresentationDefinition = (registry: UserRequestPresentationRegistry) => void;

export class UserRequestPresentation {
  private constructor(private readonly entries: UserRequestPresentationEntries) {}

  static define(definition: UserRequestPresentationDefinition): UserRequestPresentation {
    const registry = new UserRequestPresentationRegistry();

    definition(registry);

    return new UserRequestPresentation(registry.getEntries());
  }

  resolve(kind: UserRequestKind): React.ComponentType<UserRequestViewProps<UserRequestRequest>> {
    const view = this.entries[kind];

    if (!view) {
      throw new UserRequestPresentationNotConfiguredException(kind);
    }

    return view as React.ComponentType<UserRequestViewProps<UserRequestRequest>>;
  }
}
