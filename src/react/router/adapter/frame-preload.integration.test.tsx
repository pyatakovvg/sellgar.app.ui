import 'reflect-metadata';

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApplicationConfiguratorInterface } from '../../../application/config/application-configurator';
import { Application } from '../../../application/lifecycle/application';
import { BindingModuleInterface } from '../../../di/binding/binding-module';
import type { BindingRegistryInterface } from '../../../di/binding/binding-registry';
import { UseBindings } from '../../../di/composition/use-bindings';
import { Controller } from '../../../controller/contract/controller';
import {
  Frame,
  FrameShell,
  FrameShellInterface,
  type FrameShellContextInterface,
} from '../../../frame/declaration/frame';
import { FrameRoute, FrameRouter } from '../../../frame/router/declaration';
import { Module } from '../../../module/declaration/module';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';

describe('initial frame preload', () => {
  let application: TestApplication | null = null;

  beforeEach(() => {
    TestRuntime.reset();
    globalThis.history.replaceState(null, '', '/employees#employees/28');
  });

  afterEach(async () => {
    await application?.dispose();
    application = null;
    globalThis.history.replaceState(null, '', '/');
  });

  it('loads module and frame controller chains in parallel behind the application splash', async () => {
    application = new TestApplication();
    application.compose();
    await application.initialize();
    const View = application.createView();

    render(<View />);

    await waitFor(() => {
      expect(TestRuntime.moduleLoader).toHaveBeenCalledOnce();
      expect(TestRuntime.frameLoader).toHaveBeenCalledOnce();
    });

    expect(screen.getByText('Application splash')).toBeInTheDocument();
    expect(screen.queryByText('Module view')).not.toBeInTheDocument();
    expect(screen.queryByText('Frame view')).not.toBeInTheDocument();

    await act(async () => TestRuntime.moduleDeferred.resolve());

    expect(screen.getByText('Application splash')).toBeInTheDocument();
    expect(screen.queryByText('Module view')).not.toBeInTheDocument();

    await act(async () => TestRuntime.frameDeferred.resolve());

    expect(await screen.findByText('Module view')).toBeInTheDocument();
    expect(await screen.findByText('Frame view')).toBeInTheDocument();
  });
});

abstract class TestModuleControllerInterface {
  abstract loader(): Promise<void>;
}

@Controller()
class TestModuleController implements TestModuleControllerInterface {
  loader(): Promise<void> {
    return TestRuntime.moduleLoader();
  }
}

class TestModuleBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestModuleControllerInterface).to(TestModuleController);
  }
}

@UseBindings(TestModuleBindings)
@Module({ view: () => <div>Module view</div> })
class TestModule {}

abstract class TestFrameControllerInterface {
  abstract loader(): Promise<void>;
}

@Controller()
class TestFrameController implements TestFrameControllerInterface {
  loader(): Promise<void> {
    return TestRuntime.frameLoader();
  }
}

class TestFrameBindings implements BindingModuleInterface {
  register(registry: BindingRegistryInterface): void {
    registry.bind(TestFrameControllerInterface).to(TestFrameController);
  }
}

@UseBindings(TestFrameBindings)
@Frame({ view: () => <div>Frame view</div> })
class TestFrame {}

@FrameShell()
class TestFrameShell implements FrameShellInterface {
  render({ content }: FrameShellContextInterface): React.ReactNode {
    return <div>{content}</div>;
  }
}

class TestApplication extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({
      exception: <div>Application exception</div>,
      fallback: <div>Application fallback</div>,
      forbidden: <div>Application forbidden</div>,
      notFound: <div>Application not found</div>,
      splash: <div>Application splash</div>,
    });
    app.frames({ shell: TestFrameShell });
    app.router(
      new Router({
        routes: [
          new Route({
            path: '/employees',
            routes: [
              new Route({
                frames: [
                  new FrameRouter({
                    baseSource: 'employees/:id',
                    routes: [new FrameRoute({ load: async () => ({ TestFrame }) })],
                  }),
                ],
                load: async () => ({ TestModule }),
              }),
            ],
          }),
        ],
      }),
    );
  }
}

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
}

const createDeferred = (): Deferred => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolver) => {
    resolve = resolver;
  });

  return { promise, resolve };
};

class TestRuntime {
  static moduleDeferred = createDeferred();
  static frameDeferred = createDeferred();
  static moduleLoader = vi.fn(() => TestRuntime.moduleDeferred.promise);
  static frameLoader = vi.fn(() => TestRuntime.frameDeferred.promise);

  static reset(): void {
    TestRuntime.moduleDeferred = createDeferred();
    TestRuntime.frameDeferred = createDeferred();
    TestRuntime.moduleLoader = vi.fn(() => TestRuntime.moduleDeferred.promise);
    TestRuntime.frameLoader = vi.fn(() => TestRuntime.frameDeferred.promise);
  }
}
