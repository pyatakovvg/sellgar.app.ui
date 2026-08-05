import React from 'react';

import { ApplicationFeatureInterface } from '../../../application/feature/application-feature';
import { UseBindings } from '../../../di/composition/use-bindings';
import { UserRequestPresentation } from '../declaration/user-request-presentation';
import { UserRequestLayer } from '../react/user-request-layer';
import { UserRequestBindings } from '../binding';

export interface UserRequestFeatureOptions {
  readonly presentation: UserRequestPresentation;
}

@UseBindings(UserRequestBindings)
export class UserRequestFeature extends ApplicationFeatureInterface {
  private constructor(private readonly options: UserRequestFeatureOptions) {
    super();
  }

  static configure(options: UserRequestFeatureOptions): UserRequestFeature {
    return new UserRequestFeature(options);
  }

  createLayer(): React.ReactNode {
    return <UserRequestLayer presentation={this.options.presentation} />;
  }
}
