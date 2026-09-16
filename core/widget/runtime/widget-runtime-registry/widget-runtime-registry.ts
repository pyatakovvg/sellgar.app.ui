import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { getWidgetRuntimeDefinition, type WidgetConstructor, type WidgetProps } from '../../declaration/widget';
import { WidgetRuntime } from '../widget-runtime';

export interface WidgetRuntimeIdentity<TWidget extends WidgetConstructor = WidgetConstructor> {
  readonly ownerScope: RuntimeScope;
  readonly runtimeKey?: string;
  readonly token: TWidget;
}

export interface WidgetRuntimeLeaseOptions<TWidget extends WidgetConstructor> extends WidgetRuntimeIdentity<TWidget> {
  readonly props: WidgetProps<TWidget>;
  readonly presentation?: WidgetRuntimePresentation;
}

/** A renderer-owned surface that may keep a widget mounted while its effects are suspended. */
export interface WidgetRuntimePresentation {
  isRetained(): boolean;
  onDispose(listener: () => void): () => void;
}

export interface WidgetRuntimeLease<TProps extends object = object> {
  readonly runtime: WidgetRuntime<TProps>;

  release(): void;

  updateProps(props: TProps): void;
}

interface WidgetRuntimeEntry {
  readonly key: string;
  readonly leases: Set<symbol>;
  readonly ownerScope: RuntimeScope;
  readonly presentations: Map<WidgetRuntimePresentation, () => void>;
  readonly runtime: WidgetRuntime<object>;
  readonly token: WidgetConstructor;
}

interface WidgetRuntimeOwnerBucket {
  readonly entries: Set<WidgetRuntimeEntry>;
  readonly listeners: WeakMap<object, Map<string, Set<() => void>>>;
  readonly runtimes: WeakMap<object, Map<string, WidgetRuntimeEntry>>;
  retained: boolean;
}

export class WidgetRuntimeRegistry {
  private readonly entries = new Set<WidgetRuntimeEntry>();
  private readonly owners = new WeakMap<RuntimeScope, WidgetRuntimeOwnerBucket>();
  private disposed = false;

  attach<TWidget extends WidgetConstructor>(
    options: WidgetRuntimeLeaseOptions<TWidget>,
  ): WidgetRuntimeLease<WidgetProps<TWidget>> {
    const lease = this.acquire(options);

    if (lease.runtime.getSnapshot().phase === 'idle') {
      void lease.runtime.load().catch(() => undefined);
    }

    return lease;
  }

  acquire<TWidget extends WidgetConstructor>(
    options: WidgetRuntimeLeaseOptions<TWidget>,
  ): WidgetRuntimeLease<WidgetProps<TWidget>> {
    if (this.disposed) {
      throw new Error('Registry runtime виджетов уже освобождён.');
    }

    const bucket = this.getOwnerBucket(options.ownerScope);
    const runtimes = this.getTokenRuntimes(bucket, options.token);
    const key = options.runtimeKey ?? DEFAULT_RUNTIME_KEY;
    let entry = runtimes.get(key);
    const created = entry === undefined;

    if (!entry) {
      entry = {
        key,
        leases: new Set(),
        ownerScope: options.ownerScope,
        presentations: new Map(),
        runtime: new WidgetRuntime(
          options.ownerScope,
          getWidgetRuntimeDefinition(options.token),
          options.props,
        ) as WidgetRuntime<object>,
        token: options.token,
      };
      runtimes.set(key, entry);
      bucket.entries.add(entry);
      this.entries.add(entry);
    } else {
      entry.runtime.updateProps(options.props);
    }

    const leaseId = Symbol('widget-runtime-lease');
    const retainedEntry = entry;
    let released = false;

    retainedEntry.leases.add(leaseId);
    this.releasePresentation(retainedEntry, options.presentation);
    if (created) this.emit(bucket, options.token, key);

    return {
      release: () => {
        if (released) {
          return;
        }

        released = true;
        retainedEntry.leases.delete(leaseId);

        if (options.presentation?.isRetained()) {
          this.retainPresentation(retainedEntry, options.presentation);
        }

        if (retainedEntry.leases.size === 0) {
          this.scheduleRelease(options.ownerScope, options.token, key, retainedEntry);
        }
      },
      runtime: retainedEntry.runtime as WidgetRuntime<WidgetProps<TWidget>>,
      updateProps: (props) => {
        if (released) {
          throw new Error('Lease runtime виджета уже освобождён.');
        }

        retainedEntry.runtime.updateProps(props);
      },
    };
  }

  get<TWidget extends WidgetConstructor>(
    identity: WidgetRuntimeIdentity<TWidget>,
  ): WidgetRuntime<WidgetProps<TWidget>> | null {
    if (this.disposed) {
      return null;
    }

    return (
      (this.owners
        .get(identity.ownerScope)
        ?.runtimes.get(identity.token)
        ?.get(identity.runtimeKey ?? DEFAULT_RUNTIME_KEY)?.runtime as
        WidgetRuntime<WidgetProps<TWidget>> | undefined) ?? null
    );
  }

