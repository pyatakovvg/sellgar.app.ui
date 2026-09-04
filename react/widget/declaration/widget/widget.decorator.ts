import type React from 'react';

import {
  WidgetDefinition,
  configureWidgetRuntimeDefinition,
  type WidgetConstructor,
  type WidgetProps,
} from '../../../../core/widget/declaration/widget';
import type { ProviderToken } from '../../../../core/runtime/provider/provider-token';
import type { RenderableView } from '../../../view/renderable-view';

const WIDGET_METADATA_KEY = Symbol('@sellgar/app:react:widget:metadata');

export interface WidgetMetadata<TProps extends object = object> {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly providers?: readonly ProviderToken<TProps>[];
  readonly view: RenderableView<TProps>;
}

export const Widget = <TProps extends object = object>(metadata: WidgetMetadata<TProps>): ClassDecorator => {
  return (constructor) => {
    const token = constructor as unknown as WidgetConstructor<TProps>;
    const frozenMetadata = Object.freeze({
      ...metadata,
      providers: Object.freeze([...(metadata.providers ?? [])]),
    });

    configureWidgetRuntimeDefinition(token, {
      providers: frozenMetadata.providers,
    });
    Reflect.defineMetadata(WIDGET_METADATA_KEY, frozenMetadata, constructor);
  };
};

export const getWidgetMetadata = <TProps extends object>(token: WidgetConstructor<TProps>): WidgetMetadata<TProps> => {
  const metadata = Reflect.getMetadata(WIDGET_METADATA_KEY, token) as WidgetMetadata<TProps> | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные React Widget не определены.');
  }

  return metadata;
};

export const isWidgetConstructor = (value: unknown): value is WidgetConstructor => {
  return typeof value === 'function' && Reflect.hasMetadata(WIDGET_METADATA_KEY, value);
};

export { WidgetDefinition };
export type { WidgetConstructor, WidgetProps };
