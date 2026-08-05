import React from 'react';
import { describe, expect, it } from 'vitest';

import { renderView } from './renderable-view.tsx';

describe('renderView', () => {
  it('renders component types', () => {
    const View: React.FC<TestViewProps> = ({ title }) => {
      return <h1>{title}</h1>;
    };

    const result = renderView(View, {
      title: 'Component',
    });

    expect((result as React.ReactElement).type).toBe(View);
    expect((result as React.ReactElement<TestViewProps>).props.title).toBe('Component');
  });

  it('renders existing elements', () => {
    const element = <h1>Element</h1>;

    expect(renderView(element, {})).toBe(element);
  });

  it('renders factory functions with props', () => {
    const result = renderView(
      ({ title }: TestViewProps) => {
        return <h1>{title}</h1>;
      },
      {
        title: 'Factory',
      },
    );

    expect((result as React.ReactElement<TestViewProps>).props.title).toBe('Factory');
  });
});

interface TestViewProps {
  readonly title: string;
}
