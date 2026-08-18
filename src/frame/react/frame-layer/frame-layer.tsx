import React from 'react';

import type { ResolvedApplicationFrames } from '../../../application/config/application-configurator';
import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';
import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import { ExceptionProvider } from '../../../react/router/exception';
import { RenderExceptionBoundary } from '../../../react/router/exception/render-exception-boundary';
import { renderView } from '../../../react/view/renderable-view';
import { LocationServiceInterface, type RouterLocationSnapshot } from '../../../router/service/location-service';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import type { ActiveFrameRouterRuntime, RouterRuntime } from '../../../router/runtime/router-runtime';
import { RuntimeScopeProvider, useDependency } from '../../../runtime/react';

import { getFrameMetadata } from '../../declaration/frame';
import { getFrameRouterDefinition } from '../../router/declaration';
import { resolveFrameRouterBoundary, type FrameRouterRuntimeSnapshot } from '../../router/runtime';
import type { FrameRuntimeSnapshot } from '../../runtime/frame-runtime';

import { FrameRuntimeProvider } from '../frame-runtime-context';

export interface FrameLayerProps {
  readonly app: ApplicationControllerInterface;
  readonly configuration: ResolvedApplicationFrames | null;
  readonly routeIds: readonly string[];
  readonly routerRuntime: RouterRuntime;
}

export const FrameLayer: React.FC<FrameLayerProps> = ({ app, configuration, routeIds, routerRuntime }) => {
  const locationService = useDependency(LocationServiceInterface);
  const navigateService = useDependency(NavigateServiceInterface);
  const session = useDependency(SessionRuntimeStateInterface);
  const location = React.useSyncExternalStore(
    React.useCallback((listener) => locationService.subscribe(listener), [locationService]),
    React.useCallback(() => locationService.location, [locationService]),
    React.useCallback(() => locationService.location, [locationService]),
  );
  const [, refreshRuntimeRevision] = React.useReducer((value: number) => value + 1, 0);

  React.useEffect(() => routerRuntime.subscribe(refreshRuntimeRevision), [routerRuntime]);

  if (location === null) {
    return null;
  }

  const activeFrame = routerRuntime.resolveActiveFrame(routeIds, location.hash);

  if (!activeFrame) {
    return null;
  }

  if (!configuration) {
    throw new Error('FrameRouter требует глобальную настройку app.frames({ shell }).');
  }

  return (
    <ActiveFrameRouterHost
      activeFrame={activeFrame}
      app={app}
      configuration={configuration}
      location={location}
      navigateService={navigateService}
      session={session}
    />
  );
};

interface ActiveFrameRouterHostProps {
  readonly activeFrame: ActiveFrameRouterRuntime;
  readonly app: ApplicationControllerInterface;
  readonly configuration: ResolvedApplicationFrames;
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly session: SessionRuntimeStateInterface;
}

const ActiveFrameRouterHost: React.FC<ActiveFrameRouterHostProps> = ({
  activeFrame,
  app,
  configuration,
  location,
  navigateService,
  session,
}) => {
  const runtime = activeFrame.preparedRuntime;
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
  );

  React.useEffect(() => {
    void runtime.load(activeFrame.match, { app, location, navigateService, session });
  }, [activeFrame.match.sourcePath, app, location, navigateService, runtime, session]);

  const definition = getFrameRouterDefinition(activeFrame.match.router);
  const exception = resolveFrameRouterBoundary(activeFrame.match, 'exception') ?? configuration.exception;
  const handleRenderError = React.useCallback((error: unknown) => void runtime.failRender(error), [runtime]);
  const content = renderFrameRouterContent(snapshot, activeFrame, configuration);
  const routerContent = renderLayouts(definition.layouts, content);
  const controls = {
    close: () => runtime.close(),
  };
  const shell = definition.shell ?? configuration.shell;
  const scope = runtime.getRouterScope();

  if (!scope.has(shell)) {
    scope.bindSelf(shell);
  }

  return (
    <RenderExceptionBoundary exception={exception} onError={handleRenderError}>
      <RuntimeScopeProvider scope={scope}>
        {scope.get(shell).render({
          close: controls.close,
          content: routerContent,
          open: true,
        })}
      </RuntimeScopeProvider>
    </RenderExceptionBoundary>
  );
};

const renderFrameRouterContent = (
  snapshot: FrameRouterRuntimeSnapshot,
  activeFrameRouter: ActiveFrameRouterRuntime,
  configuration: ResolvedApplicationFrames,
): React.ReactNode => {
  const match = activeFrameRouter.match;

  if (snapshot.matchKey !== match.sourcePath || snapshot.phase === 'idle' || snapshot.phase === 'loading') {
    return resolveFrameRouterBoundary(match, 'fallback') ?? configuration.fallback;
  }

  if (snapshot.phase === 'forbidden') {
    return resolveFrameRouterBoundary(match, 'forbidden') ?? configuration.forbidden;
  }

  if (snapshot.phase === 'not-found') {
    return resolveFrameRouterBoundary(match, 'notFound') ?? configuration.notFound;
  }

  if (snapshot.phase === 'failed') {
    return (
      <ExceptionProvider error={snapshot.error}>
        {resolveFrameRouterBoundary(match, 'exception') ?? configuration.exception}
      </ExceptionProvider>
    );
  }

  if (snapshot.phase !== 'ready' || !snapshot.active) {
    return null;
  }

  return <RoutedFrameContent active={snapshot.active} configuration={configuration} />;
};

interface RoutedFrameContentProps {
  readonly active: NonNullable<FrameRouterRuntimeSnapshot['active']>;
  readonly configuration: ResolvedApplicationFrames;
}

const RoutedFrameContent: React.FC<RoutedFrameContentProps> = ({ active, configuration }) => {
  const runtime = active.runtime;
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => runtime.subscribe(listener), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
  );
  const metadata = getFrameMetadata(active.frame);
  const activeRuntime = runtime.getActiveRuntimeOrNull();
  const exception = metadata.exception ?? active.exception ?? configuration.exception;
  const handleRenderError = React.useCallback((error: unknown) => void runtime.failRender(error), [runtime]);
  const view =
    activeRuntime && snapshot.phase === 'ready' ? (
      <RenderExceptionBoundary key={active.match.sourcePath} exception={exception} onError={handleRenderError}>
        <RuntimeScopeProvider scope={activeRuntime.scope}>
          <ControllerRuntimeProvider value={runtime}>
            <FrameRuntimeProvider runtime={runtime}>
              {renderLayouts(metadata.layouts ?? [], renderView(metadata.view, {}))}
            </FrameRuntimeProvider>
          </ControllerRuntimeProvider>
        </RuntimeScopeProvider>
      </RenderExceptionBoundary>
    ) : null;
  const content = resolveFrameRuntimeContent(
    snapshot,
    metadata.fallback ?? active.fallback ?? configuration.fallback,
    exception,
    active.forbidden ?? configuration.forbidden,
    view,
  );

  return <RuntimeScopeProvider scope={active.scope}>{renderLayouts(active.layouts, content)}</RuntimeScopeProvider>;
};

const resolveFrameRuntimeContent = (
  snapshot: FrameRuntimeSnapshot,
  fallback: React.ReactNode,
  exception: React.ReactNode,
  forbidden: React.ReactNode,
  view: React.ReactNode,
): React.ReactNode => {
  if (snapshot.phase === 'failed') {
    return <ExceptionProvider error={snapshot.error}>{exception}</ExceptionProvider>;
  }

  if (snapshot.phase === 'forbidden') {
    return forbidden;
  }

  if (snapshot.phase !== 'ready') {
    return fallback;
  }

  return view;
};
