import 'reflect-metadata';

import type { DependencyToken } from '../../../../core/di/token/dependency-token';
import { ModuleRuntime } from '../../../../core/module/runtime/module-runtime';
import { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';
import type { Application } from '../../../application/lifecycle/application';
import { EntryExportResolver } from '../../../runtime/resolution/entry-export-resolver';
import type { RuntimeEntryKind, RuntimeEntryPresentation } from '../../../runtime/contract/runtime-entry';
import type { ModuleLoader, ModuleSnapshot } from '../../contract/module-snapshot';

export const moduleResolver = new EntryExportResolver();

export interface ModuleSession {
  readonly id: string;
  readonly runtime: ModuleRuntime<RuntimeEntryPresentation>;
  readonly abort: AbortController;
  retainChild(child: ModuleSession): () => void;
  dispose(): Promise<void>;
}

export interface ModuleSessionOptions {
  readonly kind?: RuntimeEntryKind;
  readonly parent?: ModuleSession;
}

export function createModuleRuntime(
  app: Application,
  load: ModuleLoader,
  id: string,
  options: ModuleSessionOptions = {},
): ModuleSession {
  const scope = options.parent?.runtime.getActiveModule().scope ?? app.contextScope;
  const runtime = new ModuleRuntime<RuntimeEntryPresentation>(scope, load, new EntryExportResolver(options.kind), {
    kind: 'route',
    id,
  });
  const abort = new AbortController();
  const children = new Set<ModuleSession>();
  let unregister = () => {};
  let unregisterParent = () => {};
  let disposal: Promise<void> | undefined;

  const session: ModuleSession = {
    id,
    runtime,
    abort,
    retainChild(child) {
      if (disposal) throw new Error('Нельзя активировать дочерний элемент при освобождении layout Next.');
      children.add(child);
      return () => {
        children.delete(child);
      };
    },
    dispose() {
      abort.abort();
      return (disposal ??= Promise.resolve().then(async () => {
        try {
          const results = await Promise.allSettled([...children].map((child) => child.dispose()));
          children.clear();
          await runtime.dispose();
          const errors = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
          if (errors.length) throw new AggregateError(errors, 'Не удалось освободить дочерние runtime Next.');
        } finally {
          unregisterParent();
          unregister();
        }
      }));
    },
  };
  unregisterParent = options.parent?.retainChild(session) ?? (() => {});
  try {
    unregister = app.retainModule(session);
  } catch (error) {
    unregisterParent();
    throw error;
  }
  return session;
}

export function captureModuleSnapshot(
  runtime: ModuleRuntime<RuntimeEntryPresentation>,
  input: Omit<ModuleSnapshot, 'controllers'>,
): ModuleSnapshot {
  const module = runtime.getActiveModule();
  return {
    ...input,
    controllers: [...module.controllers].map(([token, controller]) => ({
      methods: controllerMethods(controller),
      data: runtime.getLoaderData(token),
    })),
  };
}

/** Resolve binding order without constructing controllers or application dependencies during HTML rendering. */
export function discoverModuleControllers(
  exports: Awaited<ReturnType<ModuleLoader>>,
  kind: RuntimeEntryKind = 'module',
) {
  class DeclarationScope extends RuntimeScope {}
  const scope = new DeclarationScope();
  const definition = new EntryExportResolver(kind).resolve(exports);
  try {
    scope.activate(definition.token, { collectControllerBindings: true });
    for (const owner of definition.bindingOwners) scope.activate(owner);
    return { definition, tokens: scope.getControllerTokens() };
  } finally {
    scope.dispose();
  }
}

/** Replay loader results once; this does not restore arbitrary controller/store fields. Revalidation uses the real loader. */
export async function hydrateModuleSession(session: ModuleSession, snapshot: ModuleSnapshot, signal: AbortSignal) {
  const module = await session.runtime.activate(signal);
  const entries = [...module.controllers];
  if (entries.length !== snapshot.controllers.length) {
    throw new Error('Привязки контроллеров модуля Next различаются на сервере и в браузере.');
  }

  for (const [index, [token, controller]] of entries.entries()) {
    const data = snapshot.controllers[index]!.data;
    let seeded = true;
    const methods = new Map<PropertyKey, unknown>();
    module.controllers.set(
      token,
      new Proxy(controller, {
        get(target, property) {
          if (property === 'loader') {
            if (!methods.has(property))
              methods.set(property, async (...args: unknown[]) => {
                if (seeded) {
                  seeded = false;
                  return data;
                }
                return target.loader?.(...(args as Parameters<NonNullable<typeof target.loader>>));
              });
            return methods.get(property);
          }
          const value: unknown = Reflect.get(target, property, target);
          if (typeof value !== 'function' || property === 'constructor') return value;
          if (!methods.has(property)) methods.set(property, value.bind(target));
          return methods.get(property);
        },
        set(target, property, value) {
          return Reflect.set(target, property, value, target);
        },
      }),
    );
  }

  try {
    await session.runtime.load({ params: snapshot.params, props: snapshot.props, signal });
  } finally {
    for (const [token, controller] of entries) module.controllers.set(token, controller);
  }
  if (signal.aborted) throw new Error('Активация модуля Next прервана.');
  session.runtime.commit();
  return session.runtime.getActiveModule();
}

function controllerMethods(controller: object): string[] {
  const methods = new Set<string>();
  let current: object | null = controller;
  while (current && current !== Object.prototype) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(current))) {
      if (key !== 'constructor' && typeof descriptor.value === 'function') methods.add(key);
    }
    current = Object.getPrototypeOf(current) as object | null;
  }
  return [...methods];
}

export function controllerIndex(tokens: readonly DependencyToken<unknown>[], token: DependencyToken<unknown>): number {
  const index = tokens.indexOf(token);
  if (index < 0) throw new Error('Контроллер не зарегистрирован в bindings модуля Next.');
  return index;
}
