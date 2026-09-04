import type { ProviderToken } from '../../../runtime/provider/provider-token';

export abstract class WidgetDefinition<TProps extends object = object> {
  declare readonly __widgetProps?: TProps;
}

export type WidgetConstructor<TProps extends object = object> = abstract new (
  ...args: never[]
) => WidgetDefinition<TProps>;

export type WidgetProps<TWidget extends WidgetConstructor> =
  TWidget extends WidgetConstructor<infer TProps> ? TProps : never;

export interface WidgetRuntimeDefinition<TProps extends object = object> {
  readonly bindingOwners: readonly unknown[];
  readonly providers: readonly ProviderToken<TProps>[];
  readonly token: WidgetConstructor<TProps>;
}

export interface ConfigureWidgetRuntimeDefinitionOptions<TProps extends object = object> {
  readonly bindingOwners?: readonly unknown[];
  readonly providers?: readonly ProviderToken<TProps>[];
}

const definitions = new WeakMap<object, WidgetRuntimeDefinition>();

export const configureWidgetRuntimeDefinition = <TProps extends object>(
  token: WidgetConstructor<TProps>,
  options: ConfigureWidgetRuntimeDefinitionOptions<TProps> = {},
): WidgetRuntimeDefinition<TProps> => {
  const definition = Object.freeze({
    bindingOwners: Object.freeze([...(options.bindingOwners ?? [])]),
    providers: Object.freeze([...(options.providers ?? [])]),
    token,
  });

  definitions.set(token, definition as WidgetRuntimeDefinition);

  return definition;
};

export const getWidgetRuntimeDefinition = <TProps extends object>(
  token: WidgetConstructor<TProps>,
): WidgetRuntimeDefinition<TProps> => {
  const definition = definitions.get(token) as WidgetRuntimeDefinition<TProps> | undefined;

  if (definition === undefined) {
    throw new Error('Runtime definition виджета не определён. Используйте renderer-декоратор @Widget().');
  }

  return definition;
};

export const isWidgetConstructor = (value: unknown): value is WidgetConstructor => {
  return ((typeof value === 'object' && value !== null) || typeof value === 'function') && definitions.has(value);
};
