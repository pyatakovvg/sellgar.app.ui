import {
  RevalidateServiceInterface,
  type RevalidateHandler,
  type RevalidateKey,
  type RevalidateOptions,
} from '../../contract/revalidate-service';

export class RuntimeRevalidateService extends RevalidateServiceInterface {
  constructor(
    private readonly handler: (key: RevalidateKey | undefined, options?: RevalidateOptions) => Promise<void>,
  ) {
    super();
  }

  register(_key: RevalidateKey, _handler: RevalidateHandler): void {
    throw new Error('Runtime-local revalidate service не поддерживает регистрацию handlers.');
  }

  registerFallback(_handler: RevalidateHandler): void {
    throw new Error('Runtime-local revalidate service не поддерживает регистрацию fallback handlers.');
  }

  revalidate(options?: RevalidateOptions): Promise<void>;

  revalidate(key: RevalidateKey, options?: RevalidateOptions): Promise<void>;

  revalidate(keyOrOptions?: RevalidateKey | RevalidateOptions, options?: RevalidateOptions): Promise<void> {
    if (isRevalidateOptions(keyOrOptions)) {
      return this.handler(undefined, keyOrOptions);
    }

    return this.handler(keyOrOptions, options);
  }

  unregister(_key: RevalidateKey, _handler: RevalidateHandler): void {
    throw new Error('Runtime-local revalidate service не поддерживает регистрацию handlers.');
  }

  unregisterFallback(_handler: RevalidateHandler): void {
    throw new Error('Runtime-local revalidate service не поддерживает регистрацию fallback handlers.');
  }
}

const isRevalidateOptions = (value: RevalidateKey | RevalidateOptions | undefined): value is RevalidateOptions => {
  return typeof value === 'object' && value !== null && 'signal' in value;
};
