import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Feature, type ApplicationFeatureInterface } from '../../../../shared/application/feature/application-feature';
import { Controller } from '../../../../core/controller/contract/controller';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { useLoaderData } from '../../../controller/hook/use-loader-data';
import { Router } from '../../../router/declaration/router';
import { Route } from '../../../router/declaration/route';
import { segments } from '../../../../core/router/declaration/address';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from './application';

const deferred = () => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

const fixture = (load: () => Promise<void>, connect: () => Promise<void> = async () => undefined) => {
  const disposed = vi.fn();
  const activated = vi.fn();
  const loader = vi.fn(async () => {
    await load();
    return 'feature-ready';
  });
  @Controller()
  class Data {
    loader = loader;
    dispose = disposed;
  }
  class Bindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(Data).toSelf().inSingletonScope();
    }
  }
  const Context = React.createContext('feature-pending');
  const Wrapper: React.FC<React.PropsWithChildren> = (props) => (
    <Context.Provider value={useLoaderData(Data)}>{props.children}</Context.Provider>
  );
  const Splash: React.FC = () => <span>{React.useContext(Context)}</span>;
  @UseBindings(Bindings)
  @Feature({ wrapper: Wrapper })
  class TestFeature implements ApplicationFeatureInterface {
    initialize(): void {
      activated();
    }
  }
  class App extends Application {
    get features() {
      return this.getFeaturesRuntime();
    }
    protected configure(app: ApplicationConfiguratorInterface): void {
      app.features([TestFeature]);
      app.components({ splash: <Splash />, failed: <span>failed</span> });
      app.router(
        new Router({ routes: [new Route({ token: Data, address: segments('test'), load: async () => ({}) })] }),
      );
    }
  }
  const initialize = vi.fn(connect);
  const app = new App({
    routerBridge: { runtimeRetention: 'release', initialize, commit: vi.fn(), dispose: vi.fn(), back: vi.fn() },
  });
  app.compose();
  return { app, initialize, disposed, activated, loader };
};

describe('application-owned feature startup', () => {
  it('cannot overwrite a fatal feature failure with ready while the router is still starting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const connection = deferred();
    const f = fixture(
      async () => undefined,
      () => connection.promise,
    );
    const error = new Error('feature runtime failed');
    const startup = f.app.initialize();
    try {
      await vi.waitFor(() => expect(f.initialize).toHaveBeenCalled());
      await f.app.features.failRender(error);
      expect(f.app.lifecycle.phase).toBe('failed');
      const rejected = expect(startup).rejects.toBe(error);
      connection.resolve();
      await rejected;
      expect(f.app.lifecycle.phase).toBe('failed');
    } finally {
      await f.app.dispose();
      vi.restoreAllMocks();
    }
  });
  it('awaits feature preparation before the router, then keeps the prepared wrapper around router splash', async () => {
    const load = deferred();
    const connection = deferred();
    const f = fixture(
      () => load.promise,
      () => connection.promise,
    );
    const View = f.app.createView();
    const root = render(<View />);
    let startup: Promise<void>;
    act(() => {
      startup = f.app.initialize();
    });
    try {
      expect(screen.getByText('feature-pending')).toBeInTheDocument();
      expect(f.initialize).not.toHaveBeenCalled();
      await act(async () => {
        load.resolve();
      });
      await waitFor(() => expect(screen.getByText('feature-ready')).toBeInTheDocument());
      expect(f.app.lifecycle.phase).toBe('initializing');
      expect(f.activated).toHaveBeenCalledTimes(1);
      expect(f.initialize).toHaveBeenCalledTimes(1);
      await act(async () => {
        connection.resolve();
        await startup;
      });
      expect(f.app.lifecycle.phase).toBe('ready');
      await f.app.initialize();
      expect(f.loader).toHaveBeenCalledTimes(1);
    } finally {
      root.unmount();
      await f.app.dispose();
    }
    expect(f.disposed).toHaveBeenCalledTimes(1);
  });

  it('fails the application on a feature loader error without connecting the router', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new Error('feature failed');
    const f = fixture(async () => {
      throw error;
    });
    try {
      await expect(f.app.initialize()).rejects.toBe(error);
      expect(f.app.lifecycle.phase).toBe('failed');
      expect(f.initialize).not.toHaveBeenCalled();
      expect(f.disposed).toHaveBeenCalledTimes(1);
    } finally {
      await f.app.dispose();
      vi.restoreAllMocks();
    }
  });

  it('cannot become ready when disposed during feature preparation', async () => {
    const gate = deferred();
    const f = fixture(() => gate.promise);
    const startup = f.app.initialize();
    await vi.waitFor(() => expect(f.loader).toHaveBeenCalled());
    const disposal = f.app.dispose();
    gate.resolve();
    await Promise.all([startup, disposal]);
    expect(f.app.lifecycle.phase).toBe('disposed');
    expect(f.initialize).not.toHaveBeenCalled();
    expect(f.disposed).toHaveBeenCalledTimes(1);
  });
});
