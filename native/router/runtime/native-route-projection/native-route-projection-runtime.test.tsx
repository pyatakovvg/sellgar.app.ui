import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { segments } from '../../../../core/router/declaration/address';
import type { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { Route } from '../../declaration/route';
import { NativeRouteProjectionRuntime, type NativeRouteProjectionInput } from './native-route-projection-runtime';

// Physical native transitions are outside this JS composition test.
vi.mock('../../../screen/rendering/screen-renderer', () => ({ ScreenRenderer: () => null }));

describe('native projected layout content', () => {
  it('updates a retained scene kind without replacing its layout state or screen identity', () => {
    const OuterView = ({ children, kind }: LayoutViewProps) => {
      const [count, setCount] = React.useState(0);
      return (
        <section data-testid="outer" data-kind={kind}>
          <button onClick={() => setCount(count + 1)}>{count}</button>
          {children}
        </section>
      );
    };
    @Layout({ view: OuterView })
    class OuterLayout {}
    @Layout({ view: ({ children }: LayoutViewProps) => <>{children}</> })
    class NestedLayout {}
    const direct = new Route({ address: segments('direct'), load: async () => ({}) });
    const nested = new Route({ address: segments('nested'), layouts: [NestedLayout], load: async () => ({}) });
    const parent = new Route({ layouts: [OuterLayout], routes: [direct, nested] });
    const parentRuntime = createRuntime(parent);
    const directRuntime = createRuntime(direct);
    const nestedRuntime = createRuntime(nested);
    const projection = new NativeRouteProjectionRuntime(() => undefined);

    projection.project(createInput([parentRuntime, directRuntime]));
    const scene = projection.root.getSnapshot().scenes[0];
    const { rerender } = render(scene.getSnapshot().content);
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'module');

    projection.project(createInput([parentRuntime, nestedRuntime]));
    expect(projection.root.getSnapshot().scenes[0]).toBe(scene);
    rerender(scene.getSnapshot().content);
    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'layout');
    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveTextContent('1');

    const content = scene.getSnapshot().content;
    projection.project(createInput([parentRuntime, nestedRuntime]));
    expect(scene.getSnapshot().content).toBe(content);
  });
});

const createRuntime = (route: Route): RouteActivationRuntime<ModuleMetadata> => {
  const scope = new ApplicationScope();
  const snapshot = Object.freeze({ phase: 'active', exception: null });
  return {
    route,
    getSnapshot: () => snapshot,
    getRouteScope: () => scope,
    subscribe: () => () => undefined,
  } as unknown as RouteActivationRuntime<ModuleMetadata>;
};

const createInput = (routes: readonly RouteActivationRuntime<ModuleMetadata>[]): NativeRouteProjectionInput => {
  const navigation = { root: { path: routes.map((runtime) => ({ route: runtime.route, params: {} })) } };
  return {
    components: {},
    current: navigation,
    dismissing: false,
    entries: [{ activation: { navigation }, tree: { routes } }],
    pending: null,
    pendingTree: null,
    runtimeEntries: [],
    source: navigation,
  } as unknown as NativeRouteProjectionInput;
};
