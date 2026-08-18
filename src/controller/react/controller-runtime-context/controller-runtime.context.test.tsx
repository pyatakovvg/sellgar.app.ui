import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';

import { ControllerRuntimeProvider, type ControllerRuntimeContextValue, useController } from './';

describe('useController', () => {
  it('returns a facade that invokes controller methods through the runtime port', () => {
    const controller = new TestController();
    const runtime = createControllerRuntime(controller);
    let resolvedController: TestControllerInterface | null = null;

    render(
      <ControllerRuntimeProvider value={runtime}>
        <ControllerProbe onController={(value) => (resolvedController = value)} />
      </ControllerRuntimeProvider>,
    );

    expect(resolvedController).not.toBe(controller);
    expect((resolvedController as TestControllerInterface | null)?.getValue()).toBe('loaded');
    expect(runtime.invoke).toHaveBeenCalledWith(TestControllerInterface, 'getValue', []);
  });

  it('preserves async method result while runtime owns its lifetime', async () => {
    const controller = new TestController();
    const runtime = createControllerRuntime(controller);
    let resolvedController: TestControllerInterface | null = null;

    render(
      <ControllerRuntimeProvider value={runtime}>
        <ControllerProbe onController={(value) => (resolvedController = value)} />
      </ControllerRuntimeProvider>,
    );

    await expect((resolvedController as TestControllerInterface | null)?.load()).resolves.toBe('loaded');
    expect(runtime.invoke).toHaveBeenCalledWith(TestControllerInterface, 'load', []);
  });

  it('keeps readable controller properties on the facade', () => {
    const controller = new TestController();
    const runtime = createControllerRuntime(controller);
    let resolvedController: TestControllerInterface | null = null;

    render(
      <ControllerRuntimeProvider value={runtime}>
        <ControllerProbe onController={(value) => (resolvedController = value)} />
      </ControllerRuntimeProvider>,
    );

    expect((resolvedController as TestControllerInterface | null)?.state).toBe(controller.state);
  });

  it('throws when runtime provider is missing', () => {
    expect(() => render(<ControllerProbe onController={vi.fn()} />)).toThrow('Runtime controllers недоступны.');
  });
});

abstract class TestControllerInterface {
  abstract readonly state: { readonly ready: boolean };
  abstract getValue(): string;
  abstract load(): Promise<string>;
}

class TestController implements TestControllerInterface {
  readonly state = { ready: true };

  getValue(): string {
    return 'loaded';
  }

  async load(): Promise<string> {
    return 'loaded';
  }
}

interface ControllerProbeProps {
  readonly onController: (controller: TestControllerInterface) => void;
}

const ControllerProbe: React.FC<ControllerProbeProps> = ({ onController }) => {
  const controller = useController(TestControllerInterface);

  React.useEffect(() => {
    onController(controller);
  }, [controller, onController]);

  return null;
};

const createControllerRuntime = (
  controller: TestController,
): ControllerRuntimeContextValue & {
  readonly invoke: ReturnType<typeof vi.fn>;
} => {
  const invoke = vi.fn((_token: DependencyToken<unknown>, method: string | symbol, args: readonly unknown[]) => {
    const member = (controller as unknown as Record<string | symbol, unknown>)[method];

    if (typeof member !== 'function') {
      throw new Error('Метод тестового контроллера недоступен.');
    }

    return member.apply(controller, args);
  });

  return {
    action: vi.fn(),
    getActionState: vi.fn(() => ({ data: undefined, error: undefined, inProcess: false })),
    getController: vi.fn(() => controller),
    getLoaderData: vi.fn(),
    getParams: vi.fn(() => ({})),
    getRevalidateRevision: vi.fn(() => 0),
    getRevalidateState: vi.fn(() => ({ error: undefined, inProcess: false })),
    invoke,
    revalidate: vi.fn(),
    subscribe: vi.fn(() => () => {}),
  };
};
