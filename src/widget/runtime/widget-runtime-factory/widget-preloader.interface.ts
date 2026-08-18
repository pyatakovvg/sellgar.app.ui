import type {
  RuntimeProviderContextInterface,
  RuntimeProviderResult,
} from '../../../runtime/provider/runtime-provider';
import type { WidgetConstructor } from '../../declaration/widget';

export interface WidgetPreloadOptions<TProps extends object = Record<string, never>> {
  readonly props?: TProps;
  readonly runtimeKey?: string;
}

export abstract class WidgetPreloaderInterface {
  abstract preload<TProps extends object>(
    context: RuntimeProviderContextInterface<object>,
    widget: WidgetConstructor,
    options?: WidgetPreloadOptions<TProps>,
  ): Promise<RuntimeProviderResult>;
}
