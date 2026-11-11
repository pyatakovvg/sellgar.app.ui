import type { MetadataValues } from '../../declaration/metadata';
import { MetadataServiceInterface } from '../../service/metadata-service';

export class MetadataService extends MetadataServiceInterface {
  private readonly listeners = new Set<() => void>();
  private readonly defaults: MetadataValues;
  private snapshot: MetadataValues;
  private disposed = false;

  constructor(defaults: MetadataValues = {}) {
    super();
    this.defaults = Object.freeze({ ...defaults });
    this.snapshot = this.defaults;
  }

  readonly get = Object.freeze({
    title: () => this.snapshot.title,
    description: () => this.snapshot.description,
  });

  readonly set = Object.freeze({
    title: (title: string | undefined) => this.update({ ...this.snapshot, title }),
    description: (description: string | undefined) => this.update({ ...this.snapshot, description }),
  });

  readonly reset = Object.freeze({
    title: () => this.set.title(this.defaults.title),
    description: () => this.set.description(this.defaults.description),
    all: () => this.update(this.defaults),
  });

  getSnapshot = (): MetadataValues => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  private update(next: MetadataValues): void {
    if (this.disposed || (next.title === this.snapshot.title && next.description === this.snapshot.description)) return;
    this.snapshot = Object.freeze({ ...next });
    for (const listener of [...this.listeners]) listener();
  }
}
