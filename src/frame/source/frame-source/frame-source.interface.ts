import type { NavigateServiceInterface } from '../../../router/service/navigate-service';
import type { RouterLocationSnapshot } from '../../../router/service/location-service';
import type { RouterParamsConverterInterface } from '../../../router/params/router-params-converter';

export interface FrameSourceContextInterface {
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly paramsConverter: RouterParamsConverterInterface;
}

export interface FrameSourceNavigateOptions {
  readonly replace?: boolean;
}

export type FrameSourceCloseHandler = (options?: FrameSourceNavigateOptions) => void | Promise<void>;

export type FrameSourceResult<TProps extends object = object> =
  | {
      readonly active: false;
    }
  | {
      readonly active: true;
      readonly close: FrameSourceCloseHandler;
      readonly props: TProps;
      readonly runtimeKey?: string;
    };

export abstract class FrameSourceInterface<TProps extends object = object> {
  abstract close(context: FrameSourceContextInterface, options?: FrameSourceNavigateOptions): Promise<void>;

  abstract getNavigationKey(): string;

  abstract open(
    context: FrameSourceContextInterface,
    props?: TProps,
    options?: FrameSourceNavigateOptions,
  ): Promise<void>;

  abstract resolve(context: FrameSourceContextInterface): FrameSourceResult<TProps>;
}
