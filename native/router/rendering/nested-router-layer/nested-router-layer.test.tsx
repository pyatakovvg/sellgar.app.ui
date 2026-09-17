import React from 'react';
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import type { RouterRuntime, RouterRuntimeActivationTree } from '../../../../core/router/runtime/router-runtime';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { NestedRouterLayer } from './nested-router-layer.tsx';

const shell = vi.hoisted(() => ({ phase: '', complete: () => {} }));
vi.mock('react-native', () => ({
  View: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  StyleSheet: { absoluteFill: {} },
}));
vi.mock('../../../screen/rendering/screen-compositor', () => ({
  ScreenLayerHost: ({ children }: React.PropsWithChildren) => children,
}));
vi.mock('../router-host', () => ({ RouterHost: () => null }));
vi.mock('../router-host/nested-router-host', () => ({
  NestedRouterHost: ({ phase, onPresentationComplete }: { phase: string; onPresentationComplete: () => void }) => {
    shell.phase = phase;
    shell.complete = onPresentationComplete;
    return <div>{phase}</div>;
  },
}));

const createFixture = () => {
  const childRouter = new Router({ routes: [new Route({ token: class ChildRoute {}, load: async () => ({}) })] });
  const route = new Route({ token: class OwnerRoute {}, load: async () => ({}) });
  const router = new Router({ routes: [route] });
  const snapshot = { phase: 'ready' };
  const child = { owner: { route }, runtime: { router: childRouter } };
  let open = true;
  const runtime = {
    router,
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
    getBranchSnapshot: () => ({ routes: [child.owner], child: open ? child : null }),
  } as unknown as RouterRuntime<ModuleMetadata>;
  const retainedTree = {
    routes: [child.owner],
    child: { owner: child.owner, tree: { runtime: child.runtime } },
  } as unknown as RouterRuntimeActivationTree<ModuleMetadata>;
  const props = {
    components: {},
    depth: 0,
    dismissPending: vi.fn(),
    onPresentationComplete: vi.fn(),
    routing: null,
    runtime,
  };
  return {
    props,
    retainedTree,
    close: () => {
      open = false;
    },
  };
};

describe('frame animation completion ownership', () => {
  beforeEach(() => {
    shell.phase = '';
    shell.complete = () => {};
  });

  it('ignores a presenting callback after dismissal has begun', () => {
    const fixture = createFixture();
    const view = render(
      <NestedRouterLayer {...fixture.props} transition={{ depth: 0, operation: 'present', revision: 1 }} />,
    );
    const oldComplete = shell.complete;
    fixture.close();
    view.rerender(
      <NestedRouterLayer
        {...fixture.props}
        retainedTree={fixture.retainedTree}
        transition={{ depth: 0, operation: 'dismiss', revision: 2 }}
      />,
    );
    expect(shell.phase).toBe('dismissing');
    act(() => oldComplete());
    expect(fixture.props.onPresentationComplete).not.toHaveBeenCalled();
    expect(shell.phase).toBe('dismissing');
    act(() => shell.complete());
    expect(fixture.props.onPresentationComplete).toHaveBeenCalledWith(2);
  });

  it('does not restart the physical animation when pending receives its commit revision', () => {
    const fixture = createFixture();
    const view = render(
      <NestedRouterLayer {...fixture.props} transition={{ depth: 0, operation: 'present', revision: null }} />,
    );
    const complete = shell.complete;
    view.rerender(
      <NestedRouterLayer {...fixture.props} transition={{ depth: 0, operation: 'present', revision: 1 }} />,
    );
    expect(shell.complete).toBe(complete);
    act(() => complete());
    expect(shell.phase).toBe('visible');
    expect(fixture.props.onPresentationComplete).toHaveBeenCalledWith(1);
  });
});
