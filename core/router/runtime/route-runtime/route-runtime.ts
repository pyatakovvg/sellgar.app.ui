import type { ModuleExportResolverInterface } from '../../../module/resolution/module-export-resolver';
import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import type { RouteDeclaration } from '../../declaration/route';
import { areNavigationParamsEqual } from '../navigation-state';

import { RouteActivationRuntime, type RouteRuntimeCallbacks } from './route-activation-runtime.ts';

interface RouteActivationEntry<TPresentation> {
  readonly activation: RouteActivationRuntime<TPresentation>;
  readonly params: Readonly<Record<string, unknown>>;
  references: number;
}

export interface RouteRuntimeActivationResult<TPresentation> {
  readonly activation: RouteActivationRuntime<TPresentation>;
  readonly created: boolean;
}

export interface RouteRuntimeAcquireOptions {
  readonly reuse?: boolean;
}

/**
 * Logical runtime of one Route declaration under one parent activation.
 *
 * Path params identify prepared activations owned by this runtime. This keeps
 * Route identity stable while allowing several retained locations to preserve
 * independent Module/controller/provider state.
 */
export class RouteRuntime<TPresentation = unknown> {
  private readonly activations = new Set<RouteActivationEntry<TPresentation>>();
  private disposed = false;

  constructor(
    readonly route: RouteDeclaration,
    private readonly ownerScope: RuntimeScope,
    private readonly exportResolver: ModuleExportResolverInterface<TPresentation>,
    readonly runtimeId: string,
    private readonly callbacks: RouteRuntimeCallbacks<TPresentation> = {},
  ) {}

  acquire(
    params: Readonly<Record<string, unknown>>,
    options: RouteRuntimeAcquireOptions = {},
  ): RouteRuntimeActivationResult<TPresentation> {
    this.assertActive();

    const existing =
      options.reuse === false
        ? undefined
        : [...this.activations].find((entry) => areNavigationParamsEqual(entry.params, params));

    if (existing) {
      return Object.freeze({ activation: existing.activation, created: false });
    }

    const committedParams = Object.freeze({ ...params });
    const activation = new RouteActivationRuntime(
      this.route,
      this.ownerScope,
      this.exportResolver,
      this.runtimeId,
      this.callbacks,
    );

    this.activations.add({ activation, params: committedParams, references: 0 });

    return Object.freeze({ activation, created: true });
  }

  retain(activation: RouteActivationRuntime<TPresentation>): void {
    this.requireEntry(activation).references += 1;
  }

  hasReferences(activation: RouteActivationRuntime<TPresentation>): boolean {
    return this.requireEntry(activation).references > 0;
  }

  async release(activation: RouteActivationRuntime<TPresentation>): Promise<void> {
    const entry = this.requireEntry(activation);

    if (entry.references <= 0) {
      throw new Error('Route activation освобождается без удерживающей navigation activation.');
    }

    entry.references -= 1;

    if (entry.references === 0) {
      this.activations.delete(entry);
      await activation.dispose();
    }
  }

  async discard(activation: RouteActivationRuntime<TPresentation>): Promise<void> {
    const entry = this.requireEntry(activation);

    if (entry.references > 0) return;

    this.activations.delete(entry);
    await activation.dispose();
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;

    this.disposed = true;
    const entries = [...this.activations];

    this.activations.clear();
    await Promise.allSettled(entries.map(({ activation }) => activation.dispose()));
  }

  private requireEntry(activation: RouteActivationRuntime<TPresentation>): RouteActivationEntry<TPresentation> {
    const entry = [...this.activations].find((candidate) => candidate.activation === activation);

    if (!entry) {
      throw new Error('Route activation не принадлежит этому RouteRuntime.');
    }

    return entry;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('RouteRuntime уже освобождён.');
  }
}
