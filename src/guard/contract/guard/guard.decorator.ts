import { Injectable } from '../../../di/injection/decorators';

export const GUARD_METADATA_KEY = Symbol('tiyn-app:guard:metadata');

export const Guard = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(GUARD_METADATA_KEY, true, constructor);
  };
};

export const isGuardToken = (token: unknown): token is Function => {
  return typeof token === 'function' && Reflect.getMetadata(GUARD_METADATA_KEY, token) === true;
};
