import { Feature as CoreFeature } from '../../../../core/application/feature/application-feature/application-feature.decorator.ts';
import type { ApplicationFeatureToken } from '../../../../core/application/feature/application-feature/application-feature.interface.ts';

import type { ApplicationFeatureOptions } from './application-feature.options.ts';

export type ApplicationFeatureRendering = Readonly<Pick<ApplicationFeatureOptions, 'presentation' | 'wrapper'>>;

const FEATURE_RENDERING = new WeakMap<ApplicationFeatureToken, ApplicationFeatureRendering>();

export const Feature = (options: ApplicationFeatureOptions = {}): ClassDecorator => {
  return (constructor) => {
    CoreFeature()(constructor);
    FEATURE_RENDERING.set(
      constructor as unknown as ApplicationFeatureToken,
      Object.freeze({
        presentation: options.presentation ? Object.freeze({ ...options.presentation }) : undefined,
        wrapper: options.wrapper,
      }),
    );
  };
};

export const getApplicationFeatureRendering = (
  feature: ApplicationFeatureToken,
): ApplicationFeatureRendering | undefined => {
  return FEATURE_RENDERING.get(feature);
};
