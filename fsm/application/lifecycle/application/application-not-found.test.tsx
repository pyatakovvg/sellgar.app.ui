import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { segments } from '../../../../core/router/declaration/address';
import { Module } from '../../../module/declaration/module';
import { createFsmRouterBridge } from '../../../router/bridge/fsm-router-bridge';
import { Route } from '../../../router/declaration/route';
import { Router } from '../../../router/declaration/router';
import type { FsmSnapshotSourceListener } from '../../../router/source/fsm-snapshot-source';
import type { ApplicationConfiguratorInterface } from '../../config/application-configurator';

import { Application } from './application.tsx';

class PhoneRoute {}

@Module({ view: () => <div>Phone screen</div> })
class PhoneModule {}

class TestApplication extends Application {
  readonly loadPhone = vi.fn(async () => ({ PhoneModule }));

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.components({
      splash: <div>Starting</div>,
      failed: <div>Application failed</div>,
      notFound: <div>Screen not found</div>,
    });
    app.router(
      new Router({
        routes: [
          new Route({
            address: segments('customer'),
            routes: [
              new Route({
                routes: [
                  new Route({
                    address: segments('sign-in'),
                    routes: [new Route({ token: PhoneRoute, address: segments('phone'), load: this.loadPhone })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    );
  }
}

describe('FSM application notFound', () => {
  it.each(['unknown', 'customer.unknown', 'customer.sign-in.unknown'])(
    'renders notFound for the first snapshot %s and accepts the next known screen',
    async (address) => {
      let publish: FsmSnapshotSourceListener<{ screen: string }> = () => {
        throw new Error('Snapshot source is not subscribed.');
      };
      const subscribe = vi.fn((listener: typeof publish) => {
        publish = listener;
        return { dispose: async () => undefined };
      });
      const app = new TestApplication({
        routerBridge: createFsmRouterBridge<{ screen: string }>({
          routingKey: 'screen',
          source: { subscribe },
        }),
      });

      app.compose();

      const View = app.createView();
      const root = render(<View />);

      try {
        expect(screen.getByText('Starting')).toBeInTheDocument();

        await act(async () => {
          const initialization = app.initialize();
          await vi.waitFor(() => expect(subscribe).toHaveBeenCalledOnce());
          await publish({ screen: address });
          await initialization;
        });

        expect(screen.getByText('Screen not found')).toBeInTheDocument();
        expect(screen.queryByText('Starting')).not.toBeInTheDocument();
        expect(screen.queryByText('Application failed')).not.toBeInTheDocument();
        expect(app.loadPhone).not.toHaveBeenCalled();

        await act(async () => {
          await publish({ screen: 'customer.sign-in.phone' });
        });

        expect(screen.getByText('Phone screen')).toBeInTheDocument();
        expect(screen.queryByText('Screen not found')).not.toBeInTheDocument();
        expect(app.loadPhone).toHaveBeenCalledOnce();
      } finally {
        root.unmount();
        await app.dispose();
      }
    },
  );
});
