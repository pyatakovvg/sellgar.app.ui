import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ApplicationFeaturesRuntime } from '../../../../core/application/feature/application-features-runtime';
import { describe, expect, it, vi } from 'vitest';

import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ApplicationFeatureInterface } from '../../../../core/application/feature/application-feature';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { Feature } from '../../../../shared/application/feature/application-feature';
import { createRuntimeFailure } from '../../../../core/runtime/failure/runtime-failure';
import { createRuntimeException } from '../../../../core/runtime/exception/runtime-exception';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { PresentationLayer } from '../../../../shared/application/rendering/presentation-layer';
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
      getSnapshot: () => ({ exception: null, phase: 'active' as const }),
      router: { routes: [] },
      subscribe: () => () => undefined,
    } as unknown as RouterRuntime<ModuleMetadata>;
    const lifecycle = { exception: null, phase: 'ready' as const };
    const navigation = { decision: null, navigation: undefined, pending: null };
    const scope = new ApplicationScope();
    const source: ApplicationViewSource = {
      featuresRuntime: new ApplicationFeaturesRuntime(scope, [], []),
      components: { failed: <div>application failed</div> },
      createHref: () => '/',
      createRenderException: (cause) => createApplicationRenderException(cause),
      failRender,
      features: [],
      getLifecycle: () => lifecycle,
      getNavigation: () => navigation,
      layouts: [BrokenLayout],
      routerRuntime,
      routing: null,
      scope,
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
    const BrokenPresentation: React.FC = () => {
      throw error;
    };
    @Feature({ presentation: { layer: PresentationLayer.Application, view: <BrokenPresentation /> } })
    class FixtureFeature implements ApplicationFeatureInterface {}

    const routerRuntime = {
      getBranchSnapshot: () => ({
        child: null,
        childPending: false,
        pending: false,
        pendingLocalChange: null,
        routes: [],
      }),
      getSnapshot: () => ({ exception: null, phase: 'active' as const }),
      router: { routes: [] },
      subscribe: () => () => undefined,
    } as unknown as RouterRuntime<ModuleMetadata>;
    const lifecycle = { exception: null, phase: 'ready' as const };
    const navigation = { decision: null, navigation: undefined, pending: null };
    const scope = new ApplicationScope();
    const source: ApplicationViewSource = {
      featuresRuntime: new ApplicationFeaturesRuntime(scope, [], []),
      components: { failed: <div>application failed</div> },
      createHref: () => '/',
      createRenderException: (cause) => createApplicationRenderException(cause),
      failRender,
      features: [FixtureFeature],
      getLifecycle: () => lifecycle,
      getNavigation: () => navigation,
      layouts: [],
      routerRuntime,
      routing: null,
      scope,
      subscribeLifecycle: () => () => undefined,
      subscribeNavigation: () => () => undefined,
    };

    render(<ApplicationHost source={source} />);

    expect(screen.getByText('application failed')).toBeInTheDocument();
    await waitFor(() => expect(failRender).toHaveBeenCalledWith(error));
    consoleError.mockRestore();
  });
});

const createApplicationRenderException = (cause: unknown) => {
  return createRuntimeException(
    createRuntimeFailure(cause, {
      operation: 'render',
      owner: { kind: 'application' },
      participant: { kind: 'runtime' },
    }),
    {
      disposition: 'application.failed',
      owner: { kind: 'application' },
      phase: 'failed',
    },
  );
};