  subscribe(identity: WidgetRuntimeIdentity, listener: () => void): () => void {
    if (this.disposed) return () => undefined;

    const bucket = this.getOwnerBucket(identity.ownerScope);
    let byKey = bucket.listeners.get(identity.token);

    if (!byKey) {
      byKey = new Map();
      bucket.listeners.set(identity.token, byKey);
    }

    const key = identity.runtimeKey ?? DEFAULT_RUNTIME_KEY;
    let listeners = byKey.get(key);

    if (!listeners) {
      listeners = new Set();
      byKey.set(key, listeners);
    }

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) byKey.delete(key);
    };
  }

  retainOwner(ownerScope: RuntimeScope): void {
    const bucket = this.owners.get(ownerScope);
    if (bucket) bucket.retained = true;
  }

  focusOwner(ownerScope: RuntimeScope): void {
    const bucket = this.owners.get(ownerScope);
    if (bucket) bucket.retained = false;
  }

  /** Called after a retained surface is committed visible and its hosts have reattached. */
  reconcilePresentation(presentation: WidgetRuntimePresentation): void {
    for (const entry of this.entries) {
      if (this.releasePresentation(entry, presentation) && entry.leases.size === 0) {
        this.scheduleRelease(entry.ownerScope, entry.token, entry.key, entry);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const entries = [...this.entries];

    this.entries.clear();
    for (const entry of entries) this.clearPresentations(entry);
    await Promise.allSettled(entries.map((entry) => entry.runtime.dispose()));
  }

  private disposeOwner(ownerScope: RuntimeScope, bucket: WidgetRuntimeOwnerBucket): void {
    if (this.owners.get(ownerScope) !== bucket) {
      return;
    }

    this.owners.delete(ownerScope);

    for (const entry of bucket.entries) {
      this.entries.delete(entry);
      this.clearPresentations(entry);
      void entry.runtime.dispose();
    }

    bucket.entries.clear();
  }

  private getOwnerBucket(ownerScope: RuntimeScope): WidgetRuntimeOwnerBucket {
    let bucket = this.owners.get(ownerScope);

    if (bucket) {
      return bucket;
    }

    const createdBucket: WidgetRuntimeOwnerBucket = {
      entries: new Set(),
      listeners: new WeakMap(),
      retained: false,
      runtimes: new WeakMap(),
    };
    this.owners.set(ownerScope, createdBucket);
    ownerScope.onDispose(() => this.disposeOwner(ownerScope, createdBucket));

    return createdBucket;
  }

  private getTokenRuntimes(
    bucket: WidgetRuntimeOwnerBucket,
    token: WidgetConstructor,
  ): Map<string, WidgetRuntimeEntry> {
    let runtimes = bucket.runtimes.get(token);

    if (!runtimes) {
      runtimes = new Map();
      bucket.runtimes.set(token, runtimes);
    }

    return runtimes;
  }

  private scheduleRelease(
    ownerScope: RuntimeScope,
    token: WidgetConstructor,
    key: string,
    entry: WidgetRuntimeEntry,
  ): void {
    queueMicrotask(() => {
      if (entry.leases.size > 0) {
        return;
      }

      const bucket = this.owners.get(ownerScope);
      const runtimes = bucket?.runtimes.get(token);

      if (bucket?.retained) {
        return;
      }

      if (entry.presentations.size > 0) return;

      if (runtimes?.get(key) !== entry) {
        return;
      }

      runtimes.delete(key);
      bucket?.entries.delete(entry);
      this.entries.delete(entry);
      this.clearPresentations(entry);
      if (bucket) this.emit(bucket, token, key);
      void entry.runtime.dispose();
    });
  }

  private emit(bucket: WidgetRuntimeOwnerBucket, token: WidgetConstructor, key: string): void {
    for (const listener of bucket.listeners.get(token)?.get(key) ?? []) listener();
  }

  private retainPresentation(entry: WidgetRuntimeEntry, presentation: WidgetRuntimePresentation): void {
    if (entry.presentations.has(presentation)) return;
    const unsubscribe = presentation.onDispose(() => {
      this.releasePresentation(entry, presentation);
      if (entry.leases.size === 0) this.scheduleRelease(entry.ownerScope, entry.token, entry.key, entry);
    });
    entry.presentations.set(presentation, unsubscribe);
  }

  private releasePresentation(entry: WidgetRuntimeEntry, presentation: WidgetRuntimePresentation | undefined): boolean {
    if (!presentation) return false;
    const unsubscribe = entry.presentations.get(presentation);
    if (!unsubscribe) return false;
    unsubscribe();
    entry.presentations.delete(presentation);
    return true;
  }

  private clearPresentations(entry: WidgetRuntimeEntry): void {
    for (const unsubscribe of entry.presentations.values()) unsubscribe();
    entry.presentations.clear();
  }
}

const DEFAULT_RUNTIME_KEY = 'default';
