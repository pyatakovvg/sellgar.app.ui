import { Injectable } from '../../../di/injection/decorators';

export const POLICY_METADATA_KEY = Symbol('tiyn-app:policy:metadata');

export const Policy = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(POLICY_METADATA_KEY, true, constructor);
  };
};

export const isPolicyToken = (token: unknown): token is Function => {
  return typeof token === 'function' && Reflect.getMetadata(POLICY_METADATA_KEY, token) === true;
};
