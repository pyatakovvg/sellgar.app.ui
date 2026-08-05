import type React from 'react';

import type { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';
import type { ApplicationInitializerToken } from '../../initializer/application-initializer';
import type { ApplicationFeatureInterface } from '../../feature/application-feature';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { Router } from '../../../router/declaration/router';

export interface ApplicationComponents {
  readonly splash?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly exception?: React.ReactNode;
  readonly failed?: React.ReactNode;
  readonly forbidden?: React.ReactNode;
  readonly notFound?: React.ReactNode;
}

export type ApplicationInitializerDeclaration = ApplicationInitializerToken | ApplicationInitializerGroup;

export abstract class ApplicationConfiguratorInterface {
  abstract components(components: ApplicationComponents): void;

  abstract features(features: readonly ApplicationFeatureInterface[]): void;

  abstract initializers(initializers: readonly ApplicationInitializerDeclaration[]): void;

  abstract layouts(layouts: LayoutConstructor[]): void;

  abstract router(router: Router): void;
}
