import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CONTROLLER_ACTION_ERROR_FIELD,
  CONTROLLER_ACTION_KEY_FIELD,
  CONTROLLER_ACTION_PAYLOAD_FIELD,
  CONTROLLER_ACTION_SUBMIT_ID_FIELD,
} from '../../action/controller-action-request';
import type { ControllerActionArgs } from '../../contract/controller';
import { createControllerActionKey } from '../../data/controller-loader-data';
import { ApplicationScope } from '../../../runtime/scope/kind';
import { RuntimeScopeProvider } from '../../../runtime/react';
import type { ModuleRuntime } from '../../../module/runtime/module-runtime';
import type { DependencyToken } from '../../../di/token/dependency-token';
import { ControllerRuntimeProvider } from '../controller-runtime-context';

import { useSubmit, type ControllerSubmit } from './use-controller-submit.hook.ts';

const useFetcherMock = vi.hoisted(() => {
  return vi.fn<() => TestFetcher>();
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();

  return {
    ...actual,
    useFetcher: useFetcherMock,
  };
});

describe('useSubmit', () => {
  afterEach(() => {
    useFetcherMock.mockReset();
  });

  it('submits payload envelope and resolves matching result', async () => {
    const fetcher = createFetcher();
    let submit: TestControllerSubmit | null = null;

    useFetcherMock.mockReturnValue(fetcher);

    const { rerender } = renderWithScope(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    let resultPromise: Promise<{ ok: boolean } | undefined>;

    await act(async () => {
      resultPromise = submit?.({ name: 'Ada' }) ?? Promise.resolve(undefined);
    });

    const body = fetcher.submit.mock.calls[0]?.[0];

    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toMatchObject({
      [CONTROLLER_ACTION_KEY_FIELD]: createControllerActionKey(TestControllerInterface),
      [CONTROLLER_ACTION_PAYLOAD_FIELD]: {
        name: 'Ada',
      },
    });
    expect(fetcher.submit.mock.calls[0]?.[1]).toEqual({
      encType: 'application/json',
      method: 'post',
    });

    const submitId = JSON.parse(body as string)[CONTROLLER_ACTION_SUBMIT_ID_FIELD] as string;

    fetcher.data = {
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
      data: {
        ok: true,
      },
    };
    fetcher.state = 'idle';

    rerender(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    await expect(resultPromise!).resolves.toEqual({
      ok: true,
    });
    await waitFor(() => {
      expect(readSubmit(submit).data).toEqual({
        ok: true,
      });
    });
    expect(readSubmit(submit).error).toBeUndefined();
    expect(readSubmit(submit).inProcess).toBe(false);
  });

  it('shares action state between hook instances in one runtime scope', async () => {
    const sourceFetcher = createFetcher();
    const observerFetcher = createFetcher();
    const fetchers = [sourceFetcher, observerFetcher];
    let fetcherIndex = 0;
    let sourceSubmit: TestControllerSubmit | null = null;
    let observerSubmit: TestControllerSubmit | null = null;

    useFetcherMock.mockImplementation(() => {
      return fetchers[fetcherIndex++ % fetchers.length];
    });

    const { rerender } = renderWithScope(
      <SharedSubmitProbe
        onObserverSubmit={(value) => {
          observerSubmit = value;
        }}
        onSourceSubmit={(value) => {
          sourceSubmit = value;
        }}
      />,
    );

    let resultPromise: Promise<{ ok: boolean } | undefined>;

    await act(async () => {
      resultPromise = readSubmit(sourceSubmit)({ name: 'Ada' });
    });

    expect(sourceFetcher.submit).toHaveBeenCalledTimes(1);
    expect(observerFetcher.submit).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(readSubmit(sourceSubmit).inProcess).toBe(true);
      expect(readSubmit(observerSubmit).inProcess).toBe(true);
    });

    await expect(readSubmit(observerSubmit)({ name: 'Grace' })).rejects.toThrow(
      'Действие контроллера уже выполняется.',
    );
    expect(observerFetcher.submit).not.toHaveBeenCalled();

    const body = sourceFetcher.submit.mock.calls[0]?.[0];
    const submitId = JSON.parse(body as string)[CONTROLLER_ACTION_SUBMIT_ID_FIELD] as string;

    sourceFetcher.data = {
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
      data: {
        ok: true,
      },
    };
    sourceFetcher.state = 'idle';

    rerender(
      <SharedSubmitProbe
        onObserverSubmit={(value) => {
          observerSubmit = value;
        }}
        onSourceSubmit={(value) => {
          sourceSubmit = value;
        }}
      />,
    );

    await expect(resultPromise!).resolves.toEqual({
      ok: true,
    });
    await waitFor(() => {
      expect(readSubmit(sourceSubmit).data).toEqual({
        ok: true,
      });
      expect(readSubmit(observerSubmit).data).toEqual({
        ok: true,
      });
    });
    expect(readSubmit(sourceSubmit).error).toBeUndefined();
    expect(readSubmit(observerSubmit).error).toBeUndefined();
    expect(readSubmit(sourceSubmit).inProcess).toBe(false);
    expect(readSubmit(observerSubmit).inProcess).toBe(false);
  });

  it('rejects mismatched idle result as submit failure', async () => {
    const fetcher = createFetcher();
    let submit: TestControllerSubmit | null = null;

    useFetcherMock.mockReturnValue(fetcher);

    const { rerender } = renderWithScope(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    let resultPromise: Promise<{ ok: boolean } | undefined>;

    await act(async () => {
      resultPromise = submit?.({ name: 'Ada' }) ?? Promise.resolve(undefined);
    });

    fetcher.data = {
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: 'another-submit',
      data: {
        ok: true,
      },
    };
    fetcher.state = 'idle';

    rerender(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    await expect(resultPromise!).rejects.toThrow('Не удалось отправить действие контроллера.');
    await waitFor(() => {
      expect(readSubmit(submit).error).toBeInstanceOf(Error);
    });
    expect(readSubmit(submit).data).toBeUndefined();
    expect(readSubmit(submit).inProcess).toBe(false);
  });

  it('keeps submit error from matching error envelope', async () => {
    const fetcher = createFetcher();
    const actionError = new Error('Action failed');
    let submit: TestControllerSubmit | null = null;

    useFetcherMock.mockReturnValue(fetcher);

    const { rerender } = renderWithScope(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    let resultPromise: Promise<{ ok: boolean } | undefined>;

    await act(async () => {
      resultPromise = readSubmit(submit)({ name: 'Ada' });
    });

    const body = fetcher.submit.mock.calls[0]?.[0];
    const submitId = JSON.parse(body as string)[CONTROLLER_ACTION_SUBMIT_ID_FIELD] as string;

    fetcher.data = {
      [CONTROLLER_ACTION_ERROR_FIELD]: actionError,
      [CONTROLLER_ACTION_SUBMIT_ID_FIELD]: submitId,
    };
    fetcher.state = 'idle';

    rerender(
      <SubmitProbe
        onSubmit={(value) => {
          submit = value;
        }}
      />,
    );

    await expect(resultPromise!).rejects.toBe(actionError);
    await waitFor(() => {
      expect(readSubmit(submit).error).toBe(actionError);
    });
    expect(readSubmit(submit).data).toBeUndefined();
    expect(readSubmit(submit).inProcess).toBe(false);
  });
});

type TestControllerSubmit = ControllerSubmit<{ readonly name: string }, { readonly ok: boolean }>;

interface TestFetcher {
  data: unknown;
  readonly submit: ReturnType<typeof vi.fn>;
  state: 'idle' | 'loading' | 'submitting';
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
  abstract action(_args: ControllerActionArgs<{ readonly name: string }>): { readonly ok: boolean };
}

class TestController extends TestControllerInterface {
  action(_args: ControllerActionArgs<{ readonly name: string }>): { readonly ok: boolean } {
    return {
      ok: true,
    };
  }
}

const readSubmit = (submit: TestControllerSubmit | null): TestControllerSubmit => {
  if (submit === null) {
    throw new Error('Submit hook контроллера не был захвачен.');
  }

  return submit;
};

const createFetcher = (): TestFetcher => {
  return {
    data: undefined,
    submit: vi.fn(),
    state: 'idle',
  };
};

const renderWithScope = (children: React.ReactNode, scope = new ApplicationScope()) => {
  const runtime = createModuleRuntimeStub();
  const wrappedChildren = (
    <RuntimeScopeProvider scope={scope}>
      <ControllerRuntimeProvider
        value={{
          controllers: createControllerRegistry(TestControllerInterface, new TestController()),
          kind: 'module',
          runtime,
        }}
      >
        {children}
      </ControllerRuntimeProvider>
    </RuntimeScopeProvider>
  );
  const result = render(wrappedChildren);

  return {
    ...result,
    rerender: (nextChildren: React.ReactNode) => {
      result.rerender(
        <RuntimeScopeProvider scope={scope}>
          <ControllerRuntimeProvider
            value={{
              controllers: createControllerRegistry(TestControllerInterface, new TestController()),
              kind: 'module',
              runtime,
            }}
          >
            {nextChildren}
          </ControllerRuntimeProvider>
        </RuntimeScopeProvider>,
      );
    },
  };
};

const createModuleRuntimeStub = (): ModuleRuntime => {
  return {
    revalidate: vi.fn(),
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
