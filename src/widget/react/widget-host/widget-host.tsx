import React from 'react';

import { useApplicationComponents } from '../../../application/react/application-components-context';
import { ControllerRuntimeProvider } from '../../../controller/react/controller-runtime-context';
import { renderView } from '../../../react/view/renderable-view';
import { ExceptionProvider } from '../../../react/router/exception';
import { RenderExceptionBoundary } from '../../../react/router/exception/render-exception-boundary';
import { useDependency, useRuntimeScope } from '../../../runtime/react';
import type { RuntimeScope } from '../../../runtime/scope/base';

import { getWidgetMetadata } from '../../declaration/widget';
import { WidgetRuntimeFactoryInterface } from '../../runtime/widget-runtime-factory';
import type { WidgetConstructor, WidgetProps } from '../../declaration/widget';
import type { WidgetRuntime } from '../../runtime/widget-runtime';
import type { WidgetRuntimePhase } from '../../runtime/widget-state-machine';

import { WidgetRuntimeProvider } from '../widget-runtime-context';

export type WidgetHostProps<TWidget extends WidgetConstructor> = WidgetHostBaseProps<TWidget> &
  WidgetHostWidgetProps<WidgetProps<TWidget>>;

export const WidgetHost = <TWidget extends WidgetConstructor>(
  hostProps: WidgetHostProps<TWidget>,
): React.ReactElement => {
  const { runtimeKey, token } = hostProps;
  const widgetProps = createWidgetHostProps('props' in hostProps ? hostProps.props : undefined);
  const metadata = getWidgetMetadata<WidgetProps<TWidget>>(token);
  const components = useApplicationComponents();
  const ownerScope = useRuntimeScope();
  const widgetFactory = useDependency(WidgetRuntimeFactoryInterface);
  const disposeTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const runtimeRef = React.useRef<WidgetRuntimeEntry<WidgetProps<TWidget>> | null>(null);

  if (!runtimeRef.current) {
    const runtimeOptions = {
      ownerScope: ownerScope as RuntimeScope,
      props: widgetProps,
      runtimeKey,
    };
    const preparedRuntime = widgetFactory.consumePrepared(token, runtimeOptions);

    runtimeRef.current = {
      runtime: preparedRuntime ?? widgetFactory.create(token, runtimeOptions),
    };
  }

  const { runtime } = runtimeRef.current;

  runtime.setProps(widgetProps);

  const snapshot = React.useSyncExternalStore(
    React.useCallback((onStoreChange) => runtime.subscribe(onStoreChange), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
    React.useCallback(() => runtime.getSnapshot(), [runtime]),
  );

  React.useEffect(() => {
    if (disposeTimerRef.current) {
      clearTimeout(disposeTimerRef.current);
      disposeTimerRef.current = null;
    }

    if (runtime.getSnapshot().phase !== 'failed') {
      void runtime.load().catch(() => void 0);
    }

    return () => {
      disposeTimerRef.current = setTimeout(() => {
        void runtime.dispose();

        if (runtimeRef.current?.runtime === runtime) {
          runtimeRef.current = null;
        }
      }, 0);
    };
  }, [runtime]);

  const content = resolveWidgetContent(snapshot.phase, {
    error: snapshot.error,
    exception: metadata.exception ?? components.exception,
    fallback: metadata.fallback ?? components.fallback,
    view: renderView(metadata.view, widgetProps),
  });

  return (
    <RenderExceptionBoundary
      exception={metadata.exception ?? components.exception}
      onError={(error) => void runtime.failRender(error)}
    >
      <ControllerRuntimeProvider
        value={{
          controllers: runtime.getControllers(),
          kind: 'widget',
          runtime,
        }}
      >
        <WidgetRuntimeProvider runtime={runtime}>{content}</WidgetRuntimeProvider>
      </ControllerRuntimeProvider>
    </RenderExceptionBoundary>
  );
};

interface WidgetHostBaseProps<TWidget extends WidgetConstructor> {
  readonly runtimeKey?: string;
  readonly token: TWidget;
}

type WidgetHostWidgetProps<TProps extends object> = keyof TProps extends never
  ? {
      readonly props?: TProps;
    }
  : {
      readonly props: TProps;
    };

interface WidgetRuntimeEntry<TProps extends object> {
  readonly runtime: WidgetRuntime<TProps>;
}

interface WidgetContentOptions {
  readonly error: unknown | null;
  readonly exception: React.ReactNode;
  readonly fallback: React.ReactNode;
  readonly view: React.ReactNode;
}

const createWidgetHostProps = <TProps extends object>(props: TProps | undefined): TProps => {
  return props ?? ({} as TProps);
};

const resolveWidgetContent = (phase: WidgetRuntimePhase, options: WidgetContentOptions): React.ReactNode => {
  if (phase === 'failed') {
    return renderWidgetException(options.exception, options.error);
  }

  if (phase !== 'ready') {
    return options.fallback;
  }

  return options.view;
};

const renderWidgetException = (exception: React.ReactNode, error: unknown): React.ReactNode => {
  return <ExceptionProvider error={error}>{exception ?? null}</ExceptionProvider>;
};
