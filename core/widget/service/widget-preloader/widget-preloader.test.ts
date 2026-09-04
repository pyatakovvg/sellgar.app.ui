import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SessionRuntimeState } from '../../../application/session/session-runtime-state';
import { bindProviderScope, Provider, ProviderInterface } from '../../../runtime/provider/provider';
import { ApplicationScope } from '../../../runtime/scope/kind/application-scope';
import { WidgetDefinition, configureWidgetRuntimeDefinition } from '../../declaration/widget';
import { WidgetRuntimeRegistry } from '../../runtime/widget-runtime-registry';
import { WidgetPreloader } from './widget-preloader.ts';

describe('WidgetPreloader', () => {
  let registry: WidgetRuntimeRegistry;

  beforeEach(() => {
    registry = new WidgetRuntimeRegistry();
    PreloadProbeProvider.prepareCount = 0;
  });

  afterEach(async () => {
    await registry.dispose();
  });

  it('prepares the same runtime identity that a host lease consumes without a second load', async () => {
    const ownerScope = new ApplicationScope();

    ownerScope.bindSession(new SessionRuntimeState());

    const preloader = new WidgetPreloader(registry);
    const context = bindProviderScope(
      {
        params: {},
        props: {},
        signal: new AbortController().signal,
      },
      ownerScope,
    );
    const cleanup = await preloader.preload(context, PreloadedWidget, {
      props: { value: 'preloaded' },
    });
    const preloadedRuntime = registry.get({ ownerScope, token: PreloadedWidget });
    const hostLease = registry.acquire({
      ownerScope,
      props: { value: 'host' },
      token: PreloadedWidget,
    });

    expect(preloadedRuntime).toBe(hostLease.runtime);
    expect(hostLease.runtime.getSnapshot().phase).toBe('ready');
    expect(PreloadProbeProvider.prepareCount).toBe(1);

    await hostLease.runtime.load();

    expect(hostLease.runtime.getSnapshot().phase).toBe('ready');
    expect(PreloadProbeProvider.prepareCount).toBe(1);

    if (typeof cleanup === 'function') {
      await cleanup();
    }

    expect(hostLease.runtime.getSnapshot().phase).toBe('ready');
    hostLease.release();
  });

  it('retains a ready runtime without implicit revalidation', async () => {
    const ownerScope = new ApplicationScope();

    ownerScope.bindSession(new SessionRuntimeState());

    const preloader = new WidgetPreloader(registry);
    const context = bindProviderScope(
      {
        params: {},
        props: {},
        signal: new AbortController().signal,
      },
      ownerScope,
    );
    const firstCleanup = await preloader.preload(context, PreloadedWidget, {
      props: { value: 'initial' },
    });
    const runtime = registry.get({ ownerScope, token: PreloadedWidget });
    const secondCleanup = await preloader.preload(context, PreloadedWidget, {
      props: { value: 'updated' },
    });

    expect(registry.get({ ownerScope, token: PreloadedWidget })).toBe(runtime);
    expect(runtime?.getProps()).toEqual({ value: 'updated' });
    expect(PreloadProbeProvider.prepareCount).toBe(1);

    if (typeof secondCleanup === 'function') {
      await secondCleanup();
    }

    if (typeof firstCleanup === 'function') {
      await firstCleanup();
    }
  });
});

interface PreloadedWidgetProps {
  readonly value: string;
}

class PreloadedWidget extends WidgetDefinition<PreloadedWidgetProps> {}

@Provider()
class PreloadProbeProvider implements ProviderInterface {
  static prepareCount = 0;

  prepare(): void {
    PreloadProbeProvider.prepareCount++;
  }

  dispose(): void {}
}

configureWidgetRuntimeDefinition(PreloadedWidget, {
  providers: [PreloadProbeProvider],
});
