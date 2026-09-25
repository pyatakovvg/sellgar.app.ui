import type { RuntimeScope } from '../../../runtime/scope/base/runtime-scope';
import { WidgetScope } from '../../../runtime/scope/kind/widget-scope';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import type { WidgetRuntimeDefinition } from '../../declaration/widget';
import { createRuntimeInstanceId } from '../../../runtime/failure/runtime-failure';
import { ControllerOwnerRuntime } from '../../../runtime/controller/controller-owner-runtime';

export class WidgetRuntime<TProps extends object = Record<string, never>> extends ControllerOwnerRuntime<TProps> {
  constructor(
    private readonly widgetParent: RuntimeScope,
    private readonly widgetDefinition: WidgetRuntimeDefinition<TProps>,
    props: TProps,
  ) {
    super(
      widgetParent,
      widgetDefinition,
      props,
      {
        instanceId: createRuntimeInstanceId('widget'),
        kind: 'widget',
        token: widgetDefinition.token,
      },
      'widget.failed',
    );
  }

  protected createScope(registerBindings: (registry: BindingRegistryInterface) => void): WidgetScope {
    return new WidgetScope(this.widgetParent, registerBindings);
  }

  protected activateScope(scope: RuntimeScope): void {
    scope.activate(this.widgetDefinition.token, { collectControllerBindings: true });
    for (const owner of this.widgetDefinition.bindingOwners) scope.activate(owner);
  }
}

export type {
  ActiveControllerOwnerRuntime as ActiveWidgetRuntime,
  ControllerOwnerRuntimeActionOptions as WidgetRuntimeActionOptions,
  ControllerOwnerRuntimeActionState as WidgetRuntimeActionState,
  ControllerOwnerRuntimeLoadOptions as WidgetRuntimeLoadOptions,
  ControllerOwnerRuntimeRevalidateOptions as WidgetRuntimeRevalidateOptions,
  ControllerOwnerRuntimeRevalidateState as WidgetRuntimeRevalidateState,
  ControllerOwnerRuntimeSnapshot as WidgetRuntimeSnapshot,
} from '../../../runtime/controller/controller-owner-runtime';
