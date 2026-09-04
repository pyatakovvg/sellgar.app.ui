import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureInterface } from '../../feature/application-feature';
import type { ApplicationInitializerToken } from '../../initializer/application-initializer';
import type { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';

export type ApplicationInitializerDeclaration = ApplicationInitializerToken | ApplicationInitializerGroup;

export abstract class ApplicationConfiguratorInterface {
  abstract features(features: readonly ApplicationFeatureInterface[]): void;

  abstract initializers(initializers: readonly ApplicationInitializerDeclaration[]): void;

  abstract router(router: Router): void;
}
