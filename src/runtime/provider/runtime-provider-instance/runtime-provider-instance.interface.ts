export type RuntimeProviderDisposeHandler = () => void | Promise<void>;

export type RuntimeProviderResult = void | RuntimeProviderInstanceInterface;

export abstract class RuntimeProviderInstanceInterface {
  abstract dispose(): void | Promise<void>;
}

export class RuntimeProviderInstance extends RuntimeProviderInstanceInterface {
  constructor(private readonly disposeHandler: RuntimeProviderDisposeHandler) {
    super();
  }

  dispose(): void | Promise<void> {
    return this.disposeHandler();
  }
}
