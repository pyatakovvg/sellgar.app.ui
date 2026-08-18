import type { RuntimeScope } from '../../../runtime/scope/base';

import type { WidgetConstructor } from '../../declaration/widget';

import type { WidgetRuntime } from '../widget-runtime';

export interface WidgetRuntimeFactoryOptions<TProps extends object = Record<string, never>> {
  readonly ownerScope: RuntimeScope;
  readonly props?: TProps;
  readonly runtimeKey?: string;
}

export abstract class WidgetRuntimeFactoryInterface {
  abstract create<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps>;

  abstract consumePrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null;

  abstract getPrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null;

  abstract prepare<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps>;

  abstract releasePrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null;
}
