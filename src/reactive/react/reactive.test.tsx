import { act, render, screen } from '@testing-library/react';

import React from 'react';

import { Entity, updateEntity } from '../entity';

import { reactive } from './reactive';

describe('reactive', () => {
  it('перерисовывает только компонент, прочитавший изменённое поле entity', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      location: string;
      status: string;
    }

    interface TerminalProps {
      readonly terminal: TerminalEntity;
    }

    const renderStatus = vi.fn();
    const renderLocation = vi.fn();
    const TerminalStatus = reactive<TerminalProps>(({ terminal }) => {
      renderStatus();

      return <span>{terminal.status}</span>;
    });
    const TerminalLocation = reactive<TerminalProps>(({ terminal }) => {
      renderLocation();

      return <span>{terminal.location}</span>;
    });
    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';
    terminal.location = 'Moscow';
    terminal.status = 'offline';

    render(
      <>
        <TerminalStatus terminal={terminal} />
        <TerminalLocation terminal={terminal} />
      </>,
    );

    const statusRenderCount = renderStatus.mock.calls.length;
    const locationRenderCount = renderLocation.mock.calls.length;

    act(() => {
      updateEntity(TerminalEntity, {
        id: terminal.id,
        status: 'online',
      });
    });

    expect(screen.getByText('online')).toBeInTheDocument();
    expect(screen.getByText('Moscow')).toBeInTheDocument();
    expect(renderStatus).toHaveBeenCalledTimes(statusRenderCount + 1);
    expect(renderLocation).toHaveBeenCalledTimes(locationRenderCount);
  });
});
