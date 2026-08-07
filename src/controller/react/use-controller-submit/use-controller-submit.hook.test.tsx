import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ControllerActionArgs } from '../../contract/controller';
import type { DependencyToken } from '../../../di/token/dependency-token';
import {
  MODULE_ACTION_ID_FIELD,
  type ModuleRuntime,
  type ModuleRuntimeActionReference,
  type ModuleRuntimeActionState,
} from '../../../module/runtime/module-runtime';
import { ControllerRuntimeProvider } from '../controller-runtime-context';

import { useSubmit, type ControllerSubmit } from './';

const useFetcherMock = vi.hoisted(() => {
  return vi.fn<() => TestFetcher>();
});

vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();

  return {
    ...actual,
    useFetcher: useFetcherMock,
  };
});

describe('useSubmit', () => {
  afterEach(() => {
    useFetcherMock.mockReset();
  });

  it('сохраняет исходный payload в ModuleRuntime и передаёт fetcher только action id', async () => {
    const fetcherDeferred = createDeferred<void>();
    const fetcher = createFetcher(() => fetcherDeferred.promise);
    const operation: ModuleRuntimeActionReference = { id: 'action:1' };
    const result = { ok: true };
    const runtime = createModuleRuntimeStub();
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    const payload = { file, name: 'Товар' };
    let submit: TestControllerSubmit | null = null;

    runtime.startAction.mockReturnValue(operation);
    runtime.finishAction.mockReturnValue(result);
    useFetcherMock.mockReturnValue(fetcher);

    renderWithRuntime(
      runtime.value,
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    await waitFor(() => {
      expect(submit).not.toBeNull();
    });

    const resultPromise = readSubmit(submit)(payload);

    expect(runtime.startAction).toHaveBeenCalledWith(TestControllerInterface, payload);
    expect(runtime.startAction.mock.calls[0]?.[1]).toBe(payload);
    expect((runtime.startAction.mock.calls[0]?.[1] as typeof payload).file).toBe(file);

    const body = fetcher.submit.mock.calls[0]?.[0];

    expect(body).toBeInstanceOf(FormData);
    expect((body as FormData).get(MODULE_ACTION_ID_FIELD)).toBe(operation.id);
    expect(fetcher.submit.mock.calls[0]?.[1]).toEqual({ method: 'post' });
    expect(runtime.finishAction).not.toHaveBeenCalled();

    fetcherDeferred.resolve();

    await expect(resultPromise).resolves.toBe(result);
    expect(runtime.finishAction).toHaveBeenCalledWith(operation);
  });

  it('передаёт ошибку fetcher в ModuleRuntime', async () => {
    const fetcherError = new Error('Fetcher failed');
    const fetcher = createFetcher(() => Promise.reject(fetcherError));
    const operation: ModuleRuntimeActionReference = { id: 'action:1' };
    const runtime = createModuleRuntimeStub();
    let submit: TestControllerSubmit | null = null;

    runtime.startAction.mockReturnValue(operation);
    runtime.finishAction.mockImplementation(() => {
      throw fetcherError;
    });
    useFetcherMock.mockReturnValue(fetcher);

    renderWithRuntime(
      runtime.value,
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    await waitFor(() => {
      expect(submit).not.toBeNull();
    });

    await expect(readSubmit(submit)({ file: undefined, name: 'Товар' })).rejects.toBe(fetcherError);
    expect(runtime.failAction).toHaveBeenCalledWith(operation.id, fetcherError);
    expect(runtime.finishAction).toHaveBeenCalledWith(operation);
  });

  it('читает общее состояние action из ModuleRuntime', async () => {
    const runtime = createModuleRuntimeStub();
    let sourceSubmit: TestControllerSubmit | null = null;
    let observerSubmit: TestControllerSubmit | null = null;

    useFetcherMock.mockImplementation(() => createFetcher());

    renderWithRuntime(
      runtime.value,
      <SharedSubmitProbe
        onObserverSubmit={(value) => {
          observerSubmit = value;
        }}
        onSourceSubmit={(value) => {
          sourceSubmit = value;
        }}
      />,
    );

    await waitFor(() => {
      expect(sourceSubmit).not.toBeNull();
      expect(observerSubmit).not.toBeNull();
    });

    act(() => {
      runtime.setState({
        data: undefined,
        error: undefined,
        inProcess: true,
      });
    });

    await waitFor(() => {
      expect(readSubmit(sourceSubmit).inProcess).toBe(true);
      expect(readSubmit(observerSubmit).inProcess).toBe(true);
    });
  });
});

interface TestPayload {
  readonly file?: File;
  readonly name: string;
}

type TestControllerSubmit = ControllerSubmit<TestPayload, { readonly ok: boolean }>;

interface TestFetcher {
  readonly submit: ReturnType<typeof vi.fn>;
}

interface SubmitProbeProps {
  readonly onSubmit: (submit: TestControllerSubmit) => void;
}

interface SharedSubmitProbeProps {
  readonly onObserverSubmit: (submit: TestControllerSubmit) => void;
  readonly onSourceSubmit: (submit: TestControllerSubmit) => void;
}

const SubmitProbe: React.FC<SubmitProbeProps> = ({ onSubmit }) => {
  const submit = useSubmit<TestControllerInterface>(TestControllerInterface);

  React.useEffect(() => {
    onSubmit(submit);
  }, [onSubmit, submit]);

  return null;
};

const SharedSubmitProbe: React.FC<SharedSubmitProbeProps> = ({ onObserverSubmit, onSourceSubmit }) => {
  const sourceSubmit = useSubmit<TestControllerInterface>(TestControllerInterface);
  const observerSubmit = useSubmit<TestControllerInterface>(TestControllerInterface);

  React.useEffect(() => {
    onSourceSubmit(sourceSubmit);
  }, [onSourceSubmit, sourceSubmit]);

  React.useEffect(() => {
    onObserverSubmit(observerSubmit);
  }, [observerSubmit, onObserverSubmit]);

  return null;
};

abstract class TestControllerInterface {
  abstract action(_args: ControllerActionArgs<TestPayload>): { readonly ok: boolean };
}

class TestController extends TestControllerInterface {
  action(_args: ControllerActionArgs<TestPayload>): { readonly ok: boolean } {
    return { ok: true };
  }
}

const readSubmit = (submit: TestControllerSubmit | null): TestControllerSubmit => {
  if (submit === null) {
    throw new Error('Submit hook контроллера не был захвачен.');
  }

  return submit;
};

const createFetcher = (submit: () => Promise<void> = () => Promise.resolve()): TestFetcher => {
  return {
    submit: vi.fn(submit),
  };
};

const renderWithRuntime = (runtime: ModuleRuntime, children: React.ReactNode) => {
  return render(
    <ControllerRuntimeProvider
      value={{
        controllers: createControllerRegistry(TestControllerInterface, new TestController()),
        kind: 'module',
        runtime,
      }}
    >
      {children}
    </ControllerRuntimeProvider>,
  );
};

const createModuleRuntimeStub = () => {
  let state: ModuleRuntimeActionState = {
    data: undefined,
    error: undefined,
    inProcess: false,
  };
  const listeners = new Set<() => void>();
  const startAction = vi.fn();
  const failAction = vi.fn();
  const finishAction = vi.fn();
  const value = {
    failAction,
    finishAction,
    getActionState: vi.fn(() => state),
    startAction,
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);

      return () => listeners.delete(listener);
    }),
  } as unknown as ModuleRuntime;

  return {
    failAction,
    finishAction,
    setState: (nextState: ModuleRuntimeActionState) => {
      state = nextState;
      listeners.forEach((listener) => listener());
    },
    startAction,
    value,
  };
};

const createControllerRegistry = <TController,>(
  token: DependencyToken<TController>,
  controller: TController,
): ReadonlyMap<DependencyToken<unknown>, unknown> => {
  return new Map<DependencyToken<unknown>, unknown>([[token, controller]]);
};

interface Deferred<TValue> {
  readonly promise: Promise<TValue>;
  readonly resolve: (value: TValue) => void;
}

const createDeferred = <TValue,>(): Deferred<TValue> => {
  let resolve!: (value: TValue) => void;
  const promise = new Promise<TValue>((innerResolve) => {
    resolve = innerResolve;
  });

  return { promise, resolve };
};
