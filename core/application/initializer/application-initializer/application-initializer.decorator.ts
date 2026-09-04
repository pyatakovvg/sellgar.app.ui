import { Injectable } from '../../../di/injection/decorators';

export const APPLICATION_INITIALIZER_METADATA_KEY = Symbol('tiyn-app:application-initializer:metadata');

export const Initializer = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(APPLICATION_INITIALIZER_METADATA_KEY, true, constructor);
  };
};

export const isApplicationInitializerToken = (token: unknown): token is Function => {
  return typeof token === 'function' && Reflect.getMetadata(APPLICATION_INITIALIZER_METADATA_KEY, token) === true;
};
