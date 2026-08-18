import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DependencyToken } from '../../../di/token/dependency-token';
import { createControllerLoaderData, type ControllerLoaderData } from '../../data/controller-loader-data';
import { ControllerRuntimeProvider, type ControllerRuntimeContextValue } from '../controller-runtime-context';

import { useLoaderData } from './';

describe('useLoaderData', () => {
  it('returns loader data for requested controller from nearest runtime entity', () => {
    const onData = vi.fn();

    renderWithRuntime(
      <LoaderDataProbe onData={onData} />,
      createControllerLoaderData([
        {
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
        ...runtime,
      }}
    >
      {children}
    </ControllerRuntimeProvider>,
  );
};

const createModuleRuntimeStub = (loaderData: ControllerLoaderData): ControllerRuntimeContextValue => {
  return {
    action: vi.fn(),
    getActionState: vi.fn(() => ({ data: undefined, error: undefined, inProcess: false })),
    getController: vi.fn(),
    getLoaderData: <TValue,>(controllerToken: DependencyToken<unknown>): TValue => {
      return loaderData.values.get(controllerToken) as TValue;
    },
    getParams: vi.fn(() => ({})),
    getRevalidateRevision: vi.fn(() => 0),
    getRevalidateState: vi.fn(() => ({ error: undefined, inProcess: false })),
    invoke: vi.fn(),
    revalidate: vi.fn(),
    subscribe: vi.fn(() => {
      return () => {};
    }),
  };
};
