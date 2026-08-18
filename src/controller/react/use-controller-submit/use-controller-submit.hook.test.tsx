import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ControllerArgs, WithPayload } from '../../contract/controller';
import type { ControllerRuntimeActionState, ControllerRuntimeContextValue } from '../controller-runtime-context';
import { ControllerRuntimeProvider } from '../controller-runtime-context';

import { useSubmit, type ControllerSubmit } from './';

describe('useSubmit', () => {
  it('passes the original payload directly to the runtime action port', async () => {
    const file = new File(['image'], 'image.png', { type: 'image/png' });
    const payload = { file, name: 'Товар' };
    const result = { ok: true };
    const runtime = createRuntime();
    let submit: TestControllerSubmit | null = null;

    runtime.action.mockResolvedValue(result);

    renderWithRuntime(runtime, <SubmitProbe onSubmit={(value) => (submit = value)} />);

    await waitFor(() => expect(submit).not.toBeNull());
    await expect(readSubmit(submit)(payload)).resolves.toBe(result);

    expect(runtime.action).toHaveBeenCalledWith(TestControllerInterface, payload);
    expect(runtime.action.mock.calls[0]?.[1]).toBe(payload);
  });

  it('reads shared action state from the runtime port', async () => {
    const runtime = createRuntime();
    let submit: TestControllerSubmit | null = null;

    renderWithRuntime(runtime, <SubmitProbe onSubmit={(value) => (submit = value)} />);
    await waitFor(() => expect(submit).not.toBeNull());

    act(() => {
      runtime.setState({ data: undefined, error: undefined, inProcess: true });
    });

    await waitFor(() => expect(readSubmit(submit).inProcess).toBe(true));
  });

  it('calls an action without payload without a synthetic argument', async () => {
    const runtime = createRuntime();
    let submit: ControllerSubmit<never, void> | null = null;

    renderWithRuntime(runtime, <PayloadlessSubmitProbe onSubmit={(value) => (submit = value)} />);
    await waitFor(() => expect(submit).not.toBeNull());

    await readPayloadlessSubmit(submit)();

    expect(runtime.action).toHaveBeenCalledWith(PayloadlessControllerInterface, undefined);
  });
});

interface TestPayload {
  readonly file?: File;
  readonly name: string;
}

type TestControllerSubmit = ControllerSubmit<TestPayload, { readonly ok: boolean }>;

abstract class TestControllerInterface {
  abstract action(_args: ControllerArgs<WithPayload<TestPayload>>): { readonly ok: boolean };
}

abstract class PayloadlessControllerInterface {
  abstract action(_args: ControllerArgs): void;
}

const SubmitProbe: React.FC<{ readonly onSubmit: (submit: TestControllerSubmit) => void }> = ({ onSubmit }) => {
  const submit = useSubmit<TestControllerInterface>(TestControllerInterface);

  React.useEffect(() => onSubmit(submit), [onSubmit, submit]);
  return null;
};

const PayloadlessSubmitProbe: React.FC<{
  readonly onSubmit: (submit: ControllerSubmit<never, void>) => void;
}> = ({ onSubmit }) => {
  const submit = useSubmit(PayloadlessControllerInterface);

  React.useEffect(() => onSubmit(submit), [onSubmit, submit]);
  return null;
};

const readSubmit = (submit: TestControllerSubmit | null): TestControllerSubmit => {
  if (submit === null) throw new Error('Submit hook контроллера не был захвачен.');
  return submit;
};

const readPayloadlessSubmit = (submit: ControllerSubmit<never, void> | null): ControllerSubmit<never, void> => {
  if (submit === null) throw new Error('Submit hook контроллера не был захвачен.');
  return submit;
};

const renderWithRuntime = (runtime: ControllerRuntimeContextValue, children: React.ReactNode) => {
  return render(<ControllerRuntimeProvider value={runtime}>{children}</ControllerRuntimeProvider>);
};

const createRuntime = () => {
  let state: ControllerRuntimeActionState = { data: undefined, error: undefined, inProcess: false };
  const listeners = new Set<() => void>();
  const action = vi.fn();

  return {
    action,
    getActionState: vi.fn(() => state),
    getController: vi.fn(),
    getLoaderData: vi.fn(),
    getParams: vi.fn(() => ({})),
    getRevalidateRevision: vi.fn(() => 0),
    getRevalidateState: vi.fn(() => ({ error: undefined, inProcess: false })),
    invoke: vi.fn(),
    revalidate: vi.fn(),
    setState: (value: ControllerRuntimeActionState) => {
      state = value;
      listeners.forEach((listener) => listener());
    },
    subscribe: vi.fn((listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }),
  } satisfies ControllerRuntimeContextValue & { readonly setState: (value: ControllerRuntimeActionState) => void };
};
