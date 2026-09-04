import React from 'react';

import {
  Application,
  type ApplicationConfiguratorInterface,
  Layout,
  type LayoutViewProps,
  Module,
  NavigationBlockerFeature,
  NavigationBlockerPresentation,
  NotificationFeature,
  NotificationPresentation,
  Route,
  Router,
  Shell,
  ShellScrollView,
  type ShellContextInterface,
  ShellInterface,
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
  <ShellScrollView>{props.children}</ShellScrollView>
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
