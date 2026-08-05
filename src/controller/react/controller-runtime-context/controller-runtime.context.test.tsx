import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';

import { ControllerRuntimeProvider, useController } from './';

describe('useController', () => {
  it('returns controller from nearest runtime provider by token', () => {
    const controller = new TestController();
    const onController = vi.fn();

    render(
      <ControllerRuntimeProvider
        value={{
          controllers: createControllerRegistry(TestControllerInterface, controller),
          kind: 'module',
          runtime: createModuleRuntimeStub(),
        }}
      >
        <ControllerProbe onController={onController} />
      </ControllerRuntimeProvider>,
    );

    expect(onController).toHaveBeenCalledWith(controller);
  });

  it('throws when runtime provider is missing', () => {
    expect(() => render(<ControllerProbe onController={vi.fn()} />)).toThrow('Runtime controllers недоступны.');
  });

  it('throws when controller token is missing in runtime provider', () => {
    expect(() =>
      render(
        <ControllerRuntimeProvider
          value={{
            controllers: new Map(),
            kind: 'module',
            runtime: createModuleRuntimeStub(),
          }}
        >
          <ControllerProbe onController={vi.fn()} />
        </ControllerRuntimeProvider>,
      ),
    ).toThrow('Controller недоступен в текущем runtime entity.');
  });
});

abstract class TestControllerInterface {
  abstract load(): string;
}

class TestController extends TestControllerInterface {
  load(): string {
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

const createModuleRuntimeStub = (): ModuleRuntime => {
  return {
    subscribe: vi.fn(() => {
      return () => {};
    }),
  } as unknown as ModuleRuntime;
};

const createControllerRegistry = <TController,>(
  token: DependencyToken<TController>,
  controller: TController,
): ReadonlyMap<DependencyToken<unknown>, unknown> => {
  const controllers = new Map<DependencyToken<unknown>, unknown>();

  controllers.set(token, controller);

  return controllers;
};
