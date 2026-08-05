import React from 'react';

import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import { getUseBindingsMetadata } from '../../../di/composition/use-bindings';
import { SessionRuntimeStateInterface } from '../../../application/session/session-runtime-state';
import { renderLayouts } from '../../../layout/rendering/layout-renderer';
import { ExceptionProvider } from '../../../react/router/exception';
import { RenderExceptionBoundary } from '../../../react/router/exception/render-exception-boundary';
import { renderView } from '../../../react/view/renderable-view';
import { LocationServiceInterface, type RouterLocationSnapshot } from '../../../router/service/location-service';
import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { RouterParamsConverterInterface } from '../../../router/params/router-params-converter';
import type { ActiveFrameRuntime, RouterRuntime } from '../../../router/runtime/router-runtime';
import { RuntimeScopeProvider, useDependency } from '../../../runtime/react';
import {
  captureRuntimeFailure,
  createRuntimeInstanceId,
  reportRuntimeFailure,
  RuntimeFailureReporterInterface,
  type RuntimeOwner,
} from '../../../runtime/failure';
import type { RuntimeScope } from '../../../runtime/scope/base';

import { getFrameMetadata } from '../../declaration/frame';
import { FrameRuntime, type FrameRuntimePhase } from '../../runtime/frame-runtime';
import { FrameServiceInterface } from '../../service/frame-service';

import { FrameContextProvider } from '../frame-context';
import { FrameRuntimeProvider } from '../frame-runtime-context';

import type { ApplicationControllerInterface } from '../../../application/lifecycle/application-lifecycle';

export interface FrameLayerProps {
  readonly app: ApplicationControllerInterface;
  readonly deferIdleFrameLoad?: boolean;
  readonly routerRuntime: RouterRuntime;
}

export const FrameLayer: React.FC<FrameLayerProps> = ({ app, deferIdleFrameLoad = false, routerRuntime }) => {
  const locationService = useDependency(LocationServiceInterface);
  const navigateService = useDependency(NavigateServiceInterface);
  const paramsConverter = useDependency(RouterParamsConverterInterface);
  const session = useDependency(SessionRuntimeStateInterface);
  const location = React.useSyncExternalStore(
    React.useCallback((onStoreChange) => locationService.subscribe(onStoreChange), [locationService]),
    React.useCallback(() => locationService.location, [locationService]),
    React.useCallback(() => locationService.location, [locationService]),
  );
  const [runtimeRevision, refreshRuntimeRevision] = React.useReducer((value: number) => value + 1, 0);

  React.useEffect(() => {
    return routerRuntime.subscribe(refreshRuntimeRevision);
  }, [routerRuntime]);

  if (location === null) {
    return null;
  }

  void runtimeRevision;

  const deferRuntimeLoad =
    deferIdleFrameLoad || (typeof routerRuntime.isRouteLoading === 'function' && routerRuntime.isRouteLoading());
  const activeFrames = routerRuntime.resolveActiveFrames({
    location,
    navigateService,
    paramsConverter,
  });

  return (
    <>
      {activeFrames.map((activeFrame, index) => {
        return (
          <React.Fragment key={createFrameKey(activeFrame, index)}>
            <ActiveFrameHost
              activeFrame={activeFrame}
              deferIdleFrameLoad={deferRuntimeLoad}
              location={location}
              navigateService={navigateService}
              session={session}
              app={app}
            />
          </React.Fragment>
        );
      })}
    </>
  );
};

interface ActiveFrameHostProps {
  readonly activeFrame: ActiveFrameRuntime;
  readonly app: ApplicationControllerInterface;
  readonly deferIdleFrameLoad: boolean;
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly session: SessionRuntimeStateInterface;
}

