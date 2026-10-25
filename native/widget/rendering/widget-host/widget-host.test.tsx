import { render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SessionRuntimeState } from '../../../../core/application/session/session-runtime-state';
import { ApplicationScope } from '../../../../core/runtime/scope/kind/application-scope';
import { WidgetDefinition } from '../../../../core/widget/declaration/widget';
import { ApplicationComponentsProvider } from '../../../application/rendering/application-components-context';
import { RuntimeScopeProvider } from '../../../runtime/scope/runtime-scope-context';
import { Widget } from '../../declaration/widget';
import { WidgetHost } from './widget-host.tsx';

interface Props {
  readonly value: string;
}

describe('native WidgetHost React bindings', () => {
  it('renders accepted props once and skips unchanged parent renders', async () => {
    const rendered = vi.fn(({ value }: Props) => <span>{value}</span>);
    @Widget<Props>({ view: rendered })
    class Token extends WidgetDefinition<Props> {}
    const scope = new ApplicationScope();
    scope.bindSession(new SessionRuntimeState());
    const components = {};
    const tree = (props: Props) => (
      <ApplicationComponentsProvider components={components}>
        <RuntimeScopeProvider scope={scope}>
          <WidgetHost token={Token} props={props} />
        </RuntimeScopeProvider>
      </ApplicationComponentsProvider>
    );
    const next = { value: 'second' };
    const view = render(tree({ value: 'first' }));
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
});
