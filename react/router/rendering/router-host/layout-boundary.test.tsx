import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { segments } from '../../../../core/router/declaration/address';
import type { ModuleRuntime } from '../../../../core/module/runtime/module-runtime';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { createRuntimeException } from '../../../../core/runtime/exception/runtime-exception';
import { createRuntimeFailure } from '../../../../core/runtime/failure/runtime-failure';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import { getModuleMetadata, Module, type ModuleMetadata } from '../../../module/declaration/module';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { RouterHost } from './router-host';

describe('layout boundaries through routing', () => {
  it('keeps a module opaque and isolates local updates, fallback and errors from the outer layout', () => {
    const outerRender = vi.fn();
    const OuterView = ({ children, kind }: LayoutViewProps) => {
      outerRender(kind);
      const [count, setCount] = React.useState(0);
      return (
        <section data-testid="outer" data-kind={kind}>
          <button onClick={() => setCount(count + 1)}>outer {count}</button>
          <input aria-label="outer state" />
          {children}
        </section>
      );
    };
    @Layout({ view: OuterView })
    class OuterLayout {}
    @Layout({
      view: ({ children, kind }: LayoutViewProps) => (
        <section data-testid="module-layout" data-kind={kind}>
          {children}
        </section>
      ),
    })
    class ModuleLayout {}
    @Module({ layouts: [ModuleLayout], view: () => <input aria-label="module state" /> })
    class TestModule {}

    const route = new Route({ layouts: [OuterLayout], load: async () => ({ TestModule }) });
    const fixture = createModuleRoute(route, TestModule);
    const router = createRouter(new Router({ routes: [route] }), [fixture.routeRuntime]);
    render(
      <RouterHost
        components={{ fallback: <div>loading module</div>, exception: <div>module failed</div> }}
        runtime={router.runtime}
      />,
    );

    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'module');
    expect(screen.getByTestId('module-layout')).toHaveAttribute('data-kind', 'module');
    fireEvent.click(screen.getByRole('button'));
    const outerInput = screen.getByLabelText('outer state');
    const moduleInput = screen.getByLabelText('module state');
    fireEvent.change(outerInput, { target: { value: 'retained outer state' } });
    fireEvent.change(moduleInput, { target: { value: 'retained module state' } });
    outerInput.focus();
    const renders = outerRender.mock.calls.length;

    act(() => fixture.publish({ phase: 'active', exception: null }));
    expect(outerRender).toHaveBeenCalledTimes(renders);
    expect(screen.getByLabelText('module state')).toBe(moduleInput);
    expect(moduleInput).toHaveValue('retained module state');
    expect(outerInput).toHaveFocus();

    act(() => fixture.setPresentation(false));
    expect(screen.getByText('loading module')).toBeInTheDocument();
    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'module');

    const exception = createRuntimeException(
      createRuntimeFailure(new Error('module failed'), {
        operation: 'load',
        owner: { kind: 'module', token: TestModule },
        participant: { kind: 'runtime' },
      }),
      { disposition: 'module.failed', owner: { kind: 'module', token: TestModule }, phase: 'failed' },
    );
    act(() => fixture.publish({ phase: 'failed', exception }));
    expect(screen.getByText('module failed')).toBeInTheDocument();
    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'module');
    expect(screen.getByRole('button')).toHaveTextContent('outer 1');
    expect(outerInput).toHaveValue('retained outer state');
    expect(outerRender).toHaveBeenCalledTimes(renders);
  });

  it('updates kind on a retained route layout without remounting it, including pending branch replacement', () => {
    const OuterView = ({ children, kind }: LayoutViewProps) => {
      const [count, setCount] = React.useState(0);
      return (
        <section data-testid="shell" data-kind={String(kind)}>
          <button onClick={() => setCount(count + 1)}>{count}</button>
          {children}
        </section>
      );
    };
    @Layout({ view: OuterView })
    class OuterLayout {}
    @Layout({
      view: ({ children, kind }: LayoutViewProps) => (
        <section data-testid="nested" data-kind={kind}>
          {children}
        </section>
      ),
    })
    class NestedLayout {}
    @Module({ view: () => <div>screen</div> })
    class TestModule {}
    const direct = new Route({ address: segments('direct'), load: async () => ({ TestModule }) });
    const nested = new Route({
      address: segments('nested'),
      layouts: [NestedLayout],
      load: async () => ({ TestModule }),
    });
    const parent = new Route({ layouts: [OuterLayout], routes: [direct, nested] });
    const parentRuntime = createModuleRoute(parent, TestModule).routeRuntime;
    const directRuntime = createModuleRoute(direct, TestModule).routeRuntime;
    const nestedRuntime = createModuleRoute(nested, TestModule).routeRuntime;
    const router = createRouter(new Router({ routes: [parent] }), [parentRuntime, directRuntime]);
    render(<RouterHost components={{ fallback: <div>changing branch</div> }} runtime={router.runtime} />);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByTestId('shell')).toHaveAttribute('data-kind', 'module');

    act(() => router.publish([parentRuntime, nestedRuntime]));
    expect(screen.getByTestId('shell')).toHaveAttribute('data-kind', 'layout');
    expect(screen.getByTestId('nested')).toHaveAttribute('data-kind', 'module');
    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveTextContent('1');

    act(() => router.publish([parentRuntime, nestedRuntime], 1));
    expect(screen.getByText('changing branch')).toBeInTheDocument();
    expect(screen.queryByTestId('nested')).not.toBeInTheDocument();
    expect(screen.getByTestId('shell')).toHaveAttribute('data-kind', 'null');
    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveTextContent('1');
  });
});

