import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import { Injectable } from '../../../di/injection/decorators';

const REPORTER_METADATA_KEY = Symbol('@sellgar/app:reporter:metadata');

export const Reporter = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(REPORTER_METADATA_KEY, true, constructor);
  };
};

export const isReporterToken = (token: unknown): token is DependencyConstructor<unknown> => {
  return typeof token === 'function' && Reflect.getMetadata(REPORTER_METADATA_KEY, token) === true;
};
