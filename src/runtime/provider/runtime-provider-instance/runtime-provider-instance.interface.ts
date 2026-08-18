export type RuntimeProviderDisposeHandler = () => void | Promise<void>;

export type RuntimeProviderResult = void | RuntimeProviderInstanceInterface;

export abstract class RuntimeProviderInstanceInterface {
  abstract dispose(): void | Promise<void>;
}

export class RuntimeProviderInstance implements RuntimeProviderInstanceInterface {
  constructor(private readonly disposeHandler: RuntimeProviderDisposeHandler) {}

  dispose(): void | Promise<void> {
    return this.disposeHandler();
  }
}