const createModuleRoute = (route: Route, token: Parameters<typeof getModuleMetadata>[0]) => {
  const listeners = new Set<() => void>();
  const routeListeners = new Set<() => void>();
  const presentationModule = { definition: { presentation: getModuleMetadata(token) }, scope: new ApplicationScope() };
  let snapshot: { phase: 'active' | 'failed'; exception: ReturnType<typeof createRuntimeException> | null } = {
    phase: 'active',
    exception: null,
  };
  let presenting = true;
  const routeSnapshot = Object.freeze({ phase: 'active', exception: null });
  const publish = (next: typeof snapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener());
    routeListeners.forEach((listener) => listener());
  };
  const moduleRuntime = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as ModuleRuntime<ModuleMetadata>;
  const routeRuntime = {
    route,
    getSnapshot: () => routeSnapshot,
    getRouteScope: () => presentationModule.scope,
    getModuleRuntimeOrNull: () => moduleRuntime,
    getBoundaryModuleOrNull: () => presentationModule,
    getPresentationModuleOrNull: () => (presenting ? presentationModule : null),
    subscribe: (listener: () => void) => {
      routeListeners.add(listener);
      return () => routeListeners.delete(listener);
    },
  } as unknown as RouteActivationRuntime<ModuleMetadata>;
  return {
    routeRuntime,
    publish,
    setPresentation: (value: boolean) => {
      presenting = value;
      publish({ ...snapshot });
    },
  };
};

const createRouter = (router: Router, initial: readonly RouteActivationRuntime<ModuleMetadata>[]) => {
  const listeners = new Set<() => void>();
  let branch = { routes: initial, pendingLocalChange: null as { commonRouteCount: number } | null };
  let snapshot = { phase: 'active', exception: null };
  const runtime = {
    router,
    getSnapshot: () => snapshot,
    getBranchSnapshot: () => branch,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as RouterRuntime<ModuleMetadata>;
  return {
    runtime,
    publish: (routes: typeof initial, commonRouteCount?: number) => {
      branch = { routes, pendingLocalChange: commonRouteCount === undefined ? null : { commonRouteCount } };
      snapshot = { phase: commonRouteCount === undefined ? 'active' : 'pending', exception: null };
      listeners.forEach((listener) => listener());
    },
  };
};
