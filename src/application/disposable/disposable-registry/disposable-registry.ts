import { DisposableRegistryInterface, type Disposable } from './disposable-registry.interface.ts';

export class DisposableRegistry extends DisposableRegistryInterface {
  private readonly disposables: Disposable[] = [];

  add(disposable: Disposable): void {
    this.disposables.push(disposable);
  }

  async dispose(onError?: (error: unknown) => void): Promise<void> {
    const disposables = [...this.disposables].reverse();

    this.disposables.length = 0;

    await Promise.allSettled(
      disposables.map((disposable) => {
        if (typeof disposable === 'function') {
          return disposable();
        }

        return disposable.dispose();
      }),
    ).then((results) => {
      results.forEach((result) => {
        if (result.status === 'rejected') {
          onError?.(result.reason);
        }
      });
    });
  }
}
