import React from 'react';
import type { ApplicationFeatureToken } from '../../../../core/application/feature/application-feature/index.ts';
import { getApplicationFeatureRendering, type ApplicationFeatureOptions } from '../application-feature/index.ts';

const FEATURE_KEYS = new WeakMap<ApplicationFeatureToken, number>();
let nextFeatureKey = 0;

const getFeatureKey = (feature: ApplicationFeatureToken): number => {
  const existing = FEATURE_KEYS.get(feature);
  if (existing !== undefined) return existing;
  const key = nextFeatureKey++;
  FEATURE_KEYS.set(feature, key);
  return key;
};

export const wrapApplicationFeatures = (
  features: readonly ApplicationFeatureToken[],
  children: React.ReactNode,
): React.ReactNode =>
  features.reduceRight((content, feature) => {
    const Wrapper = getApplicationFeatureRendering(feature)?.wrapper;
    return Wrapper ? <Wrapper key={getFeatureKey(feature)}>{content}</Wrapper> : content;
  }, children);

export const renderApplicationFeatures = (
  features: readonly ApplicationFeatureToken[],
  layer: NonNullable<ApplicationFeatureOptions['presentation']>['layer'],
): React.ReactNode =>
  features.map((feature) => {
    const presentation = getApplicationFeatureRendering(feature)?.presentation;
    return presentation?.layer === layer ? (
      <React.Fragment key={getFeatureKey(feature)}>{presentation.view}</React.Fragment>
    ) : null;
  });
