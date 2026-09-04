import { Injectable } from '../../../di/injection/decorators';

export const CONTROLLER_METADATA_KEY = Symbol('tiyn-app:controller:metadata');

export const Controller = (): ClassDecorator => {
  return (constructor) => {
    Injectable()(constructor);
    Reflect.defineMetadata(CONTROLLER_METADATA_KEY, true, constructor);
  };
};

export const isControllerToken = (token: unknown): token is Function => {
  return typeof token === 'function' && Reflect.getMetadata(CONTROLLER_METADATA_KEY, token) === true;
};
