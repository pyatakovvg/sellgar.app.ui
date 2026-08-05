import 'reflect-metadata';

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ApplicationComponentsProvider } from '../../../application/react/application-components-context';
import { Controller } from '../../../controller/contract/controller';

import { BindingModuleInterface } from '../../../di/binding/binding-module';
import { UseBindings } from '../../../di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { useException } from '../../../react/router/exception';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeFailureReporterInterface } from '../../../runtime/failure';
import { RuntimeScopeProvider } from '../../../runtime/react';

import { Widget, WidgetDefinition } from '../../declaration/widget';
import { WidgetControllerInterface } from '../../runtime/widget-controller';
import { WidgetRuntimeFactoryBindings, WidgetRuntimeFactoryInterface } from '../../runtime/widget-runtime-factory';
import type { WidgetControllerLoaderArgs } from '../../runtime/widget-controller';
import { useLoaderData } from '../../../controller/react/use-controller-loader-data';
import { useWidgetProps } from '../use-widget-props';

import { WidgetHost } from './';

describe('WidgetHost', () => {
  it('keeps widget props typed from token', () => {
    expect(createTypedWidgetHostFixture()).toBeDefined();
  });

  it('renders widget token and forwards props', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <RuntimeScopeProvider scope={scope}>
        <WidgetHost token={TestWidget} props={{ value: 'loaded' }} />
      </RuntimeScopeProvider>,
    );

    expect(screen.getByText('Loading widget')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Widget loaded: loaded')).toBeInTheDocument();
    });
  });

  it('renders application fallback when widget fallback is not configured', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <ApplicationComponentsProvider components={{ fallback: <div>Application loading</div> }}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={TestWidgetWithoutFallback} props={{ value: 'app-fallback' }} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>,
    );

    expect(screen.getByText('Application loading')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Widget app-fallback: app-fallback')).toBeInTheDocument();
    });
  });

  it('prefers widget fallback over application fallback', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <ApplicationComponentsProvider components={{ fallback: <div>Application loading</div> }}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={TestWidget} props={{ value: 'widget-fallback' }} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>,
    );

    expect(screen.getByText('Loading widget')).toBeInTheDocument();
    expect(screen.queryByText('Application loading')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Widget widget-fallback: widget-fallback')).toBeInTheDocument();
    });
  });

  it('reuses application exception inside widget host without replacing application content', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <ApplicationComponentsProvider components={{ exception: <div>Application exception</div> }}>
        <RuntimeScopeProvider scope={scope}>
          <div>Application content remains active</div>
          <WidgetHost token={TestFailedWidgetWithoutException} props={{ value: 'failed' }} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Application exception')).toBeInTheDocument();
    });
    expect(screen.getByText('Application content remains active')).toBeInTheDocument();
  });

  it('prefers widget exception over application exception', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <ApplicationComponentsProvider components={{ exception: <div>Application exception</div> }}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={TestFailedWidget} props={{ value: 'failed' }} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Widget exception')).toBeInTheDocument();
    });
    expect(screen.queryByText('Application exception')).not.toBeInTheDocument();
  });

  it('provides widget loader error to exception view', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <RuntimeScopeProvider scope={scope}>
        <WidgetHost token={TestFailedWidgetWithExceptionContext} props={{ value: 'failed' }} />
      </RuntimeScopeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Widget error: Widget loader failed.')).toBeInTheDocument();
    });
  });

  it('contains React render errors inside the widget and reports their owner', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);
    const reportFailure = vi.spyOn(scope.get(RuntimeFailureReporterInterface), 'report').mockResolvedValue();

    render(
      <RuntimeScopeProvider scope={scope}>
        <div>Application content remains active</div>
        <WidgetHost token={TestRenderFailedWidget} props={{ value: 'render-failed' }} />
      </RuntimeScopeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Widget error: Widget render failed.')).toBeInTheDocument();
    });
    expect(screen.getByText('Application content remains active')).toBeInTheDocument();
    expect(reportFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        disposition: 'widget.failed',
        failure: expect.objectContaining({
          cause: expect.objectContaining({ message: 'Widget render failed.' }),
          source: expect.objectContaining({
            operation: 'render',
            owner: expect.objectContaining({
              kind: 'widget',
              token: TestRenderFailedWidget,
            }),
            participant: { kind: 'runtime' },
          }),
        }),
        ownerState: 'failed',
      }),
    );
  });

  it('keeps the runtime alive during React StrictMode effect replay', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    render(
      <React.StrictMode>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={TestWidget} props={{ value: 'strict' }} />
        </RuntimeScopeProvider>
      </React.StrictMode>,
    );

    await waitFor(() => {
      expect(screen.getByText('Widget strict: strict')).toBeInTheDocument();
    });
  });

  it('consumes prepared widget runtime and owns its disposal', async () => {
    const scope = new ApplicationScope();

    scope.activate(TestApplicationOwner);

    const widgetRuntimeFactory = scope.get(WidgetRuntimeFactoryInterface);
    const preparedRuntime = widgetRuntimeFactory.prepare(TestWidget, {
      ownerScope: scope,
      props: {
        value: 'prepared',
      },
    });

    await preparedRuntime.load();

    const { unmount } = render(
      <RuntimeScopeProvider scope={scope}>
        <WidgetHost token={TestWidget} props={{ value: 'prepared' }} />
      </RuntimeScopeProvider>,
    );

    expect(screen.getByText('Widget prepared: prepared')).toBeInTheDocument();
    expect(
      widgetRuntimeFactory.getPrepared(TestWidget, {
        ownerScope: scope,
      }),
    ).toBeNull();

    unmount();

    await waitFor(() => {
      expect(preparedRuntime.getSnapshot().phase).toBe('disposed');
    });

    const releasedRuntime = widgetRuntimeFactory.releasePrepared(TestWidget, {
      ownerScope: scope,
    });

    expect(releasedRuntime).toBeNull();
  });
});

