import { describe, expect, it, vi } from 'vitest';

vi.mock('../../transport/native-linking-transport', () => ({
  createNativeLinkingTransport: () => {
    throw new Error('Test must supply a transport');
  },
}));

import { ApplicationConfig } from '../../../../core/application/config/application-config';
import type { ApplicationConfiguratorInterface } from '../../../../core/application/config/application-configurator';
import { Application } from '../../../../core/application/lifecycle/application';
import { createModuleRuntimeDefinition } from '../../../../core/module/contract/module-runtime-definition';
import type { ModuleExportResolverInterface } from '../../../../core/module/resolution/module-export-resolver';
import { Policy } from '../../../../core/policy/contract/policy';
import { RoutePolicyInterface } from '../../../../core/router/runtime/route-policy';
import { param, segments } from '../../../../core/router/declaration/address';
import { Route } from '../../../../core/router/declaration/route';
import { Router } from '../../../../core/router/declaration/router';
import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { createNativeRouterBridge, type NativeRouterBridge } from './native-router-bridge';

class First {}
class Second {}
class Third {}
class Replacement {}
class Parent {}
class Item {
  declare readonly id: string;
}
class Redirected {}
class TestModule {}

@Policy()
class RedirectPolicy extends RoutePolicyInterface {
  execute() {
    return { type: 'fail' } as const;
  }
}

class TestModuleExportResolver implements ModuleExportResolverInterface<null> {
  resolve() {
    return createModuleRuntimeDefinition({ presentation: null, token: TestModule });
  }
}

class TestApplication extends Application<null> {
  constructor(
    readonly bridge: NativeRouterBridge,
    private readonly router: Router,
  ) {
    super(bridge, new ApplicationConfig(), new TestModuleExportResolver());
  }

  get navigate(): NavigateServiceInterface {
    return this.getApplicationScope().get(NavigateServiceInterface);
  }

  get history() {
    return this.getRouterHistoryEntries();
  }

  protected configure(app: ApplicationConfiguratorInterface): void {
    app.router(this.router);
  }
}

