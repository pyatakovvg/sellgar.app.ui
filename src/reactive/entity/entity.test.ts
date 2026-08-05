import { Expose, plainToInstance, Type } from 'class-transformer';
import { autorun, isObservableProp } from 'mobx';

import { Entity, EntityCollection, getEntityIdentity, getEntityMetadata, isEntityConstructor } from './declaration';
import { insertEntity, removeEntity, updateEntity } from './update';

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

  it('сохраняет независимые атомы для разных полей', () => {
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

  it('читает identity после заполнения сущности', () => {
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

  it('автоматически обновляет все созданные instances с одинаковой identity', () => {
    @Entity()
    class TerminalEntity {
      id: string;
      status: string;
    }

    const first = new TerminalEntity();
    const second = new TerminalEntity();
    const another = new TerminalEntity();
    first.id = 'terminal-42';
    first.status = 'offline';
    second.id = 'terminal-42';
    second.status = 'offline';
    another.id = 'terminal-24';
    another.status = 'offline';

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

    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';
    terminal.location = 'Moscow';
    terminal.status = 'offline';
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

    const terminal = new TerminalEntity();
    terminal.id = 'terminal-42';
    terminal.status = 'offline';

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

    const existingTerminal = new TerminalEntity();
    existingTerminal.id = 'terminal-42';
    existingTerminal.status = 'offline';
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

  it('добавляет entity во все живые коллекции без передачи экземпляра коллекции', () => {
    @Entity()
    class IncidentEntity {
      @Expose()
      id: string;

      @Expose()
      status: string;
    }

    @EntityCollection({ entity: IncidentEntity, property: 'items' })
    class IncidentsEntity {
      @Expose()
      @Type(() => IncidentEntity)
      items: IncidentEntity[];
    }

    const first = plainToInstance(IncidentsEntity, {
      items: [{ id: 'incident-1', status: 'new' }],
    });
    const second = plainToInstance(IncidentsEntity, {
      items: [{ id: 'incident-2', status: 'new' }],
    });
    const incident = plainToInstance(IncidentEntity, {
      id: 'incident-3',
      status: 'new',
    });

    insertEntity(IncidentEntity, incident, { position: 'start' });

    expect(first.items.map(({ id }) => id)).toEqual(['incident-3', 'incident-1']);
    expect(second.items.map(({ id }) => id)).toEqual(['incident-3', 'incident-2']);
  });

  it('добавляет entity только в коллекции с совпадающим scopeBy', () => {
    @Entity()
    class MessageEntity {
      @Expose()
      chatId: string;

      @Expose()
      id: string;

      @Expose()
      text: string;
    }

    @EntityCollection({ entity: MessageEntity, property: 'items', scopeBy: 'chatId' })
    class MessageHistoryEntity {
      @Expose()
      chatId: string;

      @Expose()
      @Type(() => MessageEntity)
      items: MessageEntity[];
    }

    const first = plainToInstance(MessageHistoryEntity, {
      chatId: 'chat-1',
      items: [],
    });
    const second = plainToInstance(MessageHistoryEntity, {
      chatId: 'chat-2',
      items: [],
    });
    const message = plainToInstance(MessageEntity, {
      chatId: 'chat-1',
      id: 'message-1',
      text: 'Message',
    });

    insertEntity(MessageEntity, message);

    expect(first.items).toEqual([message]);
    expect(second.items).toEqual([]);
  });

  it('совмещает реактивную entity и scoped-коллекцию вложенных entities', () => {
    @Entity()
    class TransactionEntity {
      @Expose()
      id: string;

      @Expose()
      operationId: string;
    }

    @EntityCollection({
      entity: TransactionEntity,
      property: 'transactions',
      scopeBy: {
        entity: 'operationId',
        owner: 'id',
      },
    })
    @Entity()
    class OperationEntity {
      @Expose()
      id: string;

      @Expose()
      status: string;

      @Expose()
      @Type(() => TransactionEntity)
      transactions: TransactionEntity[];
    }

    const first = plainToInstance(OperationEntity, {
      id: 'operation-1',
      status: 'pending',
      transactions: [],
    });
    const second = plainToInstance(OperationEntity, {
      id: 'operation-2',
      status: 'pending',
      transactions: [],
    });
    const transaction = plainToInstance(TransactionEntity, {
      id: 'transaction-1',
      operationId: 'operation-1',
    });

    updateEntity(OperationEntity, {
      id: 'operation-1',
      status: 'completed',
    });
    insertEntity(TransactionEntity, transaction);

    expect(first.status).toBe('completed');
    expect(first.transactions).toEqual([transaction]);
    expect(second.status).toBe('pending');
    expect(second.transactions).toEqual([]);
  });

  it('обновляет entity с существующей identity без повторного добавления', () => {
    @Entity()
    class IncidentEntity {
      id: string;
      status: string;
    }

    @EntityCollection({ entity: IncidentEntity, property: 'items' })
    class IncidentsEntity {
      items: IncidentEntity[];
    }

    const existing = Object.assign(new IncidentEntity(), { id: 'incident-1', status: 'new' });
    const duplicate = Object.assign(new IncidentEntity(), { id: 'incident-1', status: 'inProgress' });
    const incidents = Object.assign(new IncidentsEntity(), { items: [existing] });

    insertEntity(IncidentEntity, duplicate);

    expect(incidents.items).toEqual([existing]);
    expect(existing.status).toBe('inProgress');
  });

  it('удаляет entity из всех живых коллекций по identity data', () => {
    @Entity({ identity: 'incidentId' })
    class IncidentEntity {
      incidentId: string;
    }

    @EntityCollection({ entity: IncidentEntity, property: 'items' })
    class IncidentsEntity {
      items: IncidentEntity[];
    }

    const removed = Object.assign(new IncidentEntity(), { incidentId: 'incident-1' });
    const retained = Object.assign(new IncidentEntity(), { incidentId: 'incident-2' });
    const first = Object.assign(new IncidentsEntity(), { items: [removed, retained] });
    const second = Object.assign(new IncidentsEntity(), { items: [removed] });

    removeEntity(IncidentEntity, { incidentId: 'incident-1' });

    expect(first.items).toEqual([retained]);
    expect(second.items).toEqual([]);
  });

  it('уведомляет reactions при изменении состава entity collection', () => {
    @Entity()
    class IncidentEntity {
      id: string;
    }

    @EntityCollection({ entity: IncidentEntity, property: 'items' })
    class IncidentsEntity {
      items: IncidentEntity[];
    }

    const incidents = Object.assign(new IncidentsEntity(), { items: [] });
    const sizes: number[] = [];
    const disposeReaction = autorun(() => sizes.push(incidents.items.length));

    insertEntity(IncidentEntity, Object.assign(new IncidentEntity(), { id: 'incident-1' }));
    removeEntity(IncidentEntity, { id: 'incident-1' });

    expect(sizes).toEqual([0, 1, 0]);

    disposeReaction();
  });
});
