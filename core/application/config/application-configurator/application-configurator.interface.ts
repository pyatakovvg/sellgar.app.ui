import type { MetadataCompositionOptions } from '../../../metadata/composition/metadata-composition';
import type { Router } from '../../../router/declaration/router';
import type { ApplicationFeatureToken } from '../../feature/application-feature';
import type { ApplicationInitializerToken } from '../../initializer/application-initializer';
import type { ApplicationInitializerGroup } from '../../initializer/application-initializer-group';
import type { ProviderToken } from '../../../runtime/provider/provider-token';
import type { MetricToken } from '../../metric/declaration/metric';

export type ApplicationInitializerDeclaration = ApplicationInitializerToken | ApplicationInitializerGroup;

export abstract class ApplicationConfiguratorInterface {
  abstract metadata(options: MetadataCompositionOptions): void;

  abstract metrics(metrics: readonly MetricToken[]): void;

  abstract providers(providers: readonly ProviderToken[]): void;

  abstract features(features: readonly ApplicationFeatureToken[]): void;

  abstract initializers(initializers: readonly ApplicationInitializerDeclaration[]): void;

  abstract router(router: Router): void;
}
