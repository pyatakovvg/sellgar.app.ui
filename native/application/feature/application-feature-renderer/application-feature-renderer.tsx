import React from 'react';

import type { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import type { PresentationLayerValue } from '../../rendering/presentation-layer';

export type ApplicationFeatureRenderer = () => React.ReactNode;

type ApplicationFeatureLayer = Exclude<PresentationLayerValue, 'frame'>;

interface ApplicationFeatureRendererRegistration {
  readonly layer: ApplicationFeatureLayer;
  readonly render: ApplicationFeatureRenderer;
}

const applicationFeatureRenderers = new WeakMap<ApplicationFeatureInterface, ApplicationFeatureRendererRegistration>();

export const configureApplicationFeatureRenderer = (
  feature: ApplicationFeatureInterface,
  layer: ApplicationFeatureLayer,
  renderer: ApplicationFeatureRenderer,
): void => {
  applicationFeatureRenderers.set(feature, Object.freeze({ layer, render: renderer }));
};

export const renderApplicationFeatures = (
  features: readonly ApplicationFeatureInterface[],
  layer: ApplicationFeatureLayer,
): React.ReactNode => {
  return features.map((feature, index) => {
    const registration = applicationFeatureRenderers.get(feature);

    return registration?.layer === layer ? (
      <ApplicationFeaturePresentation key={index} renderer={registration.render} />
    ) : null;
  });
};

interface ApplicationFeaturePresentationProps {
  readonly renderer: ApplicationFeatureRenderer;
}

const ApplicationFeaturePresentation: React.FC<ApplicationFeaturePresentationProps> = (props) => {
  return <>{props.renderer()}</>;
};