const ActiveFrameHost: React.FC<ActiveFrameHostProps> = ({
  activeFrame,
  app,
  deferIdleFrameLoad,
  location,
  navigateService,
  session,
}) => {
  const metadata = getFrameMetadata(activeFrame.frame);
  const exception = metadata.exception ?? activeFrame.exception;
  const renderOwnerRef = React.useRef<RuntimeOwner | null>(null);

  if (!activeFrame.preparedRuntime && !renderOwnerRef.current) {
    renderOwnerRef.current = {
      instanceId: createRuntimeInstanceId('frame'),
      kind: 'frame',
      token: activeFrame.frame,
    };
  }

  const handleRenderError = React.useCallback(
    (error: unknown): void => {
      if (activeFrame.preparedRuntime) {
        void activeFrame.preparedRuntime.failRender(error);
        return;
      }

      const owner = renderOwnerRef.current;

      if (!owner) {
        return;
      }

      void reportRuntimeFailure(
        activeFrame.ownerScope.get(RuntimeFailureReporterInterface),
        captureRuntimeFailure(error, {
          operation: 'render',
          owner,
          participant: { kind: 'runtime' },
        }),
        owner,
        'frame.failed',
        'failed',
      );
    },
    [activeFrame.ownerScope, activeFrame.preparedRuntime],
  );

  return (
    <RenderExceptionBoundary exception={exception} onError={handleRenderError}>
      <ActiveFrameContent
        activeFrame={activeFrame}
        app={app}
        deferIdleFrameLoad={deferIdleFrameLoad}
        exception={exception}
        location={location}
        navigateService={navigateService}
        onRenderError={handleRenderError}
        session={session}
      />
    </RenderExceptionBoundary>
  );
};

interface ActiveFrameContentProps extends ActiveFrameHostProps {
  readonly exception: React.ReactNode;
  readonly onRenderError: (error: unknown) => void;
}

const ActiveFrameContent: React.FC<ActiveFrameContentProps> = ({
  activeFrame,
  app,
  deferIdleFrameLoad,
  exception,
  location,
  navigateService,
  onRenderError,
  session,
}) => {
  const metadata = getFrameMetadata(activeFrame.frame);

  if (
    (metadata.canActivate ?? []).length === 0 &&
    getUseBindingsMetadata(activeFrame.frame).length === 0 &&
    (metadata.providers ?? []).length === 0 &&
    (metadata.layouts ?? []).length === 0
  ) {
    return <>{renderActiveFrame(activeFrame, activeFrame.ownerScope, exception, onRenderError)}</>;
  }

  return (
    <FrameRuntimeHost
      activeFrame={activeFrame}
      app={app}
      deferIdleFrameLoad={deferIdleFrameLoad}
      exception={exception}
      location={location}
      navigateService={navigateService}
      onRenderError={onRenderError}
      session={session}
    />
  );
};

interface FrameRuntimeHostProps {
  readonly activeFrame: ActiveFrameRuntime;
  readonly app: ApplicationControllerInterface;
  readonly deferIdleFrameLoad: boolean;
  readonly exception: React.ReactNode;
  readonly location: RouterLocationSnapshot;
  readonly navigateService: NavigateServiceInterface;
  readonly onRenderError: (error: unknown) => void;
  readonly session: SessionRuntimeStateInterface;
}

