import type React from 'react';

import type { RenderableView } from '../../../react/view/renderable-view';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';

export const LAYOUT_METADATA_KEY = Symbol('tiyn-app:layout:metadata');

export interface LayoutViewProps {
  readonly children: React.ReactNode;
}

export interface LayoutMetadata {
  readonly providers?: readonly ProviderToken[];
  readonly view: RenderableView<LayoutViewProps>;
}

export type LayoutConstructor = abstract new (...args: never[]) => unknown;

export const getLayoutMetadata = (layout: LayoutConstructor): LayoutMetadata => {
  const metadata = Reflect.getMetadata(LAYOUT_METADATA_KEY, layout) as LayoutMetadata | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные лейаута не определены.');
  }

  return metadata;
};

export const Layout = (metadata: LayoutMetadata): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(LAYOUT_METADATA_KEY, metadata, constructor);
  };
};
