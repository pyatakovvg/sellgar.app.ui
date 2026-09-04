import {
  RevalidateServiceInterface,
  type RevalidateKey,
  type RevalidateOptions,
} from '../../contract/revalidate-service';

type RuntimeRevalidateHandler = (key: RevalidateKey | undefined, options?: RevalidateOptions) => Promise<void>;

export class RuntimeRevalidateService implements RevalidateServiceInterface {
  constructor(private readonly handler: RuntimeRevalidateHandler) {}

  revalidate(options?: RevalidateOptions): Promise<void>;

  revalidate(key: RevalidateKey, options?: RevalidateOptions): Promise<void>;

  revalidate(keyOrOptions?: RevalidateKey | RevalidateOptions, options?: RevalidateOptions): Promise<void> {
    if (isRevalidateOptions(keyOrOptions)) {
      return this.handler(undefined, keyOrOptions);
    }

    return this.handler(keyOrOptions, options);
  }
}

const isRevalidateOptions = (value: RevalidateKey | RevalidateOptions | undefined): value is RevalidateOptions => {
  return typeof value === 'object' && value !== null;
};
