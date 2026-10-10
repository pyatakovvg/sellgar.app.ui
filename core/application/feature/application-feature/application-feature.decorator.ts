import { Injectable } from '../../../di/injection/decorators';

import type { ApplicationFeatureToken } from './application-feature.interface.ts';

const APPLICATION_FEATURE_METADATA_KEY = Symbol('@tiyn/app:application-feature:metadata');

export const Feature = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(APPLICATION_FEATURE_METADATA_KEY, true, constructor);
  };
};

export const isApplicationFeatureToken = (token: unknown): token is ApplicationFeatureToken => {
  return typeof token === 'function' && Reflect.getMetadata(APPLICATION_FEATURE_METADATA_KEY, token) === true;
};
