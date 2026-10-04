import React from 'react';

import { segments } from '../core/index.ts';
import {
  Application,
  Command,
  Commands,
  CommandsServiceInterface,
  type CommandHandler,
  type ApplicationConfiguratorInterface,
  type ApplicationOptions,
  Module,
  Layout,
  type LayoutViewProps,
  renderLayouts,
  Widget,
  WidgetDefinition,
  WidgetHost,
  useWidgetProps,
  WidgetPreloaderInterface,
  type WidgetProps,
  type WidgetPreloadOptions,
  Route,
  Router,
  State,
  ScreenServiceInterface,
  SnapshotServiceInterface,
  FsmSnapshotSourceInterface,
  type FsmSnapshotSourceListener,
  type FsmSnapshotSourceSubscription,
  createFsmRouterBridge,
} from '../fsm/index.ts';

interface FixtureSnapshot {
  readonly screen: string;
}

class InheritedSnapshotSource extends FsmSnapshotSourceInterface<FixtureSnapshot> {
  subscribe(_listener: FsmSnapshotSourceListener<FixtureSnapshot>): FsmSnapshotSourceSubscription {
    return { dispose: async () => undefined };
  }
}

class StructuralSnapshotSource implements FsmSnapshotSourceInterface<FixtureSnapshot> {
  subscribe(_listener: FsmSnapshotSourceListener<FixtureSnapshot>): FsmSnapshotSourceSubscription {
    return { dispose: async () => undefined };
  }
}

createFsmRouterBridge({ routingKey: 'screen', source: new InheritedSnapshotSource() });
createFsmRouterBridge({ routingKey: 'screen', source: new StructuralSnapshotSource() });

class InitialScreenRoute {}

class ScreenState {
  readonly enabled: boolean;
}

class CompleteCommand {}

class ScreenCommands {
  @Command(CompleteCommand)
  readonly complete: CommandHandler<CompleteCommand>;
}

class StatefulScreenRoute {
  @State(ScreenState)
  readonly state: ScreenState;

  @Commands(ScreenCommands)
  readonly commands: ScreenCommands;
}

const InitialScreenView: React.FC = () => <main>FSM application</main>;

@Module({ view: InitialScreenView })
class InitialScreenModule {}

interface CounterProps {
  readonly count: number;
}
const CounterView: React.FC = () => <span>{useWidgetProps<CounterProps>().count}</span>;
@Widget<CounterProps>({ view: CounterView })
class Counter extends WidgetDefinition<CounterProps> {}
@Widget({ view: InitialScreenView })
class EmptyWidget extends WidgetDefinition {}
const widgetProps: WidgetProps<typeof Counter> = { count: 1 };
const preloadOptions: WidgetPreloadOptions<typeof Counter> = { props: widgetProps };
void preloadOptions;
void WidgetPreloaderInterface;
<WidgetHost token={Counter} props={widgetProps} />;
<WidgetHost token={EmptyWidget} />;
// @ts-expect-error Required widget props cannot be omitted.
<WidgetHost token={Counter} />;
// @ts-expect-error The widget token determines its props.
<WidgetHost token={Counter} props={{ count: 'wrong' }} />;

const ShellView: React.FC<LayoutViewProps> = (props) => <main>{props.children}</main>;

@Layout({ view: ShellView })
class ShellLayout {}

const shell: React.ReactNode = renderLayouts([ShellLayout], <InitialScreenView />);
void shell;
// @ts-expect-error Layout composition accepts class tokens, not React components.
renderLayouts([ShellView], <InitialScreenView />);

// FSM state and commands are not parameters of the screen address.
new Route({
  token: StatefulScreenRoute,
  address: segments('stateful'),
  load: async () => ({ InitialScreenModule }),
});

declare const screenService: ScreenServiceInterface;
declare const snapshotService: SnapshotServiceInterface;
declare const commandsService: CommandsServiceInterface;
const applicationCommands = commandsService.get(ScreenCommands);
void applicationCommands?.complete();
// @ts-expect-error Application commands are restricted to their class token.
void applicationCommands?.abort();
class CommonUi {
  readonly language: string;
}
const ui: CommonUi | null = snapshotService.get(CommonUi);
void ui;
// @ts-expect-error The snapshot token determines the result shape.
void snapshotService.get(CommonUi)?.missing;
// @ts-expect-error Snapshot access uses a class, not a string path.
snapshotService.get('ui');
const unsubscribe: () => void = snapshotService.subscribe(CommonUi, (value) => {
  const language: string | undefined = value?.language;
  void language;
  // @ts-expect-error The subscription token determines the callback value shape.
  void value?.missing;
});
unsubscribe();
// @ts-expect-error Subscriptions use a class token, not a string path.
snapshotService.subscribe('ui', () => undefined);
const context = screenService.get(StatefulScreenRoute);
const state: Promise<ScreenState> = context.state;
void state;
void context.commands.complete();

// @ts-expect-error Commands are restricted to those declared by the token.
void context.commands.abort();

// @ts-expect-error A command without payload accepts no arguments.
void context.commands.complete({ unexpected: true });

const router = new Router({
  routes: [
    new Route({
      address: segments('initial'),
      load: async () => ({ InitialScreenModule }),
      token: InitialScreenRoute,
    }),
  ],
});

class FixtureApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({
      splash: <div>Starting</div>,
    });
    // @ts-expect-error FSM keeps the current screen until the next route is ready.
    app.components({ fallback: <div>Loading</div> });
    app.router(router);
  }
}

declare const routerBridge: ApplicationOptions['routerBridge'];

const application = new FixtureApplication({ routerBridge });

void application;

// @ts-expect-error FSM routers do not configure loading presentations.
new Router({ routes: [], fallback: <div>Loading</div> });
// @ts-expect-error FSM routes do not configure loading presentations.
new Route({ address: segments('initial'), fallback: <div>Loading</div> });
// @ts-expect-error FSM modules are prepared before rendering.
Module({ view: InitialScreenView, fallback: <div>Loading</div> });
// @ts-expect-error FSM widgets do not configure loading presentations.
Widget({ view: InitialScreenView, fallback: <div>Loading</div> });

// @ts-expect-error FSM Route не принимает browser route policies.
new Route({ canMatch: [], load: async () => ({ InitialScreenModule }) });

// @ts-expect-error FSM Router не принимает browser router policies.
new Router({ canActivate: [], routes: [new Route({ load: async () => ({ InitialScreenModule }) })] });

// @ts-expect-error FSM Router facade не экспортирует redirect API browser router.
Router.redirectTo(InitialScreenRoute);

// @ts-expect-error FSM facade не экспортирует authorization presentation.
new Router({ forbidden: <div>Forbidden</div>, routes: [new Route({ load: async () => ({ InitialScreenModule }) })] });
