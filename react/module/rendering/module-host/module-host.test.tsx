import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { ModuleRuntime } from '../../../../core/module/runtime/module-runtime';
import type { RouteRuntime } from '../../../../core/router/runtime/route-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { getModuleMetadata, Module, type ModuleMetadata } from '../../declaration/module';
import { ModuleHost } from './module-host.tsx';

const error = new Error('module view failed');

const BrokenView: React.FC = () => {
  throw error;
};

@Module({ exception: <div>module exception</div>, view: BrokenView })
class BrokenModule {}

describe('ModuleHost', () => {
  it('attributes a Module view error to ModuleRuntime', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    const presentationModule = {
      definition: { presentation: getModuleMetadata(BrokenModule) },
      scope: new ApplicationScope(),
    };
    const snapshot = { error: null, phase: 'active' as const };
    const moduleRuntime = {
      failRender,
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
    } as unknown as ModuleRuntime<ModuleMetadata>;
    const routeRuntime = {
      getBoundaryModuleOrNull: () => presentationModule,
      getPresentationModuleOrNull: () => presentationModule,
    } as unknown as RouteRuntime<ModuleMetadata>;

    render(
      <ModuleHost
        exception={<div>application exception</div>}
        fallback={null}
        moduleRuntime={moduleRuntime}
        routeRuntime={routeRuntime}
      />,
    );

    expect(screen.getByText('module exception')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });
});
