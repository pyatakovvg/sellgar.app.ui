import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RouteRuntime } from '../../../../core/router/runtime/route-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { RouteHost } from './route-host.tsx';

describe('RouteHost', () => {
  it('renders only the child screen Module for a Route.routes stack', () => {
    const scope = new ApplicationScope();
    const getModuleRuntimeOrNull = vi.fn(() => null);
    const snapshot = { error: null, phase: 'active' as const };
    const runtime = {
      failRender: vi.fn(async () => undefined),
      getModuleRuntimeOrNull,
      getRouteScope: () => scope,
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    } as unknown as RouteRuntime<ModuleMetadata>;

    render(
      <RouteHost components={{}} layouts={[]} runtime={runtime}>
        <div>child screen</div>
      </RouteHost>,
    );

    expect(screen.getByText('child screen')).toBeInTheDocument();
    expect(getModuleRuntimeOrNull).not.toHaveBeenCalled();
  });

  it('attributes a Route presentation error to RouteRuntime', async () => {
    const error = new Error('route view failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    const scope = new ApplicationScope();
    const snapshot = { error: null, phase: 'active' as const };
    const runtime = {
      failRender,
      getModuleRuntimeOrNull: () => null,
      getRouteScope: () => scope,
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    } as unknown as RouteRuntime<ModuleMetadata>;
    const BrokenChild: React.FC = () => {
      throw error;
    };

    render(
      <RouteHost components={{ exception: <div>route exception</div> }} layouts={[]} runtime={runtime}>
        <BrokenChild />
      </RouteHost>,
    );

    expect(screen.getByText('route exception')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });
});
