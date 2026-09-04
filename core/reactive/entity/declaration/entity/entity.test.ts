import { Expose, plainToInstance, Type } from 'class-transformer';
import { autorun, isObservableProp } from 'mobx';

import { updateEntity } from '../../operation/update-entity';
import { Entity, getEntityIdentity, getEntityMetadata, isEntityConstructor } from './entity.ts';

describe('Entity', () => {
  it('делает объявленные поля наблюдаемыми без property-декораторов', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      status: string;
    }

    const terminal = new TerminalEntity();

    expect(isObservableProp(terminal, 'id')).toBe(true);
    expect(isObservableProp(terminal, 'status')).toBe(true);
  });

  it('сохраняет независимые atoms для разных полей', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      status: string;
      location: string;
    }

    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';
    const statuses: Array<string | undefined> = [];
    const locations: Array<string | undefined> = [];
    const disposeStatus = autorun(() => statuses.push(terminal.status));
    const disposeLocation = autorun(() => locations.push(terminal.location));

    updateEntity(TerminalEntity, {
      id: terminal.id,
      status: 'online',
    });

    expect(statuses).toEqual([undefined, 'online']);
    expect(locations).toEqual([undefined]);

    disposeStatus();
    disposeLocation();
  });

  it('регистрирует identity после гидратации сущности', () => {
    @Entity({ identity: 'terminalId' })
    class TerminalEntity {
      status: string;
      terminalId: string;
    }

    const terminal = new TerminalEntity();

    expect(() => getEntityIdentity(terminal)).toThrow(
      'Identity реактивной сущности должен быть строкой или числом: terminalId.',
    );

    terminal.terminalId = 'terminal-42';

    expect(getEntityIdentity(terminal)).toBe('terminal-42');

    updateEntity(TerminalEntity, {
      status: 'online',
      terminalId: 'terminal-42',
    });

    expect(terminal.status).toBe('online');
  });

  it('обновляет все живые instances с одинаковой identity', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      status: string;
    }

    const first = Object.assign(new TerminalEntity(), { id: 'terminal-42', status: 'offline' });
    const second = Object.assign(new TerminalEntity(), { id: 'terminal-42', status: 'offline' });
    const another = Object.assign(new TerminalEntity(), { id: 'terminal-24', status: 'offline' });

    updateEntity(TerminalEntity, {
      id: 'terminal-42',
      status: 'online',
    });

    expect(first.status).toBe('online');
    expect(second.status).toBe('online');
    expect(another.status).toBe('offline');
  });

  it('применяет поля одного update атомарно', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      location: string;
      status: string;
    }

    const terminal = Object.assign(new TerminalEntity(), {
      id: 'terminal-42',
      location: 'Moscow',
      status: 'offline',
    });
    const snapshots: string[] = [];
    const disposeReaction = autorun(() => snapshots.push(`${terminal.status}:${terminal.location}`));

    updateEntity(TerminalEntity, {
      id: terminal.id,
      location: 'Kazan',
      status: 'online',
    });

    expect(snapshots).toEqual(['offline:Moscow', 'online:Kazan']);

    disposeReaction();
  });

  it('не позволяет изменить identity созданного instance', () => {
    @Entity()
    class TerminalEntity {
      id: string;
    }

    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';

    expect(() => {
      terminal.id = 'terminal-24';
    }).toThrow('Identity реактивной сущности нельзя изменить: id.');
    expect(terminal.id).toBe('terminal-42');
  });

  it('отклоняет поле, не объявленное в entity class', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      status: string;
    }

    const terminal = Object.assign(new TerminalEntity(), { id: 'terminal-42', status: 'offline' });

    expect(() =>
      updateEntity(TerminalEntity, {
        id: terminal.id,
        missing: 'value',
      } as Partial<TerminalEntity>),
    ).toThrow('Поле обновления не объявлено в TerminalEntity: missing.');
    expect(terminal.status).toBe('offline');
  });

  it('требует объявленное scalar identity-поле', () => {
    // @ts-expect-error В классе нет указанного identity-поля.
    @Entity({ identity: 'terminalId' })
    class InvalidEntity {
      id: string;
    }

    expect(InvalidEntity).toBeDefined();
  });

  it('сохраняет metadata и property mapping class-transformer', () => {
    class LocationEntity {
      @Expose()
      address: string;
    }

    @Entity()
    class TerminalEntity {
      @Expose()
      id: string;

      @Expose()
      status: string;

      @Expose()
      @Type(() => LocationEntity)
      location: LocationEntity;
    }

    const existingTerminal = Object.assign(new TerminalEntity(), {
      id: 'terminal-42',
      status: 'offline',
    });
    const terminal = plainToInstance(
      TerminalEntity,
      {
        id: 'terminal-42',
        ignored: 'value',
        location: {
          address: 'Main street',
        },
        status: 'online',
      },
      { excludeExtraneousValues: true },
    );

    expect(terminal).toEqual(
      expect.objectContaining({
        id: 'terminal-42',
        location: expect.any(LocationEntity),
        status: 'online',
      }),
    );
    expect('ignored' in terminal).toBe(false);
    expect(isObservableProp(terminal, 'id')).toBe(true);
    expect(isObservableProp(terminal, 'status')).toBe(true);
    expect(isEntityConstructor(TerminalEntity)).toBe(true);
    expect(getEntityMetadata(TerminalEntity).identity).toBe('id');
    expect(getEntityIdentity(terminal)).toBe('terminal-42');

    updateEntity(TerminalEntity, terminal);

    expect(terminal.status).toBe('online');
    expect(existingTerminal.status).toBe('online');
  });
});
