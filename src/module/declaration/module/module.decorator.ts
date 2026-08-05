import type React from 'react';

import type { RenderableView } from '../../../react/view/renderable-view';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';

export const MODULE_METADATA_KEY = Symbol('tiyn-app:module:metadata');

export interface ModuleMetadata {
  readonly exception?: React.ReactNode;
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView;
}

export type ModuleConstructor = abstract new (...args: never[]) => unknown;

export const isModuleConstructor = (value: unknown): value is ModuleConstructor => {
  if (typeof value !== 'function') {
    return false;
  }

  return Reflect.hasMetadata(MODULE_METADATA_KEY, value);
};

export const getModuleMetadata = (module: ModuleConstructor): ModuleMetadata => {
  const metadata = Reflect.getMetadata(MODULE_METADATA_KEY, module) as ModuleMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные модуля не определены.');
  }

  return metadata;
};

export const Module = (metadata: ModuleMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(MODULE_METADATA_KEY, metadata, constructor);
  };
};
