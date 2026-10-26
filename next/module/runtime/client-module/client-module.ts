import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import type {
  ModuleRuntimeActionState,
  ModuleRuntimeRevalidateState,
} from '../../../../core/module/runtime/module-runtime';
import type { ControllerRuntimeContextValue } from '../../../../shared/controller/runtime/controller-runtime';
import type { Application } from '../../../application/lifecycle/application';
import type { ModuleLoader, ModuleSnapshot } from '../../contract/module-snapshot';
import {
  controllerIndex,
  createModuleRuntime,
  discoverModuleControllers,
  hydrateModuleSession,
  type ModuleSession,
} from '../module-session';

const EMPTY_ACTION = Object.freeze({ data: undefined, error: undefined, inProcess: false });
const EMPTY_REVALIDATE = Object.freeze({ error: undefined, inProcess: false });

export class ClientModule implements ControllerRuntimeContextValue {
  private readonly listeners = new Set<() => void>();
  private readonly facades = new Map<DependencyToken<unknown>, object>();
  private entry: {
    session: ModuleSession;
    ready: Promise<void>;
    abort: AbortController;
    unsubscribe: () => void;
    leases: number;
  } | null = null;
  private live: ModuleSession | null = null;
  private error: unknown = null;
  private readonly declaration;

  constructor(
    private readonly exports: Awaited<ReturnType<ModuleLoader>>,
    private readonly snapshot: ModuleSnapshot,
  ) {
    this.declaration = discoverModuleControllers(exports, snapshot.kind);
    if (this.declaration.tokens.length !== snapshot.controllers.length)
      throw new Error('Привязки контроллеров модуля Next различаются на сервере и в браузере.');
  }

  get definition() {
    return this.declaration.definition;
  }
  get scope() {
    return this.live?.runtime.getActiveModule().scope ?? null;
  }
  get session() {
    return this.live;
  }
  get isReady() {
    return this.live !== null;
  }
  get failure() {
    return this.error ?? this.live?.runtime.getSnapshot().exception?.error ?? null;
  }

  acquire(app: Application, parent?: ModuleSession) {
    if (!this.entry) {
      const session = createModuleRuntime(app, async () => this.exports, this.snapshot.id, {
        kind: this.snapshot.kind,
        parent,
      });
      const abort = session.abort;
      const unsubscribe = session.runtime.subscribe(() => {
        if (this.live === session && session.runtime.getSnapshot().phase === 'empty') this.live = null;
        this.emit();
      });
      const entry = { session, abort, unsubscribe, leases: 0, ready: Promise.resolve() };
      this.entry = entry;
      entry.ready = hydrateModuleSession(session, this.snapshot, abort.signal)
        .then(() => {
          if (this.entry === entry && !abort.signal.aborted) {
            this.live = session;
            this.emit();
          }
        })
        .catch(async (error: unknown) => {
          if (!abort.signal.aborted) {
            this.error = error ?? new Error('Не удалось активировать модуль Next.', { cause: error });
            this.emit();
          }
          await session.dispose();
          throw error;
        });
    }
    const entry = this.entry;
    entry.leases += 1;
    let released = false;
    return {
      ready: entry.ready,
      release: () => {
        if (released) return;
        released = true;
        entry.leases -= 1;
        queueMicrotask(() => {
          if (entry.leases || this.entry !== entry) return;
          this.entry = null;
          this.live = null;
          entry.abort.abort();
          entry.unsubscribe();
          void entry.ready
            .catch(() => undefined)
            .then(() => entry.session.dispose())
            .catch((error: unknown) => console.error('[sellgar/app/next] Не удалось освободить модуль', error));
        });
      },
    };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private emit = () => {
    for (const listener of this.listeners) listener();
  };

  getLoaderData<T>(token: DependencyToken<unknown>): T {
    const index = controllerIndex(this.declaration.tokens, token);
    return this.live ? this.live.runtime.getLoaderData<T>(token) : (this.snapshot.controllers[index]!.data as T);
  }

  getController<T>(token: DependencyToken<T>): T {
    const index = controllerIndex(this.declaration.tokens, token);
    let facade = this.facades.get(token);
    if (!facade) {
      const placeholders = new Map<string, () => never>();
      facade = new Proxy(
        {},
        {
          get: (_target, property) => {
            if (this.live) {
              const target = this.live.runtime.getController(token) as object;
              return Reflect.get(target, property, target) as unknown;
            }
            if (typeof property === 'string' && this.snapshot.controllers[index]!.methods.includes(property)) {
              if (!placeholders.has(property))
                placeholders.set(property, () => {
                  throw new Error('Методы контроллера доступны после активации модуля.');
                });
              return placeholders.get(property);
            }
            throw new Error(
              `Поле контроллера ${String(property)} недоступно во время SSR. Читайте начальные данные через useLoaderData().`,
            );
          },
        },
      );
      this.facades.set(token, facade);
    }
    return facade as T;
  }

  getParams() {
    return this.snapshot.params;
  }
  getRevalidateRevision() {
    return this.live?.runtime.getRevalidateRevision() ?? 0;
  }
  getRevalidateState(token?: DependencyToken<unknown>): ModuleRuntimeRevalidateState {
    return this.live?.runtime.getRevalidateState(token) ?? EMPTY_REVALIDATE;
  }
  getActionState<T>(token: DependencyToken<unknown>): ModuleRuntimeActionState<T> {
    return this.live?.runtime.getActionState<T>(token) ?? EMPTY_ACTION;
  }
  invoke<T>(token: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]): T {
    return this.requireLive().runtime.invoke<T>(token, method, args);
  }
  action<T>(token: DependencyToken<unknown>, payload: T) {
    return this.requireLive().runtime.action(token, payload, {
      params: this.snapshot.params,
      props: this.snapshot.props,
      signal: this.entry!.abort.signal,
    });
  }
  revalidate(options?: Parameters<ControllerRuntimeContextValue['revalidate']>[0]) {
    return this.requireLive().runtime.revalidate(options);
  }

  private requireLive() {
    if (!this.live) throw new Error('Модуль Next не готов. Перед вызовом контроллера проверьте useModuleReady().');
    return this.live;
  }
}
