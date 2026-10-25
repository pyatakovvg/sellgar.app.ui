import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from '../../../../core/application/session/session-runtime-state';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { WidgetDefinition } from '../../../../core/widget/declaration/widget';
import { WidgetRuntimeRegistry } from '../../../../core/widget/runtime/widget-runtime-registry';
import { ApplicationComponentsProvider } from '../../../application/rendering/application-components-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { Widget } from '../../declaration/widget';
import { WidgetHost } from './widget-host.tsx';

interface TestWidgetProps {
  readonly value: string;
}

@Widget<TestWidgetProps>({ view: ({ value }) => <div>{value}</div> })
class TestWidget extends WidgetDefinition<TestWidgetProps> {}

describe('WidgetHost', () => {
  it('renders accepted props once and skips unchanged parent renders', async () => {
    const rendered = vi.fn(({ value }: TestWidgetProps) => <span>{value}</span>);
    @Widget<TestWidgetProps>({ view: rendered })
    class Token extends WidgetDefinition<TestWidgetProps> {}
    const scope = new ApplicationScope();
    scope.bindSession(new SessionRuntimeState());
    const components = {};
    const tree = (props: TestWidgetProps) => (
      <ApplicationComponentsProvider components={components}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={Token} props={props} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>
    );
    const initial = { value: 'first' };
    const next = { value: 'second' };
    const view = render(tree(initial));
    try {
      await screen.findByText('first');
      rendered.mockClear();
      view.rerender(tree(next));
      expect(screen.getByText('second')).toBeInTheDocument();
      expect(rendered.mock.calls.map(([props]) => props.value)).toEqual(['second']);
      rendered.mockClear();
      view.rerender(tree(next));
      expect(rendered).not.toHaveBeenCalled();
      view.rerender(tree({ value: 'third' }));
      expect(screen.getByText('third')).toBeInTheDocument();
    } finally {
      view.unmount();
      await scope.disposeWidgetRuntimes();
      await scope.disposeProviders();
      scope.dispose();
    }
  });

  it('reuses the same WidgetRuntime during a React StrictMode effect replay', async () => {
    const scope = new ApplicationScope();

    scope.bindSession(new SessionRuntimeState());
    const registry = scope.get(WidgetRuntimeRegistry);
    const acquire = vi.spyOn(registry, 'acquire');
    const createTree = (key: string): React.ReactNode => (
      <ApplicationComponentsProvider components={{}}>
        <RuntimeScopeProvider scope={scope}>
          <React.StrictMode>
            <WidgetHost key={key} props={{ value: 'ready' }} token={TestWidget} />
          </React.StrictMode>
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>
    );
    const view = render(createTree('initial'));

    await waitFor(() => expect(screen.getByText('ready')).toBeInTheDocument());
    const initialRuntime = registry.get({ ownerScope: scope, token: TestWidget });

    view.rerender(createTree('replayed'));
    await waitFor(() => expect(acquire.mock.calls.length).toBeGreaterThanOrEqual(2));

    expect(new Set(acquire.mock.results.map((result) => result.value.runtime)).size).toBe(1);
    expect(registry.get({ ownerScope: scope, token: TestWidget })).toBe(initialRuntime);

    view.unmount();
    await waitFor(() => expect(registry.get({ ownerScope: scope, token: TestWidget })).toBeNull());
    await scope.disposeWidgetRuntimes();
    await scope.disposeProviders();
    scope.dispose();
  });
});
