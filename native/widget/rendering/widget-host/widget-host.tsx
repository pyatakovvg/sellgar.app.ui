import React from 'react';

import {
  WidgetRuntimeRegistry,
  type WidgetRuntimeLease,
} from '../../../../core/widget/runtime/widget-runtime-registry';
import { useApplicationComponents } from '../../../application/rendering/application-components-context';
import { useDependency, useRuntimeScope } from '../../../runtime/scope/runtime-scope-context';
import { getWidgetMetadata, type WidgetConstructor, type WidgetProps } from '../../declaration/widget';
import { WidgetRuntimeHost } from './widget-runtime-host';

export type WidgetHostProps<TWidget extends WidgetConstructor> = WidgetHostBaseProps<TWidget> &
  WidgetHostWidgetProps<WidgetProps<TWidget>>;

export const WidgetHost = <TWidget extends WidgetConstructor>(props: WidgetHostProps<TWidget>): React.ReactElement => {
  const ownerScope = useRuntimeScope();
  const registry = useDependency(WidgetRuntimeRegistry);
  const applicationComponents = useApplicationComponents();
  const metadata = getWidgetMetadata(props.token);
  const widgetProps = createWidgetHostProps('props' in props ? props.props : undefined);
  const [binding, setBinding] = React.useState<WidgetRuntimeBinding<WidgetProps<TWidget>> | null>(null);
  const bindingMatches =
    binding?.ownerScope === ownerScope && binding.token === props.token && binding.runtimeKey === props.runtimeKey;
  const runtime = bindingMatches
    ? binding.lease.runtime
    : registry.get({
        ownerScope,
        runtimeKey: props.runtimeKey,
        token: props.token,
      });

  React.useEffect(() => {
    const lease = registry.acquire({
      ownerScope,
      props: widgetProps,
      runtimeKey: props.runtimeKey,
      token: props.token,
    });
    const nextBinding: WidgetRuntimeBinding<WidgetProps<TWidget>> = {
      lease,
      ownerScope,
      runtimeKey: props.runtimeKey,
      token: props.token,
    };

    setBinding(nextBinding);

    return () => lease.release();
  }, [ownerScope, props.runtimeKey, props.token, registry]);

  React.useEffect(() => {
    if (bindingMatches) {
      binding.lease.updateProps(widgetProps);
    }
  }, [binding, bindingMatches, widgetProps]);

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

interface WidgetRuntimeBinding<TProps extends object> {
  readonly lease: WidgetRuntimeLease<TProps>;
  readonly ownerScope: ReturnType<typeof useRuntimeScope>;
  readonly runtimeKey: string | undefined;
  readonly token: WidgetConstructor;
}

const createWidgetHostProps = <TProps extends object>(props: TProps | undefined): TProps => {
  return props ?? ({} as TProps);
};
