import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SessionRuntimeState } from '../../../../core/application/session/session-runtime-state';
import { Controller } from '../../../../core/controller/contract/controller';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import { HttpException } from '../../../../core/http/exception/http-exception';
import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { RouteActivationRuntime } from '../../../../core/router/runtime/route-runtime';
import { ApplicationComponentsProvider } from '../../../application/rendering/application-components-context';
import { Layout, type LayoutViewProps } from '../../../layout/declaration/layout';
import { useException } from '../../../runtime/exception/exception-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { Widget, WidgetDefinition } from '../../../widget/declaration/widget';
import { WidgetHost } from '../../../widget/rendering/widget-host';
import { Route } from '../../declaration/route';
import { Router } from '../../declaration/router';
import { RouterHost } from './router-host';
import type { RouterRuntime } from '../../../../core/router/runtime/router-runtime';
import type { ModuleMetadata } from '../../../module/declaration/module';
import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';

// A handled routing refusal owns its presentation; widget lifecycle and other errors remain independent.
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  cleanup();
  for (const dispose of cleanups.splice(0).reverse()) await dispose();
});

const createScope = () => {
  const scope = new ApplicationScope();
  const session = new SessionRuntimeState();
  session.setAuthenticated();
  scope.bindSession(session);
  cleanups.push(async () => {
    await scope.disposeWidgetRuntimes();
    await scope.disposeProviders();
    scope.dispose();
  });
  return scope;
};

const exceptionView = () => {
  const { cause } = useException();
  return <div data-testid="exception">Exception {cause instanceof HttpException ? cause.status : 'other'}</div>;
};
const components = {
  exception: React.createElement(exceptionView),
  forbidden: <div data-testid="forbidden">Forbidden</div>,
  notFound: <div data-testid="not-found">Not Found</div>,
};

const createWidget = (status: number) => {
  @Controller()
  class Loader {
    loader() {
      throw new HttpException('Rejected widget request', status);
    }
  }
  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(Loader).toSelf().inSingletonScope();
    }
  }
  @UseBindings(Bindings)
  @Widget({ view: () => <div>loaded widget</div> })
  class Token extends WidgetDefinition {}
  return Token;
};

const createRoute = (scope: ApplicationScope, layouts: ConstructorParameters<typeof Route>[0] = {}) => {
  class Module {}
  const route = new Route({ ...layouts, routes: [new Route({ load: async () => ({ Module }) })] });
  const runtime = new RouteActivationRuntime(
    route,
    scope,
    {
      resolve: () => createModuleRuntimeDefinition({ presentation: null, token: Module }),
    },
    'audit-route',
  );
  cleanups.push(() => runtime.dispose());
  return runtime;
};

describe('handled routing refusals and layout widgets', () => {
  it.each([403, 404])('preserves standalone widget Exception for HTTP %s', async (status) => {
    const scope = createScope();
    const Token = createWidget(status);
    render(
      <ApplicationComponentsProvider components={components}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={Token} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>,
    );
    expect(await screen.findByTestId('exception')).toHaveTextContent(`Exception ${status}`);
    expect(screen.queryByTestId('forbidden')).not.toBeInTheDocument();
    expect(screen.queryByTestId('not-found')).not.toBeInTheDocument();
  });

  it.each(
    [
      { phase: 'forbidden' as const, status: 403 },
      { phase: 'not-found' as const, status: 404 },
      { phase: 'failed' as const, status: 500 },
    ].flatMap((entry) => [false, true].map((parentLayout) => ({ ...entry, parentLayout }))),
  )(
    'keeps $phase presentation and isolates widget HTTP $status (active parent layout: $parentLayout)',
    async ({ phase, status, parentLayout }) => {
      const scope = createScope();
      const Token = createWidget(status);
      @Layout({
        view: ({ children }: LayoutViewProps) => (
          <>
            <WidgetHost token={Token} />
            {children}
          </>
        ),
      })
      class WidgetLayout {}
      const rejected = createRoute(scope, { layouts: parentLayout ? [] : [WidgetLayout] });
      rejected.commitBoundary(
        phase,
        phase === 'failed'
          ? rejected.createBoundaryException(new HttpException('Rejected route', status), 'prepare')
          : null,
        {},
      );
      const parent = createRoute(scope, { layouts: [WidgetLayout] });
      await parent.prepare({ params: {}, signal: new AbortController().signal });
      parent.commit();
      const routes = parentLayout ? [parent, rejected] : [rejected];
      const branch = { routes, pendingLocalChange: null };
      const snapshot = { phase: 'active' as const, exception: null };
      const routerRuntime = {
        router: new Router({ routes: [routes[0]!.route] }),
        getSnapshot: () => snapshot,
        getBranchSnapshot: () => branch,
        subscribe: () => () => undefined,
      } as unknown as RouterRuntime<ModuleMetadata>;
      render(
        <ApplicationComponentsProvider components={components}>
          <RouterHost runtime={routerRuntime} components={components} />
        </ApplicationComponentsProvider>,
      );
      const widgetOwner = parentLayout ? parent : rejected;
      await waitFor(() =>
        expect(
          scope.get(WidgetRuntimeRegistry).get({ ownerScope: widgetOwner.getRouteScope(), token: Token })?.getSnapshot()
            .phase,
        ).toBe('failed'),
      );
      if (phase === 'failed') {
        await waitFor(() => expect(screen.getAllByTestId('exception')).toHaveLength(2));
      } else {
        expect(screen.getByTestId(phase)).toBeInTheDocument();
        expect(screen.queryByTestId('exception')).not.toBeInTheDocument();
      }
    },
  );
});
