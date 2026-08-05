import { parseHashToObject } from '../../../router/utils/hash-utils';
import type {
  RouterParamsConstructor,
  RouterParamsObjectOptions,
} from '../../../router/params/router-params-converter';
import { FrameSourceInterface } from '../frame-source';
import type { FrameSourceContextInterface, FrameSourceNavigateOptions, FrameSourceResult } from '../frame-source';

export interface HashFrameSourceOptions extends RouterParamsObjectOptions {}

export class HashFrameSource<TProps extends object = Record<string, never>> extends FrameSourceInterface<TProps> {
  private constructor(
    private readonly key: string,
    private readonly target: RouterParamsConstructor<TProps> | null,
    private readonly options: HashFrameSourceOptions,
  ) {
    super();
  }

  static create<TProps extends object = Record<string, never>>(
    key: string,
    target?: RouterParamsConstructor<TProps>,
    options: HashFrameSourceOptions = {},
  ): HashFrameSource<TProps> {
    return new HashFrameSource(key, target ?? null, options);
  }

  getNavigationKey(): string {
    return this.key;
  }

  resolve(context: FrameSourceContextInterface): FrameSourceResult<TProps> {
    const hashParams = this.getHashParams(context);
    const rawValue = hashParams[this.key];

    if (rawValue === undefined) {
      return {
        active: false,
      };
    }

    const rawProps = this.getRawProps(rawValue);
    const runtimeKey = this.createRuntimeKey(rawValue);

    if (this.target) {
      return {
        active: true,
        close: (options) => {
          return this.close(context, options);
        },
        props: context.paramsConverter.toObject(this.target, rawProps, this.options),
        runtimeKey,
      };
    }

    return {
      active: true,
      close: (options) => {
        return this.close(context, options);
      },
      props: rawProps as TProps,
      runtimeKey,
    };
  }

  async open(
    context: FrameSourceContextInterface,
    props?: TProps,
    options: FrameSourceNavigateOptions = {},
  ): Promise<void> {
    await context.navigateService.hashParams(
      {
        [this.key]: createHashValue(props),
      },
      {
        replace: options.replace,
      },
    );
  }

  async close(context: FrameSourceContextInterface, options: FrameSourceNavigateOptions = {}): Promise<void> {
    await context.navigateService.hashParams(
      {
        [this.key]: undefined,
      },
      {
        replace: options.replace,
      },
    );
  }

  private getHashParams(context: FrameSourceContextInterface): Record<string, unknown> {
    if (this.options.enableTypeConversion === undefined) {
      return context.location.hashParams;
    }

    return parseHashToObject(context.location.hash, {
      enableTypeConversion: this.options.enableTypeConversion,
    });
  }

  private getRawProps(rawValue: unknown): Record<string, unknown> {
    if (rawValue && typeof rawValue === 'object' && !Array.isArray(rawValue)) {
      return rawValue as Record<string, unknown>;
    }

    return {};
  }

  private createRuntimeKey(rawValue: unknown): string {
    return `${this.key}:${JSON.stringify(rawValue)}`;
  }
}

const createHashValue = <TProps extends object>(props: TProps | undefined): TProps | null => {
  if (!props) {
    return null;
  }

  if (Object.keys(props).length === 0) {
    return null;
  }

  return props;
};
