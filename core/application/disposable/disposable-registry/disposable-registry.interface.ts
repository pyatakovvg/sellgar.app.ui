export interface DisposableLike {
  dispose(): void | Promise<void>;
}

export type Disposable = (() => void | Promise<void>) | DisposableLike;

export abstract class DisposableRegistryInterface {
  abstract add(disposable: Disposable): void;
}
