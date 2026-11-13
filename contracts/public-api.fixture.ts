import type * as Core from '../core';
import type * as React from '../react';
import type * as Native from '../native';
import type * as Fsm from '../fsm';

type Assert<TValue extends true> = TValue;
type HasNoMembers<TValue, TKeys extends PropertyKey> = Extract<keyof TValue, TKeys> extends never ? true : false;

export type CoreRuntimeBoundary = Assert<
  HasNoMembers<
    typeof Core,
    'WidgetRuntime' | 'configureWidgetRuntimeDefinition' | 'getWidgetRuntimeDefinition' | 'isWidgetConstructor'
  >
>;

export type CoreInternalTypes = [
  // @ts-expect-error Widget lifecycle belongs to the internal runtime.
  Core.WidgetRuntime,
  // @ts-expect-error Runtime registration is not application configuration.
  Core.ConfigureWidgetRuntimeDefinitionOptions,
  // @ts-expect-error The renderer owns the runtime definition.
  Core.WidgetRuntimeDefinition,
  // @ts-expect-error Widget actions are exposed through controller hooks.
  Core.WidgetRuntimeActionOptions,
  // @ts-expect-error Widget action state is owned by the runtime.
  Core.WidgetRuntimeActionState,
  // @ts-expect-error Widget loads are owned by the host and preloader.
  Core.WidgetRuntimeLoadOptions,
  // @ts-expect-error Widget revalidation uses the public revalidation service.
  Core.WidgetRuntimeRevalidateOptions,
  // @ts-expect-error Revalidation state is read through the public hook.
  Core.WidgetRuntimeRevalidateState,
  // @ts-expect-error Widget machine snapshots are internal.
  Core.WidgetRuntimeSnapshot,
  // @ts-expect-error Entity registry metadata is internal.
  Core.EntityMetadata,
  // @ts-expect-error Query registry metadata is internal.
  Core.QueryMetadata,
];

export type NativeRuntimeBoundary = Assert<
  HasNoMembers<typeof Native, 'NativeRouterBridge' | 'ScreenRenderer' | 'resolveNativeRouterBridge'>
>;

export type NativeBridgeBoundary = Assert<
  HasNoMembers<
    Native.NativeRouterBridge,
    | 'initialize'
    | 'commit'
    | 'dispose'
    | 'registerDriver'
    | 'getSnapshot'
    | 'getPresentedNavigation'
    | 'getPendingPresentationRevision'
    | 'completePresentation'
  >
>;

export type NativeBridgeFactory = Assert<
  ReturnType<typeof Native.createNativeRouterBridge> extends Native.ApplicationOptions['routerBridge'] ? true : false
>;

export type NativeBridgeFactoryBoundary = Assert<
  HasNoMembers<
    ReturnType<typeof Native.createNativeRouterBridge>,
    'initialize' | 'commit' | 'registerDriver' | 'completePresentation'
  >
>;

export type NativeBridgeInput = Assert<
  HasNoMembers<Native.ApplicationOptions['routerBridge'], 'registerDriver' | 'completePresentation'>
>;

export type NativeInternalTypes = [
  // @ts-expect-error Driver registration belongs to the native host.
  Native.NativeNavigationDriver,
  // @ts-expect-error Physical navigation entries are internal.
  Native.NativeNavigationEntry,
  // @ts-expect-error Physical navigation snapshots are internal.
  Native.NativeNavigationSnapshot,
  // @ts-expect-error The renderer receives an internal screen runtime.
  Native.ScreenRendererProps,
  // @ts-expect-error Physical screen projection is internal.
  Native.ScreenPresentation,
  // @ts-expect-error Physical screen transitions are internal.
  Native.ScreenTransition,
  // @ts-expect-error Physical screen operations are internal.
  Native.ScreenTransitionOperation,
  // @ts-expect-error Applications configure ApplicationRouting, not its resolved form.
  Native.ResolvedApplicationRouting,
];

export type ReactInternalTypes = [
  // @ts-expect-error Resolved routing is an internal configuration result.
  React.ResolvedApplicationRouting,
];

export type FsmRuntimeBoundary = Assert<HasNoMembers<typeof Fsm, 'renderLayouts'>>;
