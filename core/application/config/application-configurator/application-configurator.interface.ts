import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureToken } from '../../feature/application-feature';
import type { ApplicationInitializerToken } from '../../initializer/application-initializer';
import type { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';
import type { MetricToken } from '../../metric/declaration/metric';

export type ApplicationInitializerDeclaration = ApplicationInitializerToken | ApplicationInitializerGroup;

export abstract class ApplicationConfiguratorInterface {
  abstract metrics(metrics: readonly MetricToken[]): void;

  abstract features(features: readonly ApplicationFeatureToken[]): void;

  abstract initializers(initializers: readonly ApplicationInitializerDeclaration[]): void;

  abstract router(router: Router): void;
}
