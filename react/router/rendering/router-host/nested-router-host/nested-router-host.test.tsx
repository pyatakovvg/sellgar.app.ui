import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RouterRuntime } from '../../../../../core/router/runtime/router-runtime';
import type { NavigateServiceInterface } from '../../../../../core/router/service/navigate-service';
import { ApplicationScope } from '../../../../../core/runtime/scope/kind/application-scope';
import type { ModuleMetadata } from '../../../../module/declaration/module';
import { Route } from '../../../declaration/route';
import { Router } from '../../../declaration/router';
import { Shell, ShellInterface } from '../../../declaration/shell';
import { NestedRouterHost } from './nested-router-host.tsx';

class TestRoute {}

@Shell()
class BrokenShell extends ShellInterface {
  render(): React.ReactNode {
    throw new Error('shell failed');
  }
}

describe('NestedRouterHost', () => {
  it('attributes a shell render error to its RouterRuntime', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    const scope = new ApplicationScope();
    const navigate = { close: vi.fn(async () => undefined) } as unknown as NavigateServiceInterface;

    scope.bindNavigate(navigate);

    const router = new Router({
      routes: [new Route({ load: async () => ({}), token: TestRoute })],
      shell: BrokenShell,
    });
    const runtime = {
      failRender,
      getRouterScope: () => scope,
      router,
    } as unknown as RouterRuntime<ModuleMetadata>;

    render(
      <NestedRouterHost exception={<div>router exception</div>} routing={null} runtime={runtime}>
        content
      </NestedRouterHost>,
    );

    expect(screen.getByText('router exception')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(expect.objectContaining({ message: 'shell failed' })));
    consoleError.mockRestore();
  });
});
