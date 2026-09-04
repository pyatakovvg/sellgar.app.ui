import type React from 'react';

import type { ProviderToken } from '../../../../core/runtime/provider/provider-token';
import type { LayoutConstructor } from '../../../layout/declaration/layout';
import type { RenderableView } from '../../../view/renderable-view';

const MODULE_METADATA_KEY = Symbol('@sellgar/app:react:module:metadata');

export interface ModuleMetadata {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly layouts?: readonly LayoutConstructor[];
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView;
}

export type ModuleConstructor = abstract new (...args: never[]) => unknown;

export const isModuleConstructor = (value: unknown): value is ModuleConstructor => {
  return typeof value === 'function' && Reflect.hasMetadata(MODULE_METADATA_KEY, value);
};

export const getModuleMetadata = (module: ModuleConstructor): ModuleMetadata => {
  const metadata = Reflect.getMetadata(MODULE_METADATA_KEY, module) as ModuleMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные React Module не определены.');
  }

  return metadata;
};

export const Module = (metadata: ModuleMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(MODULE_METADATA_KEY, metadata, constructor);
  };
};