const createApplication = async (
  nested: boolean | 'router' | 'top-up' = false,
  replacementLoad?: () => Promise<Readonly<Record<string, unknown>>>,
) => {
  const load = vi.fn(async () => ({}));
  const routes = [
    new Route({ address: segments('first'), load, token: First }),
    new Route({ address: segments('second'), load, token: Second }),
    new Route({ address: segments('third'), load, token: Third }),
    new Route({ address: segments('replacement'), load: replacementLoad ?? load, token: Replacement }),
    new Route({ address: segments('items', param('id')), load, token: Item }),
    new Route({
      address: segments('redirected'),
      load,
      token: Redirected,
      canMatch: [RedirectPolicy.configure().onFail(Router.redirectTo(First))],
    }),
  ];
  const router = new Router({
    routes:
      nested === 'top-up'
        ? [
            new Route({
              address: segments('first'),
              load,
              token: First,
              routing: [
                new Router({
                  routes: [
                    new Route({
                      address: segments('second'),
                      load,
                      token: Second,
                      routing: [
                        new Router({ routes: [new Route({ address: segments('third'), load, token: Third })] }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            routes[3]!,
          ]
        : nested === 'router'
          ? [new Route({ address: segments('parent'), routing: [new Router({ routes })], token: Parent })]
          : nested
            ? [new Route({ address: segments('parent'), routes, token: Parent })]
            : routes,
  });
  const bridge = createNativeRouterBridge({
    transport: {
      getInitialLocation: async () => ({
        address:
          nested === 'top-up' ? ['first'] : nested === 'router' ? ['parent'] : nested ? ['parent', 'first'] : ['first'],
        nested: nested === 'router' ? { address: ['first'], query: {} } : null,
        query: {},
        state: undefined,
      }),
      subscribe: () => () => undefined,
    },
  });
  const app = new TestApplication(bridge, router);
  app.compose();
  await app.initialize();
  return { app, bridge, load };
};

const addresses = (bridge: NativeRouterBridge) =>
  bridge
    .getSnapshot()
    .entries.map(({ location }) =>
      [location.address.join('/'), location.nested?.address.join('/')].filter(Boolean).join('#'),
    );

describe('Native replace history across core and bridge', () => {
  it.each([false, true, 'router'] as const)(
    'removes the replaced screen from Back history (nested: %s)',
    async (nested) => {
      const { app, bridge, load } = await createApplication(nested);
      const prefix = nested === 'router' ? 'parent#' : nested ? 'parent/' : '';
      try {
        await app.navigate.to(Second);
        await app.navigate.to(Third);
        const replaced = app.history.at(-1)!;
        const originalIds = bridge.getSnapshot().entries.map(({ id }) => id);

        await app.navigate.to(Replacement, { replace: true });

        expect(addresses(bridge)).toEqual(['first', 'second', 'replacement'].map((path) => prefix + path));
        expect(bridge.getSnapshot().action).toBe('replace');
        expect(bridge.getSnapshot().entries.map(({ id }) => id)).toEqual(originalIds);
        expect(replaced.activation.getSnapshot().phase).toBe('released');
        expect(app.history).toHaveLength(3);

        await app.navigate.back();
        expect(addresses(bridge)).toEqual(['first', 'second'].map((path) => prefix + path));
        await app.navigate.back();
        expect(addresses(bridge)).toEqual([prefix + 'first']);
        await app.navigate.back();
        expect(addresses(bridge)).toEqual([prefix + 'first']);
        expect(load).toHaveBeenCalledTimes(4);
      } finally {
        await app.dispose();
      }
    },
  );

  it('replacing with an earlier screen preserves intervening history and reuses its retained runtime', async () => {
    const { app, bridge, load } = await createApplication();
    try {
      const first = app.history[0]!.activation;
      await app.navigate.to(Second);
      await app.navigate.to(Third);
      const replaced = app.history.at(-1)!.activation;

      await app.navigate.to(First, { replace: true });

      expect(addresses(bridge)).toEqual(['first', 'second', 'first']);
      expect(app.history.at(-1)!.activation).toBe(first);
      expect(replaced.getSnapshot().phase).toBe('released');
      await app.navigate.back();
      expect(addresses(bridge)).toEqual(['first', 'second']);
      expect(first.getSnapshot().phase).toBe('retained');
      await app.navigate.back();
      expect(addresses(bridge)).toEqual(['first']);
      expect(first.getSnapshot().phase).toBe('focused');
      expect(load).toHaveBeenCalledTimes(3);
    } finally {
      await app.dispose();
    }
  });

  it('replacing the first entry leaves no previous screen', async () => {
    const { app, bridge } = await createApplication();
    try {
      const replaced = app.history[0]!.activation;
      await app.navigate.to(Replacement, { replace: true });
      await app.navigate.back();

      expect(addresses(bridge)).toEqual(['replacement']);
      expect(app.history).toHaveLength(1);
      expect(replaced.getSnapshot().phase).toBe('released');
    } finally {
      await app.dispose();
    }
  });

  it('replacing the current screen with itself preserves history and its active runtime', async () => {
    const { app, bridge, load } = await createApplication();
    try {
      await app.navigate.to(Second);
      const current = app.history.at(-1)!;
      await app.navigate.to(Second, { replace: true });

      expect(addresses(bridge)).toEqual(['first', 'second']);
      expect(app.history.at(-1)!.key).toBe(current.key);
      expect(app.history.at(-1)!.activation).toBe(current.activation);
      expect(current.activation.getSnapshot().phase).toBe('focused');
      await app.navigate.back();
      expect(addresses(bridge)).toEqual(['first']);
      expect(load).toHaveBeenCalledTimes(2);
    } finally {
      await app.dispose();
    }
  });
});

describe('Native resetTo across core and bridge', () => {
  it('resets to a parameterized nested target with its query and state', async () => {
    const { app, bridge } = await createApplication('router');
    try {
      await app.navigate.to(Second);
      await app.navigate.resetTo(Item, { params: { id: '200' }, query: { tab: 'details' }, state: { complete: true } });
      expect(addresses(bridge)).toEqual(['parent#items/200']);
      expect(bridge.getSnapshot().entries[0]!.location.nested?.query).toEqual({ tab: 'details' });
      expect(bridge.getSnapshot().entries[0]!.location.state).toEqual({ complete: true });
      expect(app.history).toHaveLength(1);
    } finally {
      await app.dispose();
    }
  });

  it('preserves reset intent across policy redirects', async () => {
    const { app, bridge } = await createApplication();
    try {
      await app.navigate.to(Second);
      await app.navigate.resetTo(Redirected);
      expect(addresses(bridge)).toEqual(['first']);
      expect(bridge.getSnapshot().action).toBe('reset');
      expect(app.history).toHaveLength(1);
    } finally {
      await app.dispose();
    }
  });

  it('keeps the existing target exception-boundary semantics when loading fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { app, bridge } = await createApplication(false, async () => {
      throw new Error('Target failed');
    });
    try {
      await app.navigate.to(Second);
      await app.navigate.resetTo(Replacement);
      expect(addresses(bridge)).toEqual(['replacement']);
      expect(app.history).toHaveLength(1);
    } finally {
      error.mockRestore();
      await app.dispose();
    }
  });

  it('does not clear history when reset target params are invalid', async () => {
    const { app, bridge } = await createApplication();
    try {
      await app.navigate.to(Second);
      await expect(app.navigate.resetTo(Item, { params: {} } as never)).rejects.toThrow();
      expect(addresses(bridge)).toEqual(['first', 'second']);
      expect(app.history).toHaveLength(2);
    } finally {
      await app.dispose();
    }
  });

  it.each([false, true])(
    'distinguishes pending reset intent from ordinary navigation (reset last: %s)',
    async (resetLast) => {
      let finish!: () => void;
      const loading = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const replacementLoad = vi.fn(async () => {
        await loading;
        return {};
      });
      const { app, bridge } = await createApplication(false, replacementLoad);
      try {
        await app.navigate.to(Second);
        const first = resetLast ? app.navigate.to(Replacement) : app.navigate.resetTo(Replacement);
        await vi.waitFor(() => expect(replacementLoad).toHaveBeenCalledOnce());
        const last = resetLast ? app.navigate.resetTo(Replacement) : app.navigate.to(Replacement);
        finish();
        await Promise.all([first, last]);
        expect(addresses(bridge)).toEqual(resetLast ? ['replacement'] : ['first', 'second', 'replacement']);
      } finally {
        finish();
        await app.dispose();
      }
    },
  );

  it.each([false, true, 'router'] as const)('starts a new history at any target (nested: %s)', async (nested) => {
    const { app, bridge } = await createApplication(nested);
    try {
      await app.navigate.to(Second);
      await app.navigate.to(Third);
      const previous = [...app.history];

      await app.navigate.resetTo(Second);

      const prefix = nested === 'router' ? 'parent#' : nested ? 'parent/' : '';
      expect(addresses(bridge)).toEqual([prefix + 'second']);
      expect(bridge.getSnapshot().action).toBe('reset');
      expect(bridge.getSnapshot().index).toBe(0);
      expect(app.history).toHaveLength(1);
      expect(app.history[0]!.activation).toBe(previous[1]!.activation);
      expect(previous[0]!.activation.getSnapshot().phase).toBe('released');
      expect(previous[2]!.activation.getSnapshot().phase).toBe('released');

      await app.navigate.back();
      expect(addresses(bridge)).toEqual([prefix + 'second']);
      await app.navigate.to(Replacement);
      expect(addresses(bridge)).toEqual([prefix + 'second', prefix + 'replacement']);
      await app.navigate.back();
      expect(addresses(bridge)).toEqual([prefix + 'second']);
    } finally {
      await app.dispose();
    }
  });

  it('clears amount and 3DS history when returning from a root operation result to the wallet', async () => {
    const { app, bridge } = await createApplication('top-up');
    try {
      const wallet = app.history[0]!.activation;
      const walletRuntime = app.history[0]!.tree.routes.at(-1);
      await app.navigate.to(Second);
      const amount = app.history.at(-1)!.activation;
      await app.navigate.to(Third);
      const threeDS = app.history.at(-1)!.activation;
      await app.navigate.to(Replacement, { replace: true });
      const result = app.history.at(-1)!.activation;
      expect(app.history).toHaveLength(3);

      await app.navigate.resetTo(First);

      expect(addresses(bridge)).toEqual(['first']);
      expect(app.history[0]!.activation).toBe(wallet);
      expect(app.history[0]!.tree.routes.at(-1)).toBe(walletRuntime);
      expect([amount, threeDS, result].map((activation) => activation.getSnapshot().phase)).toEqual([
        'released',
        'released',
        'released',
      ]);
      await app.navigate.back();
      expect(addresses(bridge)).toEqual(['first']);
    } finally {
      await app.dispose();
    }
  });

  it('clears previous entries even when the reset target is already focused', async () => {
    const { app, bridge } = await createApplication();
    try {
      await app.navigate.to(Second);
      const focused = app.history.at(-1)!.activation;
      await app.navigate.resetTo(Second);
      expect(addresses(bridge)).toEqual(['second']);
      expect(app.history[0]!.activation).toBe(focused);
      expect(focused.getSnapshot().phase).toBe('focused');
    } finally {
      await app.dispose();
    }
  });

  it('preserves committed history when a pending reset is cancelled by Back', async () => {
    let finish!: () => void;
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const replacementLoad = vi.fn(async () => {
      await loading;
      return {};
    });
    const { app, bridge } = await createApplication(false, replacementLoad);
    try {
      await app.navigate.to(Second);
      const original = bridge.getSnapshot();
      const reset = app.navigate.resetTo(Replacement);
      await vi.waitFor(() => expect(replacementLoad).toHaveBeenCalledOnce());
      expect(bridge.getSnapshot()).toBe(original);

      await app.navigate.back();
      finish();
      await reset;

      expect(addresses(bridge)).toEqual(['first', 'second']);
      expect(app.history).toHaveLength(2);
    } finally {
      finish();
      await app.dispose();
    }
  });
});
