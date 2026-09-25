import React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { Feature, type ApplicationFeatureInterface } from '../../../../shared/application/feature/application-feature';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { Router } from '../../../router/declaration/router';
import { Route } from '../../../router/declaration/route';
import { segments } from '../../../../core/router/declaration/address';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';
import { Application } from './application';

class Service {
  readonly value = 'configured';
}

class Bindings {
  register(registry: BindingRegistryInterface): void {
    registry.bind(Service).toConstantValue(new Service());
  }
}

const Context = React.createContext('missing');
const Wrapper: React.FC<React.PropsWithChildren> = (props) => (
  <Context.Provider value={useDependency(Service).value}>{props.children}</Context.Provider>
);
const Splash: React.FC = () => <span>{React.useContext(Context)}</span>;

@UseBindings(Bindings)
@Feature({ wrapper: Wrapper })
class TestFeature implements ApplicationFeatureInterface {}

class App extends Application {
  protected configure(app: ApplicationConfiguratorInterface): void {
    app.features([TestFeature]);
    app.components({ splash: <Splash /> });
    app.router(
      new Router({ routes: [new Route({ token: Service, address: segments('test'), load: async () => ({}) })] }),
    );
  }
}

it('passes configured features and activated bindings to the initial application view', async () => {
  const app = new App({
    routerBridge: {
      runtimeRetention: 'release',
      initialize: vi.fn(),
      commit: vi.fn(),
      dispose: vi.fn(),
      back: vi.fn(),
    },
  });
  app.compose();
  const View = app.createView();
  const root = render(<View />);
  try {
    expect(screen.getByText('configured')).toBeInTheDocument();
  } finally {
    root.unmount();
    await app.dispose();
  }
});
