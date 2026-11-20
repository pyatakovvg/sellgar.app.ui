import React from 'react';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import type { ModuleSnapshot } from '../../contract/module-snapshot';
import { ModuleHost } from './module-host';

const harness = vi.hoisted(() => ({
  view: null as unknown,
  kind: 'module',
  activate: () => {},
  release: vi.fn(),
}));

vi.mock('../../../application/hook/use-application', () => ({ useApplication: () => ({}) }));
vi.mock('../../../application/lifecycle/application', () => ({
  getApplicationRuntime: () => ({ getComponents: () => ({}) }),
}));
vi.mock('../module-metadata-host', () => ({ ModuleMetadataHost: () => null }));
vi.mock('../../runtime/client-module', () => ({
  ClientModule: class {
    definition = { presentation: { kind: harness.kind, metadata: { view: harness.view } } };
    isReady = false;
    failure = null;
    scope: object | null = null;
    listeners = new Set<() => void>();
    subscribe = (listener: () => void) => {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    };
    acquire() {
      harness.activate = () => {
        this.scope = {};
        this.isReady = true;
        this.listeners.forEach((listener) => listener());
      };
      return { ready: Promise.resolve(), release: harness.release };
    }
  },
}));

afterEach(cleanup);

it.each(['module', 'layout'])('preserves DOM and local state when a %s activates', async (kind) => {
  harness.kind = kind;
  const mounted = vi.fn();
  const disposed = vi.fn();
  const Probe = () => {
    const [value, setValue] = React.useState('');
    React.useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />;
  };
  harness.view = <Probe />;
  const snapshot = { managedMetadata: false } as ModuleSnapshot;
  const result = render(<ModuleHost moduleExports={{}} snapshot={snapshot} />);
  const input = result.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'unsaved draft' } });

  await act(async () => harness.activate());

  expect(result.getByRole('textbox')).toBe(input);
  expect((input as HTMLInputElement).value).toBe('unsaved draft');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(disposed).not.toHaveBeenCalled();
  result.unmount();
  expect(disposed).toHaveBeenCalledTimes(1);
});
