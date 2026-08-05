import type React from 'react';

import type { RenderableView } from '../../../react/view/renderable-view';
import type { ProviderToken } from '../../../runtime/provider/provider-token.ts';

export const WIDGET_METADATA_KEY = Symbol('tiyn-app:widget:metadata');

export interface WidgetMetadata<TProps extends object = object> {
  readonly exception?: React.ReactNode;
  readonly fallback?: React.ReactNode;
  readonly providers?: readonly ProviderToken<TProps>[];
  readonly view: RenderableView<TProps>;
}

export abstract class WidgetDefinition<TProps extends object = object> {
  declare readonly __widgetProps?: TProps;
}

export type WidgetConstructor<TProps extends object = object> = abstract new (
  ...args: never[]
) => WidgetDefinition<TProps>;

export type WidgetProps<TWidget extends WidgetConstructor> =
  TWidget extends WidgetConstructor<infer TProps> ? TProps : never;

export const isWidgetConstructor = (value: unknown): value is WidgetConstructor => {
  if (typeof value !== 'function') {
    return false;
  }

  return Reflect.hasMetadata(WIDGET_METADATA_KEY, value);
};

export const getWidgetMetadata = <TProps extends object = object>(
  widget: WidgetConstructor,
): WidgetMetadata<TProps> => {
  const metadata = Reflect.getMetadata(WIDGET_METADATA_KEY, widget) as WidgetMetadata<TProps> | undefined;

  if (metadata === undefined) {
    throw new Error('Метаданные виджета не определены.');
  }

  return metadata;
};

export const Widget = <TProps extends object = object>(metadata: WidgetMetadata<TProps>): ClassDecorator => {
  return (constructor) => {
    Reflect.defineMetadata(WIDGET_METADATA_KEY, metadata, constructor);
  };
};
