import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { Inject, Injectable, Optional } from '../../../di/injection/decorators';
import type {
  RuntimeProviderContextInterface,
  RuntimeProviderResult,
} from '../../../runtime/provider/runtime-provider';
import type { RuntimeScope } from '../../../runtime/scope/base';

import type { WidgetConstructor } from '../../declaration/widget';

import type { WidgetPreloadOptions, WidgetRuntimeFactoryOptions } from './widget-runtime-factory.interface.ts';
import { WidgetRuntimeFactoryInterface } from './widget-runtime-factory.interface.ts';
import { WidgetRuntime } from '../widget-runtime';

@Injectable()
export class WidgetRuntimeFactory extends WidgetRuntimeFactoryInterface {
  private readonly preparedRuntimes = new WeakMap<RuntimeScope, WeakMap<object, Map<string, WidgetRuntime<object>>>>();

  constructor(
    @Inject(SessionRuntimeStateInterface)
    @Optional()
    private readonly session: SessionRuntimeStateInterface | null = null,
  ) {
    super();
  }

  create<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> {
    return new WidgetRuntime(options.ownerScope, widget, createWidgetRuntimeProps(options.props), this.session);
  }

  consumePrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null {
    const runtime = this.releasePrepared<TProps>(widget, options);

    if (!runtime) {
      return null;
    }

    if (runtime.getSnapshot().phase === 'disposed') {
      return null;
    }

    if (options.props) {
      runtime.setProps(options.props);
    }

    return runtime;
  }

  getPrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null {
    const runtime = this.getPreparedRuntime(
      options.ownerScope,
      widget,
      options.runtimeKey,
    ) as WidgetRuntime<TProps> | null;

    if (!runtime) {
      return null;
    }

    if (runtime.getSnapshot().phase === 'disposed') {
      this.releasePrepared(widget, options);

      return null;
    }

    if (options.props) {
      runtime.setProps(options.props);
    }

    return runtime;
  }

  prepare<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> {
    const preparedRuntime = this.getPrepared<TProps>(widget, options);

    if (preparedRuntime) {
      return preparedRuntime;
    }

    const runtime = this.create(widget, options);
    const widgetRuntimes = this.getPreparedWidgetRuntimes(options.ownerScope, widget);

    widgetRuntimes.set(createRuntimeKey(options.runtimeKey), runtime as WidgetRuntime<object>);

    return runtime;
  }

  async preload<TProps extends object>(
    context: RuntimeProviderContextInterface<object>,
    widget: WidgetConstructor,
    options: WidgetPreloadOptions<TProps> = {},
  ): Promise<RuntimeProviderResult> {
    const runtimeOptions = {
      ownerScope: context.scope,
      props: options.props,
      runtimeKey: options.runtimeKey,
    };
    const preparedRuntime = this.getPrepared<TProps>(widget, runtimeOptions);

    if (preparedRuntime) {
      if (preparedRuntime.getSnapshot().phase === 'ready') {
        await preparedRuntime.revalidate({
          signal: context.signal,
        });

        return;
      }

      await preparedRuntime.load({
        signal: context.signal,
      });

      return;
    }

    const runtime = this.prepare<TProps>(widget, runtimeOptions);

    await runtime.load({
      signal: context.signal,
    });

    return () => {
      const preparedRuntime = this.releasePrepared<TProps>(widget, runtimeOptions);

      return preparedRuntime?.dispose();
    };
  }

  releasePrepared<TProps extends object>(
    widget: WidgetConstructor,
    options: WidgetRuntimeFactoryOptions<TProps>,
  ): WidgetRuntime<TProps> | null {
    const widgetRuntimes = this.preparedRuntimes.get(options.ownerScope)?.get(widget as object);
    const runtimeKey = createRuntimeKey(options.runtimeKey);
    const runtime = widgetRuntimes?.get(runtimeKey) as WidgetRuntime<TProps> | undefined;

    widgetRuntimes?.delete(runtimeKey);

    return runtime ?? null;
  }

  private getPreparedRuntime(
    ownerScope: RuntimeScope,
    widget: WidgetConstructor,
    runtimeKey: string | undefined,
  ): WidgetRuntime<object> | null {
    return (
      this.preparedRuntimes
        .get(ownerScope)
        ?.get(widget as object)
        ?.get(createRuntimeKey(runtimeKey)) ?? null
    );
  }

  private getPreparedWidgetRuntimes(
    ownerScope: RuntimeScope,
    widget: WidgetConstructor,
  ): Map<string, WidgetRuntime<object>> {
    let scopeRuntimes = this.preparedRuntimes.get(ownerScope);

    if (!scopeRuntimes) {
      scopeRuntimes = new WeakMap<object, Map<string, WidgetRuntime<object>>>();
      this.preparedRuntimes.set(ownerScope, scopeRuntimes);
    }

    let widgetRuntimes = scopeRuntimes.get(widget as object);

    if (!widgetRuntimes) {
      widgetRuntimes = new Map<string, WidgetRuntime<object>>();
      scopeRuntimes.set(widget as object, widgetRuntimes);
    }

    return widgetRuntimes;
  }
}

const DEFAULT_RUNTIME_KEY = 'default';

const createRuntimeKey = (runtimeKey: string | undefined): string => {
  return runtimeKey ?? DEFAULT_RUNTIME_KEY;
};

const createWidgetRuntimeProps = <TProps extends object>(props: TProps | undefined): TProps => {
  return props ?? ({} as TProps);
};
