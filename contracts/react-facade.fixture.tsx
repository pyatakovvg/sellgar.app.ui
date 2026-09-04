import React from 'react';

import {
  Application,
  type ApplicationConfiguratorInterface,
  Layout,
  type LayoutViewProps,
  Module,
  NotificationFeature,
  NotificationPresentation,
  Route,
  Router,
  Shell,
  type ShellContextInterface,
  ShellInterface,
  Widget,
  WidgetDefinition,
  WidgetHost,
} from '@sellgar/app/react';

class FixtureRoute {}

@Layout({ view: ({ children }: LayoutViewProps) => <main>{children}</main> })
class FixtureLayout {}

@Module({ layouts: [FixtureLayout], view: () => <div>module</div> })
class FixtureModule {}

interface FixtureWidgetProps {
  readonly value: string;
}

@Widget<FixtureWidgetProps>({ view: ({ value }) => <div>{value}</div> })
class FixtureWidget extends WidgetDefinition<FixtureWidgetProps> {}

@Shell()
class FixtureShell extends ShellInterface {
  render(context: ShellContextInterface): React.ReactNode {
    return context.content;
  }
}

const notification = NotificationFeature.configure({
  presentation: NotificationPresentation.define((registry) => registry.info(() => null)),
});

const router = new Router({
  routes: [
    new Route({
      load: async () => ({ FixtureModule }),
      token: FixtureRoute,
    }),
  ],
});

class FixtureApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({ fallback: <div>loading</div> });
    app.features([notification]);
    app.layouts([FixtureLayout]);
    app.router(router);
    app.routing({ shell: FixtureShell });
  }
}

const fixtureView = <WidgetHost props={{ value: 'fixture' }} token={FixtureWidget} />;

void FixtureApplication;
void fixtureView;
