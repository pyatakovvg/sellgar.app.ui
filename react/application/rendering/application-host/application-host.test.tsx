import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { configureApplicationFeatureRenderer } from '../../feature/application-feature-renderer';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { PresentationLayer } from '../presentation-layer';
import { ApplicationHost, type ApplicationViewSource } from './application-host.tsx';

describe('ApplicationHost', () => {
  it('attributes an application layout error to Application', async () => {
    const error = new Error('application layout failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    const BrokenLayoutView: React.FC<LayoutViewProps> = () => {
      throw error;
    };

    @Layout({ view: BrokenLayoutView })
    class BrokenLayout {}

    const routerRuntime = {
      getBranchSnapshot: () => ({
        child: null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes: [],
      }),
      getSnapshot: () => ({ error: null, phase: 'active' as const }),
      router: { routes: [] },
      subscribe: () => () => undefined,
    } as unknown as RouterRuntime<ModuleMetadata>;
    const lifecycle = { error: null, phase: 'ready' as const };
    const navigation = { decision: null, navigation: undefined, pending: null };
    const source: ApplicationViewSource = {
      components: { failed: <div>application failed</div> },
      createHref: () => '/',
      failRender,
      features: [],
      getLifecycle: () => lifecycle,
      getNavigation: () => navigation,
      layouts: [BrokenLayout],
      routerRuntime,
      routing: null,
      scope: new ApplicationScope(),
      subscribeLifecycle: () => () => undefined,
      subscribeNavigation: () => () => undefined,
    };

    render(<ApplicationHost source={source} />);

    expect(screen.getByText('application failed')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });

  it('attributes an application feature render error to Application', async () => {
    const error = new Error('application feature failed');
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const failRender = vi.fn(async () => undefined);
    class FixtureFeature extends ApplicationFeatureInterface {}

    const feature = new FixtureFeature();

    configureApplicationFeatureRenderer(feature, PresentationLayer.Application, () => {
      throw error;
    });

    const routerRuntime = {
      getBranchSnapshot: () => ({
        child: null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes: [],
      }),
      getSnapshot: () => ({ error: null, phase: 'active' as const }),
      router: { routes: [] },
      subscribe: () => () => undefined,
    } as unknown as RouterRuntime<ModuleMetadata>;
    const lifecycle = { error: null, phase: 'ready' as const };
    const navigation = { decision: null, navigation: undefined, pending: null };
    const source: ApplicationViewSource = {
      components: { failed: <div>application failed</div> },
      createHref: () => '/',
      failRender,
      features: [feature],
      getLifecycle: () => lifecycle,
      getNavigation: () => navigation,
      layouts: [],
      routerRuntime,
      routing: null,
      scope: new ApplicationScope(),
      subscribeLifecycle: () => () => undefined,
      subscribeNavigation: () => () => undefined,
    };

    render(<ApplicationHost source={source} />);

    expect(screen.getByText('application failed')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });
});
