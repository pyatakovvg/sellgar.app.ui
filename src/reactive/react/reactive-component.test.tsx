import { act, render, screen } from '@testing-library/react';

import React from 'react';

import { Entity, updateEntity } from '../entity';

import { Reactive } from './reactive-component';

describe('Reactive', () => {
  it('перерисовывает только содержимое реактивной границы', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      name: string;
    }

    const parentRender = vi.fn();
    const staticRender = vi.fn();
    const reactiveRender = vi.fn();
    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';
    terminal.name = 'Terminal 42';

    const StaticContent = () => {
      staticRender();

      return <span>Static content</span>;
    };
    const Parent = () => {
      parentRender();

      return (
        <>
          <StaticContent />
          <Reactive>
            {() => {
              reactiveRender();

              return <span>{terminal.name}</span>;
            }}
          </Reactive>
        </>
      );
    };

    render(<Parent />);

    expect(parentRender).toHaveBeenCalledTimes(1);
    expect(staticRender).toHaveBeenCalledTimes(1);
    expect(reactiveRender).toHaveBeenCalledTimes(1);

    act(() => {
      updateEntity(TerminalEntity, {
        id: terminal.id,
        name: 'Updated terminal',
      });
    });

    expect(screen.getByText('Updated terminal')).toBeInTheDocument();
    expect(parentRender).toHaveBeenCalledTimes(1);
    expect(staticRender).toHaveBeenCalledTimes(1);
    expect(reactiveRender).toHaveBeenCalledTimes(2);
  });
});