const createTypedWidgetHostFixture = (): React.ReactElement => {
  const valid = <WidgetHost token={TestWidget} props={{ value: 'typed' }} />;
  // @ts-expect-error WidgetHost props are inferred from widget token.
  const invalid = <WidgetHost token={TestWidget} props={{ missing: 'typed' }} />;

  void invalid;

  return valid;
};

interface TestWidgetProps {
  readonly value: string;
}

@Controller()
class TestWidgetController extends WidgetControllerInterface<TestWidgetProps> {
  async loader(args: WidgetControllerLoaderArgs<TestWidgetProps>): Promise<string> {
    return args.props.value;
  }
}

const TestWidgetView: React.FC = () => {
  const props = useWidgetProps<TestWidgetProps>();
  const value = useLoaderData(TestWidgetController);

  return <div>{`Widget ${props.value}: ${value}`}</div>;
};

class TestWidgetBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestWidgetController).toSelf().inSingletonScope();
  }
}

@UseBindings(TestWidgetBindings)
@Widget({
  fallback: <div>Loading widget</div>,
  view: TestWidgetView,
})
class TestWidget extends WidgetDefinition<TestWidgetProps> {}

@UseBindings(TestWidgetBindings)
@Widget({
  view: TestWidgetView,
})
class TestWidgetWithoutFallback extends WidgetDefinition<TestWidgetProps> {}

@Controller()
class TestFailedWidgetController extends WidgetControllerInterface<TestWidgetProps> {
  async loader(): Promise<string> {
    throw new Error('Widget loader failed.');
  }
}

class TestFailedWidgetBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestFailedWidgetController).toSelf().inSingletonScope();
  }
}

const TestFailedWidgetView: React.FC = () => {
  const value = useLoaderData(TestFailedWidgetController);

  return <div>{`Failed widget: ${value}`}</div>;
};

const TestWidgetException: React.FC = () => {
  const error = useException();

  return <div>{`Widget error: ${error instanceof Error ? error.message : 'unknown'}`}</div>;
};

@UseBindings(TestFailedWidgetBindings)
@Widget({
  exception: <div>Widget exception</div>,
  view: TestFailedWidgetView,
})
class TestFailedWidget extends WidgetDefinition<TestWidgetProps> {}

@UseBindings(TestFailedWidgetBindings)
@Widget({
  exception: <TestWidgetException />,
  view: TestFailedWidgetView,
})
class TestFailedWidgetWithExceptionContext extends WidgetDefinition<TestWidgetProps> {}

@UseBindings(TestFailedWidgetBindings)
@Widget({
  view: TestFailedWidgetView,
})
class TestFailedWidgetWithoutException extends WidgetDefinition<TestWidgetProps> {}

const TestRenderFailedWidgetView: React.FC = () => {
  throw new Error('Widget render failed.');
};

@Widget<TestWidgetProps>({
  exception: <TestWidgetException />,
  view: TestRenderFailedWidgetView,
})
class TestRenderFailedWidget extends WidgetDefinition<TestWidgetProps> {}

class TestApplicationBindings extends BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    new WidgetRuntimeFactoryBindings().register(registry);
  }
}

@UseBindings(TestApplicationBindings)
class TestApplicationOwner {}
