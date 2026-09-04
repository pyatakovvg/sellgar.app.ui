import type { ProviderResult, ProviderRuntimeContextInterface } from '../../../runtime/provider/provider';
import { getProviderScope } from '../../../runtime/provider/provider';
import type { WidgetConstructor, WidgetProps } from '../../declaration/widget';
import { WidgetRuntimeRegistry } from '../../runtime/widget-runtime-registry';

interface WidgetPreloadBaseOptions {
  readonly runtimeKey?: string;
}

export type WidgetPreloadOptions<TWidget extends WidgetConstructor> = WidgetPreloadBaseOptions &
  (object extends WidgetProps<TWidget>
    ? { readonly props?: WidgetProps<TWidget> }
    : { readonly props: WidgetProps<TWidget> });

type WidgetPreloadArguments<TWidget extends WidgetConstructor> =
  object extends WidgetProps<TWidget>
    ? readonly [options?: WidgetPreloadOptions<TWidget>]
    : readonly [options: WidgetPreloadOptions<TWidget>];

export abstract class WidgetPreloaderInterface {
  abstract preload<TWidget extends WidgetConstructor>(
    context: ProviderRuntimeContextInterface<object>,
    widget: TWidget,
    ...args: WidgetPreloadArguments<TWidget>
  ): Promise<ProviderResult>;
}

export class WidgetPreloader extends WidgetPreloaderInterface {
  constructor(private readonly registry: WidgetRuntimeRegistry) {
    super();
  }

  async preload<TWidget extends WidgetConstructor>(
    context: ProviderRuntimeContextInterface<object>,
    widget: TWidget,
    ...args: WidgetPreloadArguments<TWidget>
  ): Promise<ProviderResult> {
    const options = args[0];
    const lease = this.registry.acquire({
      ownerScope: getProviderScope(context),
      props: (options?.props ?? {}) as WidgetProps<TWidget>,
      runtimeKey: options?.runtimeKey,
      token: widget,
    });

    try {
      if (lease.runtime.getSnapshot().phase !== 'ready') {
        await lease.runtime.load({ signal: context.signal });
      }
    } catch (error) {
      lease.release();
      throw error;
    }

    return () => lease.release();
  }
}
