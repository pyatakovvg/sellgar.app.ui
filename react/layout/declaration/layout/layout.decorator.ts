import type React from 'react';
import type { LayoutContentKind } from '../../../../shared/layout/declaration/layout-content-kind';

import type { ProviderToken } from '../../../../core/runtime/provider/provider-token';
import type { RenderableView } from '../../../view/renderable-view';

const LAYOUT_METADATA_KEY = Symbol('@tiyn/app:react:layout:metadata');

export interface LayoutViewProps {
  readonly children: React.ReactNode;
  readonly kind: LayoutContentKind;
}

export interface LayoutMetadata {
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView<LayoutViewProps>;
}

export type LayoutConstructor = abstract new (...args: never[]) => unknown;

export const isLayoutConstructor = (value: unknown): value is LayoutConstructor => {
  return typeof value === 'function' && Reflect.hasMetadata(LAYOUT_METADATA_KEY, value);
};

export const getLayoutMetadata = (layout: LayoutConstructor): LayoutMetadata => {
  const metadata = Reflect.getMetadata(LAYOUT_METADATA_KEY, layout) as LayoutMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные React Layout не определены.');
  }

  return metadata;
};

export const Layout = (metadata: LayoutMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(LAYOUT_METADATA_KEY, metadata, constructor);
  };
};
