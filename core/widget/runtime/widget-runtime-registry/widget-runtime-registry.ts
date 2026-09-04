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
}

export interface WidgetRuntimeLease<TProps extends object = object> {
  readonly runtime: WidgetRuntime<TProps>;

  release(): void;

  updateProps(props: TProps): void;
}

interface WidgetRuntimeEntry {
  readonly leases: Set<symbol>;
  readonly runtime: WidgetRuntime<object>;
}

interface WidgetRuntimeOwnerBucket {
  readonly entries: Set<WidgetRuntimeEntry>;
  readonly runtimes: WeakMap<object, Map<string, WidgetRuntimeEntry>>;
}

export class WidgetRuntimeRegistry {
  private readonly entries = new Set<WidgetRuntimeEntry>();
  private readonly owners = new WeakMap<RuntimeScope, WidgetRuntimeOwnerBucket>();
  private disposed = false;

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

    if (!entry) {
      entry = {
        leases: new Set(),
        runtime: new WidgetRuntime(
          options.ownerScope,
          getWidgetRuntimeDefinition(options.token),
          options.props,
        ) as WidgetRuntime<object>,
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

    return {
      release: () => {
        if (released) {
          return;
        }

        released = true;
        retainedEntry.leases.delete(leaseId);

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

  async dispose(): Promise<void> {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    const entries = [...this.entries];

    this.entries.clear();
    await Promise.allSettled(entries.map((entry) => entry.runtime.dispose()));
  }

  private disposeOwner(ownerScope: RuntimeScope, bucket: WidgetRuntimeOwnerBucket): void {
    if (this.owners.get(ownerScope) !== bucket) {
      return;
    }

    this.owners.delete(ownerScope);

    for (const entry of bucket.entries) {
      this.entries.delete(entry);
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

      if (runtimes?.get(key) !== entry) {
        return;
      }

      runtimes.delete(key);
      bucket?.entries.delete(entry);
      this.entries.delete(entry);
      void entry.runtime.dispose();
    });
  }
}

const DEFAULT_RUNTIME_KEY = 'default';
