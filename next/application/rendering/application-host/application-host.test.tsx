import React from 'react';
import { renderToString } from 'react-dom/server';
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useApplication } from '../../hook/use-application';
import { ApplicationHost } from './application-host';

const harness = vi.hoisted(() => ({
  ready: Promise.withResolvers<unknown>(),
  release: vi.fn(),
}));

vi.mock('../../runtime/browser-application', () => ({
  acquireBrowserApplication: () => ({ ready: harness.ready.promise, release: harness.release }),
  startBrowserApplication: () => harness.ready.promise,
}));
vi.mock('../../lifecycle/application', () => ({ getApplicationRuntime: (app: { runtime: unknown }) => app.runtime }));

afterEach(cleanup);

it('preserves hydrated DOM, local state and effects when application bootstrap finishes', async () => {
  const mounted = vi.fn();
  const disposed = vi.fn();
  const subscribe = () => () => {};
  const featuresSnapshot = { phase: 'ready' };
  const lifecycle = { phase: 'ready' };
  const app = {
    lifecycle,
    subscribe,
    runtime: {
      scope: {},
      getFeatures: () => ({ requiresPreparation: true, subscribe, getSnapshot: () => featuresSnapshot }),
      getFeatureTokens: () => [],
    },
  };
  const Probe = () => {
    const [value, setValue] = React.useState('');
    const application = useApplication();
    React.useEffect(() => {
      mounted();
      return disposed;
    }, []);
    return (
      <label>
        <input aria-label="Draft" value={value} onChange={(event) => setValue(event.target.value)} />
        <span>{application ? 'ready' : 'pending'}</span>
      </label>
    );
  };
  const view = (
    <ApplicationHost>
      <Probe />
    </ApplicationHost>
  );
  const container = document.createElement('div');
  container.innerHTML = renderToString(view);
  document.body.append(container);
  const serverInput = container.querySelector('input');
  const result = render(view, { container, hydrate: true });
  const input = result.getByRole('textbox');
  expect(input).toBe(serverInput);
  fireEvent.change(input, { target: { value: 'unsaved draft' } });
  expect(mounted).toHaveBeenCalledTimes(1);

  await act(async () => {
    harness.ready.resolve(app);
    await harness.ready.promise;
  });

  expect(result.getByText('ready')).toBeTruthy();
  expect(result.getByRole('textbox')).toBe(input);
  expect((input as HTMLInputElement).value).toBe('unsaved draft');
  expect(mounted).toHaveBeenCalledTimes(1);
  expect(disposed).not.toHaveBeenCalled();
  result.unmount();
  expect(disposed).toHaveBeenCalledTimes(1);
  expect(harness.release).toHaveBeenCalledTimes(1);
});