const FrameRuntimeHost: React.FC<FrameRuntimeHostProps> = ({
  activeFrame,
  app,
  deferIdleFrameLoad,
  exception,
  location,
  navigateService,
  onRenderError,
  session,
}) => {
  const metadata = getFrameMetadata(activeFrame.frame);
  const runtimeRef = React.useRef<FrameRuntime<object> | null>(null);
  let runtime = runtimeRef.current;

  if (!runtime) {
    if (!activeFrame.preparedRuntime) {
      throw new Error('Runtime фрейма не подготовлен.');
    }

    runtime = activeFrame.preparedRuntime as FrameRuntime<object>;
    runtimeRef.current = runtime;
  }

  const loadOptionsRef = React.useRef({
    app,
    close: activeFrame.close,
    location,
    navigateService,
    session,
  });
  const snapshot = React.useSyncExternalStore(
    React.useCallback((onStoreChange) => runtime.subscribe(onStoreChange), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
  );

  React.useEffect(() => {
    if (deferIdleFrameLoad && runtime.getSnapshot().phase === 'idle') {
      return;
    }

    void runtime
      .load({
        ...loadOptionsRef.current,
      })
      .catch(() => undefined);
  }, [deferIdleFrameLoad, runtime]);

  const activeRuntime = runtime.getActiveRuntimeOrNull();

  if (!activeRuntime && metadata.shell) {
    return null;
  }

  const runtimeScope = activeRuntime?.scope ?? activeFrame.ownerScope;
  const viewContent =
    activeRuntime && snapshot.phase === 'ready' ? (
      <RuntimeScopeProvider scope={activeRuntime.scope}>
        <ControllerRuntimeProvider
          value={{
            controllers: runtime.getControllers(),
            kind: 'frame',
            runtime,
          }}
        >
          <FrameRuntimeProvider runtime={runtime}>
            <RenderExceptionBoundary exception={exception} onError={onRenderError}>
              <FrameContent activeFrame={activeFrame} />
            </RenderExceptionBoundary>
          </FrameRuntimeProvider>
        </ControllerRuntimeProvider>
      </RuntimeScopeProvider>
    ) : null;
  const currentFrameService = activeRuntime?.scope.get(FrameServiceInterface) ?? null;
  const content = resolveFrameContent(
    snapshot,
    metadata.fallback,
    exception,
    metadata.forbidden ?? activeFrame.forbidden,
    viewContent,
  );

  return <>{renderFrameContainer(activeFrame, runtimeScope, content, currentFrameService)}</>;
};

const renderActiveFrame = (
  activeFrame: ActiveFrameRuntime,
  runtimeScope: RuntimeScope,
  exception: React.ReactNode,
  onRenderError: (error: unknown) => void,
) => {
  return renderFrameContainer(
    activeFrame,
    runtimeScope,
    <RenderExceptionBoundary exception={exception} onError={onRenderError}>
      <FrameContent activeFrame={activeFrame} />
    </RenderExceptionBoundary>,
    null,
  );
};

const FrameContent: React.FC<{ readonly activeFrame: ActiveFrameRuntime }> = ({ activeFrame }) => {
  return <>{renderFrameContent(activeFrame)}</>;
};

const renderFrameContent = (activeFrame: ActiveFrameRuntime): React.ReactNode => {
  const metadata = getFrameMetadata(activeFrame.frame);

  return renderLayouts(metadata.layouts ?? [], renderView(metadata.view, activeFrame.props));
};

const renderFrameShell = (
  activeFrame: ActiveFrameRuntime,
  runtimeScope: RuntimeScope,
  content: React.ReactNode,
  controls: FrameContainerControls,
): React.ReactNode => {
  const metadata = getFrameMetadata(activeFrame.frame);

  if (!metadata.shell) {
    return content;
  }

  if (!runtimeScope.has(metadata.shell)) {
    runtimeScope.bindSelf(metadata.shell);
  }

  const shell = runtimeScope.get(metadata.shell);

  return shell.render({
    back: controls.back,
    close: controls.close,
    content,
    open: true,
  });
};

interface FrameContainerControls {
  readonly back: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly hasParent: boolean;
}

const renderFrameContainer = (
  activeFrame: ActiveFrameRuntime,
  runtimeScope: RuntimeScope,
  content: React.ReactNode,
  currentFrameService: FrameServiceInterface | null,
): React.ReactNode => {
  const controls: FrameContainerControls = {
    back: currentFrameService ? () => currentFrameService.back() : () => Promise.resolve(activeFrame.back()),
    close: currentFrameService ? () => currentFrameService.close() : () => Promise.resolve(activeFrame.close()),
    hasParent: currentFrameService?.hasParent() ?? false,
  };

  return (
    <FrameContextProvider back={controls.back} close={controls.close} hasParent={controls.hasParent} open={true}>
      {renderFrameShell(activeFrame, runtimeScope, content, controls)}
    </FrameContextProvider>
  );
};

const createFrameKey = (activeFrame: ActiveFrameRuntime, index: number): string => {
  const { frame } = activeFrame;
  const frameName = 'name' in frame && typeof frame.name === 'string' ? frame.name : 'frame';

  return `${frameName}:${index}:${activeFrame.runtimeKey ?? 'default'}`;
};

const resolveFrameContent = (
  snapshot: {
    readonly error: unknown | null;
    readonly phase: FrameRuntimePhase;
  },
  fallback: React.ReactNode,
  error: React.ReactNode,
  forbidden: React.ReactNode,
  view: React.ReactNode,
): React.ReactNode => {
  if (snapshot.phase === 'failed') {
    return <ExceptionProvider error={snapshot.error}>{error}</ExceptionProvider>;
  }

  if (snapshot.phase === 'forbidden') {
    return forbidden;
  }

  if (snapshot.phase !== 'ready') {
    return fallback;
  }

  return view;
};
