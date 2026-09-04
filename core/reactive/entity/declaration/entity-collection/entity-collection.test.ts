import { Expose, plainToInstance, Type } from 'class-transformer';
import { autorun } from 'mobx';

import { insertEntity } from '../../operation/insert-entity';
import { removeEntity } from '../../operation/remove-entity';
import { updateEntity } from '../../operation/update-entity';
import { Entity } from '../entity';
import { EntityCollection } from './entity-collection.ts';

describe('EntityCollection', () => {
  it('добавляет entity во все живые коллекции', () => {
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

  it('совмещает reactive entity и scoped-коллекцию вложенных entities', () => {
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
