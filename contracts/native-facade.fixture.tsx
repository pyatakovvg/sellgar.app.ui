import React from 'react';

import {
  Application,
  createNativeLinkingTransport,
  createNativeRouterBridge,
  type ApplicationConfiguratorInterface,
  Layout,
  type LayoutViewProps,
  type LayoutContentKind,
  Module,
  NavigationBlockerFeature,
  NavigationBlockerPresentation,
  NotificationFeature,
  NotificationPresentation,
  NativeLinkingTransport,
  type NativeRouterTransportInterface,
  type NativeRouterTransportListener,
  type NativeRouterTransportTarget,
  Route,
  Router,
  Shell,
  type ShellContextInterface,
  ShellInterface,
  Viewport,
  Widget,
  WidgetDefinition,
  WidgetHost,
  UserRequestFeature,
  UserRequestPresentation,
} from '@sellgar/app/native';

type ReactFacade = typeof import('@sellgar/app/react');
type NativeFacade = typeof import('@sellgar/app/native');
type MissingNativeFacadeExport = Exclude<keyof ReactFacade, keyof NativeFacade | 'createWebRouterBridge'>;
type AssertNever<TValue extends never> = TValue;
type NativeFacadeMustCoverReactFacade = AssertNever<MissingNativeFacadeExport>;

class FixtureRoute {}

@Layout({ view: ({ children }: LayoutViewProps) => <>{children}</> })
class FixtureLayout {}

@Module({ layouts: [FixtureLayout], view: () => <>module</> })
class FixtureModule {}

interface FixtureWidgetProps {
  readonly value: string;
}

@Widget<FixtureWidgetProps>({ view: ({ value }) => <>{value}</> })
class FixtureWidget extends WidgetDefinition<FixtureWidgetProps> {}

const FixtureShellView: React.FC<ShellContextInterface> = (props) => (
  <Viewport>
    <Viewport.Slot>{props.children}</Viewport.Slot>
  </Viewport>
);

@Shell({ view: FixtureShellView })
class FixtureShell extends ShellInterface {}

const notification = NotificationFeature.configure({
  presentation: NotificationPresentation.define((registry) => registry.info(() => null)),
});
const navigationBlocker = NavigationBlockerFeature.configure({
  presentation: NavigationBlockerPresentation.define(() => null),
});
const userRequest = UserRequestFeature.configure({
  presentation: UserRequestPresentation.define((registry) => {
    registry.alert(() => null);
    registry.confirm(() => null);
    registry.prompt(() => null);
  }),
});

const router = new Router({
  routes: [new Route({ load: async () => ({ FixtureModule }), token: FixtureRoute })],
  shell: FixtureShell,
});

class FixtureApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({ fallback: <>loading</> });
    app.features([navigationBlocker, notification, userRequest]);
    app.layouts([FixtureLayout]);
    app.router(router);
    app.routing({ fallback: <>loading nested route</> });
  }
}

const fixtureView = <WidgetHost props={{ value: 'fixture' }} token={FixtureWidget} />;

void FixtureApplication;
void fixtureView;
void (null as NativeFacadeMustCoverReactFacade | null);

const layoutKind: LayoutContentKind = null;
void layoutKind;

// A URL resolver has the same typed navigation builder as NavItem/NavLink.
const linkingTransport = createNativeLinkingTransport({
  resolve: (url) =>
    url.endsWith('/fixture')
      ? (navigate) => navigate.to(FixtureRoute, { state: { openedByLink: true }, replace: false })
      : null,
});
const linkingBridge = createNativeRouterBridge({ transport: linkingTransport });
const legacyTransport: NativeRouterTransportInterface = {
  getInitialLocation: async () => ({ address: [], nested: null, query: {}, state: undefined }),
  subscribe: (_listener: NativeRouterTransportListener) => () => undefined,
};
const legacyBridge = createNativeRouterBridge({ transport: legacyTransport });
const defaultLinkingTransport: NativeRouterTransportInterface = createNativeLinkingTransport();
const addressLinkingTransport: NativeRouterTransportInterface = createNativeLinkingTransport({
  prefixes: ['fixture://'],
});
const constructedLinkingTransport = new NativeLinkingTransport({
  resolve: (_url) => (navigate) => {
    // @ts-expect-error A static target does not accept params; the resolver builder is fully typed.
    navigate.to(FixtureRoute, { params: { id: 'unexpected' } });
    return navigate.to(FixtureRoute);
  },
});
const defaultConstructedTransport: NativeRouterTransportInterface = new NativeLinkingTransport();
const addressConstructedTransport: NativeRouterTransportInterface = new NativeLinkingTransport({
  prefixes: ['fixture://'],
});
const requestTransport: NativeRouterTransportInterface<NativeRouterTransportTarget> = {
  getInitialLocation: async () => (navigate) => navigate.resetTo(FixtureRoute),
  subscribe: (listener) => {
    listener((navigate) => navigate.to(FixtureRoute));
    return () => undefined;
  },
};
void linkingBridge;
void legacyBridge;
void requestTransport;
void defaultLinkingTransport;
void addressLinkingTransport;
void constructedLinkingTransport;
void defaultConstructedTransport;
void addressConstructedTransport;
