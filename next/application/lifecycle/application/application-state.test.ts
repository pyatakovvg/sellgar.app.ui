import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { Inject } from '../../../../core/di/injection/decorators';
import { Provider } from '../../../../core/runtime/provider/provider';
import type { ApplicationConfiguratorInterface } from '../../config/application-config';
import { ApplicationStateInterface } from '../../state/application-state';
import { ApplicationSnapshotContext, useApplicationState } from '../../state/application-state-context';
import { Application, getApplicationRuntime, startApplication } from './application';

class CartState extends ApplicationStateInterface<{ quantity: number }> {
  static readonly key = 'cart';
  private snapshot = { quantity: -1 };
  private readonly listeners = new Set<() => void>();
  static deserialize(value: unknown) {
    assert.ok(value && typeof value === 'object' && 'quantity' in value && typeof value.quantity === 'number');
    return { quantity: value.quantity };
  }
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  hydrate(snapshot: { quantity: number }) {
    this.snapshot = snapshot;
    for (const listener of this.listeners) listener();
  }
  serialize() {
    return this.snapshot;
  }
}

class StateBindings {
  register(registry: BindingRegistryInterface) {
    registry.bind(CartState).toSelf().inSingletonScope();
  }
}

let reads = 0;
@Provider()
class CartProvider {
  constructor(@Inject(CartState) private readonly state: CartState) {}
  prepare() {
    if (this.state.getSnapshot().quantity < 0) {
      reads++;
      this.state.hydrate({ quantity: 3 });
    }
  }
  dispose() {}
}

@UseBindings(StateBindings)
class TestApplication extends Application {
  protected configure(config: ApplicationConfiguratorInterface) {
    config.states([CartState]);
    config.providers([CartProvider]);
  }
}

test('Next captures public prepared state, restores it before providers, and renders the same initial SSR state', async () => {
  reads = 0;
  let forwarded = false;
  const server = await startApplication(
    (context) => {
      forwarded = context?.request?.headers.cookie === 'private';
      return new TestApplication();
    },
    { request: { headers: { cookie: 'private' } } },
  );
  const snapshot = getApplicationRuntime(server).captureSnapshot();
  assert.equal(forwarded, true);
  assert.deepEqual(snapshot, { cart: { quantity: 3 } });
  assert.equal(JSON.stringify(snapshot).includes('private'), false);
  const browser = await startApplication(() => new TestApplication(), { snapshot });
  try {
    assert.equal(reads, 1);
    assert.deepEqual(browser.getDependency(CartState).getSnapshot(), { quantity: 3 });
    function Purchase() {
      return React.createElement('button', null, useApplicationState(CartState).quantity);
    }
    const html = renderToStaticMarkup(
      React.createElement(ApplicationSnapshotContext.Provider, { value: snapshot }, React.createElement(Purchase)),
    );
    assert.equal(html, '<button>3</button>');
  } finally {
    await Promise.all([server.dispose(), browser.dispose()]);
  }
});

test('missing hydration state fails startup rather than silently fetching a different initial state', async () => {
  const app = new TestApplication();
  await assert.rejects(
    startApplication(() => app, { snapshot: {} }),
    /Missing application state: cart/,
  );
  assert.equal(app.lifecycle.phase, 'disposed');
});
