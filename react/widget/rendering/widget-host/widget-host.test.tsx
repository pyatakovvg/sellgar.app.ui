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
