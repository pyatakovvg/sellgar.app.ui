import { describe, expect, it, vi } from 'vitest';
import type { RouterRuntime } from '../../../router/runtime/router-runtime';
import { ModuleScope } from '../../../runtime/scope/kind/module-scope';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { MetadataServiceInterface } from '../../service/metadata-service';
import { MetadataService } from '../metadata-service';
import { composeMetadata } from '../../composition/metadata-composition';
import { RouterMetadata } from './router-metadata';

const source = () => {
  const listeners = new Set<() => void>();
  return {
    listeners,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    emit() {
      for (const listener of [...listeners]) listener();
    },
  };
};

const moduleOwner = (parent: ApplicationScope, title: string) => {
  const scope = new ModuleScope(parent);
  scope.bindMetadata({ title });
  const events = source();
  return {
    ...events,
    getSnapshot: () => ({ phase: 'active' }),
    getModuleRuntimeOrNull: () => ({ getActiveModuleOrNull: () => ({ scope }) }),
    metadata: scope.get(MetadataServiceInterface),
    scope,
  };
};

const routerOwner = (routes: ReturnType<typeof moduleOwner>[]) => {
  const events = source();
  const state: {
    routes: ReturnType<typeof moduleOwner>[];
    child: RouterRuntime | null;
    phase: string;
  } = { routes, child: null, phase: 'active' };
  const runtime = {
    ...events,
    getSnapshot: () => ({ phase: state.phase }),
    getActiveLocalRouteRuntimes: () => state.routes,
    getActiveChildRouterRuntimeOrNull: () => (state.child ? { runtime: state.child } : null),
  } as unknown as RouterRuntime;
  return { ...events, state, runtime };
};

describe('RouterMetadata committed projection', () => {
  it('keeps pending and retained owners isolated, restores focused values and releases all subscriptions', () => {
    const app = new ApplicationScope();
    const first = moduleOwner(app, 'Заказы');
    const retained = moduleOwner(app, 'Клиенты');
    const frame = moduleOwner(app, 'Фильтры');
    const innerFrame = moduleOwner(app, 'Сохранение');
    const root = routerOwner([first]);
    const nested = routerOwner([frame]);
    const inner = routerOwner([innerFrame]);
    root.state.child = nested.runtime;
    nested.state.child = inner.runtime;
    const application = new MetadataService({ title: 'Кабинет' });
    const projection = new RouterMetadata(root.runtime, application);
    const notify = vi.fn();
    const unsubscribe = projection.subscribe(notify);
    const title = () => composeMetadata(projection.getSnapshot()).title;
    expect(title()).toBe('Кабинет: Заказы (Фильтры — Сохранение)');
    const snapshot = projection.getSnapshot();
    retained.metadata.set.title('Новое название скрытого модуля');
    root.emit(); // A pending transition has no committed branch changes.
    expect(projection.getSnapshot()).toBe(snapshot);
    expect(notify).not.toHaveBeenCalled();
    root.state.routes = [retained];
    root.state.child = null;
    root.emit();
    expect(title()).toBe('Кабинет: Новое название скрытого модуля');
    first.metadata.set.title('Архив');
    expect(title()).toBe('Кабинет: Новое название скрытого модуля');
    expect(first.listeners.size).toBe(0);
    root.state.routes = [first];
    root.state.child = nested.runtime;
    root.emit();
    expect(title()).toBe('Кабинет: Архив (Фильтры — Сохранение)');
    application.set.title('Личный кабинет');
    expect(title()).toBe('Личный кабинет: Архив (Фильтры — Сохранение)');
    unsubscribe();
    expect(
      root.listeners.size + nested.listeners.size + inner.listeners.size + first.listeners.size + frame.listeners.size,
    ).toBe(0);
    const calls = notify.mock.calls.length;
    frame.metadata.set.title('Detached');
    expect(notify).toHaveBeenCalledTimes(calls);
    first.scope.dispose();
    retained.scope.dispose();
    frame.scope.dispose();
    innerFrame.scope.dispose();
    app.dispose();
  });

  it('does not include descendants of a failed navigation boundary', () => {
    const app = new ApplicationScope();
    const page = moduleOwner(app, 'Page');
    const frame = moduleOwner(app, 'Frame');
    const root = routerOwner([page]);
    root.state.child = routerOwner([frame]).runtime;
    root.state.phase = 'forbidden';
    const projection = new RouterMetadata(root.runtime, new MetadataService({ title: 'Application' }));
    expect(composeMetadata(projection.getSnapshot()).title).toBe('Application');
    page.scope.dispose();
    frame.scope.dispose();
    app.dispose();
  });
});
