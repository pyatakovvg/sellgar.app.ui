import React from 'react';

import {
  WidgetRuntimeRegistry,
  type WidgetRuntimeLease,
} from '../../../../core/widget/runtime/widget-runtime-registry';
import { useApplicationComponents } from '../../../application/rendering/application-components-context';
import { useDependency, useRuntimeScope } from '../../../runtime/scope/runtime-scope-context';
import { useScreenPresentation } from '../../../screen/runtime/screen-presentation-context';
import { getWidgetMetadata, type WidgetConstructor, type WidgetProps } from '../../declaration/widget';
import { WidgetRuntimeHost } from './widget-runtime-host';

export type WidgetHostProps<TWidget extends WidgetConstructor> = WidgetHostBaseProps<TWidget> &
  WidgetHostWidgetProps<WidgetProps<TWidget>>;

export const WidgetHost = <TWidget extends WidgetConstructor>(props: WidgetHostProps<TWidget>): React.ReactElement => {
  const ownerScope = useRuntimeScope();
  const registry = useDependency(WidgetRuntimeRegistry);
  const presentation = useScreenPresentation();
  const applicationComponents = useApplicationComponents();
  const metadata = getWidgetMetadata(props.token);
  const widgetProps = createWidgetHostProps('props' in props ? props.props : undefined);
  const leaseRef = React.useRef<WidgetRuntimeLease<WidgetProps<TWidget>> | null>(null);
  const appliedPropsRef = React.useRef(widgetProps);
  const subscribe = React.useCallback(
    (listener: () => void) =>
      registry.subscribe({ ownerScope, runtimeKey: props.runtimeKey, token: props.token }, listener),
    [ownerScope, props.runtimeKey, props.token, registry],
  );
  const getRuntime = React.useCallback(
    () => registry.get({ ownerScope, runtimeKey: props.runtimeKey, token: props.token }),
    [ownerScope, props.runtimeKey, props.token, registry],
  );
  const runtime = React.useSyncExternalStore(subscribe, getRuntime, getRuntime);

  React.useLayoutEffect(() => {
    const lease = registry.attach({
      ownerScope,
      presentation: presentation ?? undefined,
      props: widgetProps,
      runtimeKey: props.runtimeKey,
      token: props.token,
    });
    leaseRef.current = lease;
    appliedPropsRef.current = widgetProps;

    return () => {
      if (leaseRef.current === lease) leaseRef.current = null;
      lease.release();
    };
  }, [ownerScope, presentation, props.runtimeKey, props.token, registry]);

  React.useEffect(() => {
    const lease = leaseRef.current;
    if (!lease || appliedPropsRef.current === widgetProps) return;

    appliedPropsRef.current = widgetProps;
    lease.updateProps(widgetProps);
  }, [widgetProps]);

  if (!runtime) {
    return <>{metadata.fallback ?? applicationComponents.fallback ?? null}</>;
  }

  return <WidgetRuntimeHost runtime={runtime} token={props.token} />;
};

interface WidgetHostBaseProps<TWidget extends WidgetConstructor> {
  readonly runtimeKey?: string;
  readonly token: TWidget;
}

type WidgetHostWidgetProps<TProps extends object> = object extends TProps
  ? { readonly props?: TProps }
  : { readonly props: TProps };

const createWidgetHostProps = <TProps extends object>(props: TProps | undefined): TProps => {
  return props ?? (EMPTY_WIDGET_PROPS as TProps);
};

const EMPTY_WIDGET_PROPS = Object.freeze({});
