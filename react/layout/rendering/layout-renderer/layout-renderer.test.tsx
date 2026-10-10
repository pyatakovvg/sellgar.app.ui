import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import { Layout, type LayoutViewProps } from '../../declaration/layout';
import { renderLayouts } from './layout-renderer';

describe('layout composition', () => {
  it('describes the immediate structural child of each layout', () => {
    @Layout({
      view: ({ children, kind }: LayoutViewProps) => (
        <section data-testid="outer" data-kind={kind}>
          {children}
        </section>
      ),
    })
    class OuterLayout {}
    @Layout({
      view: ({ children, kind }: LayoutViewProps) => (
        <section data-testid="inner" data-kind={kind}>
          {children}
        </section>
      ),
    })
    class InnerLayout {}

    render(renderLayouts([OuterLayout, InnerLayout], <div>module view</div>, 'module'));

    expect(screen.getByTestId('outer')).toHaveAttribute('data-kind', 'layout');
    expect(screen.getByTestId('inner')).toHaveAttribute('data-kind', 'module');
    expect(screen.getByText('module view')).toBeInTheDocument();
  });

  it('passes children and kind to a declared view element while preserving its props', () => {
    const View = ({ children, kind, label }: LayoutViewProps & { readonly label: string }) => (
      <section aria-label={label} data-kind={kind}>
        {children}
      </section>
    );
    @Layout({ view: <View children={null} kind={null} label="shell" /> })
    class ShellLayout {}

    render(renderLayouts([ShellLayout], <div>screen</div>, 'module'));

    expect(screen.getByLabelText('shell')).toHaveAttribute('data-kind', 'module');
    expect(screen.getByText('screen')).toBeInTheDocument();
  });

  it('preserves layout state and DOM identity when the structural child changes', () => {
    const View = ({ children, kind }: LayoutViewProps) => {
      const [count, setCount] = React.useState(0);
      return (
        <section data-kind={kind}>
          <button onClick={() => setCount(count + 1)}>{count}</button>
          {children}
        </section>
      );
    };
    @Layout({ view: View })
    class ShellLayout {}
    const { rerender } = render(renderLayouts([ShellLayout], <div>first screen</div>, 'module'));
    const button = screen.getByRole('button');
    fireEvent.click(button);

    rerender(renderLayouts([ShellLayout], <div>nested layout</div>, 'layout'));

    expect(screen.getByRole('button')).toBe(button);
    expect(button).toHaveTextContent('1');
    expect(button.parentElement).toHaveAttribute('data-kind', 'layout');
  });

  it('uses null when there is no selected structural child', () => {
    @Layout({
      view: ({ children, kind }: LayoutViewProps) => (
        <section data-testid="shell" data-kind={String(kind)}>
          {children}
        </section>
      ),
    })
    class ShellLayout {}
    render(renderLayouts([ShellLayout], <div>loading route</div>, null));
    expect(screen.getByTestId('shell')).toHaveAttribute('data-kind', 'null');
  });
});
