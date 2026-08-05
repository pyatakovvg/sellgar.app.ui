import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';
import { createControllerLoaderData, type ControllerLoaderData } from '../../data/controller-loader-data';
import { ControllerRuntimeProvider } from '../controller-runtime-context';

import { useLoaderData } from './use-controller-loader-data.hook.ts';

describe('useLoaderData', () => {
  it('returns loader data for requested controller from nearest runtime entity', () => {
    const onData = vi.fn();

    renderWithRuntime(
      <LoaderDataProbe onData={onData} />,
      createControllerLoaderData([
        {
          actionKey: 'controller-action:1',
          controller: TestController,
          value: {
            name: 'Ada',
          },
        },
      ]),
    );

    expect(onData).toHaveBeenCalledWith({
      name: 'Ada',
    });
  });
});

interface LoaderDataProbeProps {
  readonly onData: (data: unknown) => void;
}

const LoaderDataProbe: React.FC<LoaderDataProbeProps> = ({ onData }) => {
  const data = useLoaderData(TestController);

  React.useEffect(() => {
    onData(data);
  }, [data, onData]);

  return null;
};

class TestController {
  loader(): unknown {
    return null;
  }
}

const renderWithRuntime = (children: React.ReactNode, loaderData: ControllerLoaderData) => {
  const runtime = createModuleRuntimeStub(loaderData);

  return render(
    <ControllerRuntimeProvider
      value={{
        controllers: createControllerRegistry(TestController, new TestController()),
        kind: 'module',
        runtime,
      }}
    >
      {children}
    </ControllerRuntimeProvider>,
  );
};

const createControllerRegistry = <TController,>(
  token: DependencyToken<TController>,
  controller: TController,
): ReadonlyMap<DependencyToken<unknown>, unknown> => {
  const controllers = new Map<DependencyToken<unknown>, unknown>();

  controllers.set(token, controller);

  return controllers;
};

const createModuleRuntimeStub = (loaderData: ControllerLoaderData): ModuleRuntime => {
  return {
    getLoaderData: <TValue,>(controllerToken: DependencyToken<unknown>): TValue => {
      return loaderData.values.get(controllerToken) as TValue;
    },
    revalidate: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {};
    }),
  } as unknown as ModuleRuntime;
};
