import React from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import type { WidgetRuntime } from '../../../../../core/widget/runtime/widget-runtime';
import { useApplicationComponents } from '../../../../application/rendering/application-components-context';
import { ControllerRuntimeProvider } from '../../../../controller/runtime/controller-runtime-context';
import { ExceptionProvider } from '../../../../runtime/exception/exception-context';
import { RuntimeScopeProvider } from '../../../../runtime/scope/runtime-scope-context';
import { renderView } from '../../../../view/renderable-view';
import { getWidgetMetadata, type WidgetConstructor } from '../../../declaration/widget';
import { WidgetRuntimeProvider } from '../../../runtime/widget-runtime-context';

interface IProps<TProps extends object> {
  readonly runtime: WidgetRuntime<TProps>;
  readonly token: WidgetConstructor<TProps>;
}

export const WidgetRuntimeHost = <TProps extends object>(props: IProps<TProps>): React.ReactElement => {
  const applicationComponents = useApplicationComponents();
  const metadata = getWidgetMetadata(props.token);
  const snapshot = React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
    React.useCallback(() => props.runtime.getSnapshot(), [props.runtime]),
  );

  React.useSyncExternalStore(
    React.useCallback((listener) => props.runtime.subscribe(listener), [props.runtime]),
    React.useCallback(() => props.runtime.getPropsRevision(), [props.runtime]),
    React.useCallback(() => props.runtime.getPropsRevision(), [props.runtime]),
  );

  React.useEffect(() => {
    if (snapshot.phase === 'idle') {
      void props.runtime.load().catch(() => undefined);
    }
  }, [props.runtime, snapshot.phase]);

  if (snapshot.phase === 'failed') {
    return (
      <ExceptionProvider error={snapshot.error}>
        {metadata.exception ?? applicationComponents.exception ?? null}
      </ExceptionProvider>
    );
  }

  if (snapshot.phase !== 'ready') {
    return <>{metadata.fallback ?? applicationComponents.fallback ?? null}</>;
  }

  return (
    <ErrorBoundary
      fallbackRender={({ error }) => (
        <ExceptionProvider error={error}>
          {metadata.exception ?? applicationComponents.exception ?? null}
        </ExceptionProvider>
      )}
      onError={(error) => void props.runtime.failRender(error)}
      resetKeys={[props.runtime]}
    >
      <RuntimeScopeProvider scope={props.runtime.getScope()}>
        <ControllerRuntimeProvider value={props.runtime}>
          <WidgetRuntimeProvider runtime={props.runtime}>
            {renderView(metadata.view, props.runtime.getProps())}
          </WidgetRuntimeProvider>
        </ControllerRuntimeProvider>
      </RuntimeScopeProvider>
    </ErrorBoundary>
  );
};
