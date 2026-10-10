import { Expose, Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { MetricEvent } from '../../declaration/metric-event';
import { prepareMetricEvent } from './metric-event-preparation';

class Details {
  @IsString()
  label!: string;
}

class BaseEvent {
  @IsString()
  id!: string;
}

@MetricEvent('test.completed')
class CompletedEvent extends BaseEvent {
  @IsInt()
  amount!: number;

  @IsOptional()
  @IsString()
  note?: string;

  @Type(() => Details)
  @ValidateNested()
  details!: Details;
}

describe('metric event preparation', () => {
  it('projects declared nested object and array fields while retaining defaults, inherited fields and records', async () => {
    class BaseDetails {
      inherited!: string;
    }
    class Child {
      @IsString()
      name!: string;
    }
    class Item extends BaseDetails {
      @IsString()
      label!: string;
      declaredWithoutValidator!: number;
      defaultValue = 'default';
      attributes!: Record<string, unknown>;
      @Type(() => Child)
      @ValidateNested()
      child!: Child;
    }
    @MetricEvent('nested.projected')
    class NestedEvent {
      @Type(() => Item)
      @ValidateNested()
      details!: Item;
      @Type(() => Item)
      @ValidateNested({ each: true })
      items!: Item[];
    }
    const item = {
      label: 'item',
      inherited: 'base',
      declaredWithoutValidator: 7,
      attributes: { arbitrary: { nested: 'kept' } },
      undeclaredSecret: 'must not leave core',
      child: { name: 'child', extra: 'not declared' },
    };
    const projected = {
      label: 'item',
      inherited: 'base',
      declaredWithoutValidator: 7,
      defaultValue: 'default',
      attributes: { arbitrary: { nested: 'kept' } },
      child: { name: 'child' },
    };
    expect(await prepareMetricEvent(NestedEvent, { details: item, items: [item] })).toEqual({
      name: 'nested.projected',
      payload: { details: projected, items: [projected] },
    });
    await expect(
      prepareMetricEvent(NestedEvent, { details: item, items: [{ ...item, child: { name: 42 } }] }),
    ).rejects.toBeInstanceOf(Array);
  });

  it.each([false, true])(
    'never executes own functions or exposed methods/getters (toPlainOnly=%s)',
    async (toPlainOnly) => {
      const invoked = vi.fn(() => 'must not be sent');
      class CallableDetails {
        label!: string;
        helper = invoked;
        @Expose({ toPlainOnly })
        method() {
          return invoked();
        }
        @Expose({ toPlainOnly })
        get computed() {
          return invoked();
        }
      }
      @MetricEvent('methods.excluded')
      class CallableEvent extends CallableDetails {
        @Type(() => CallableDetails)
        details!: CallableDetails;
      }
      const result = await prepareMetricEvent(CallableEvent, { label: 'event', details: { label: 'nested' } });
      expect(invoked).not.toHaveBeenCalled();
      expect(result).toEqual({ name: 'methods.excluded', payload: { label: 'event', details: { label: 'nested' } } });
    },
  );

  it('retains explicit input transforms before validation', async () => {
    @MetricEvent('transformed')
    class TransformedEvent {
      @Transform(({ value }) => value.trim(), { toClassOnly: true })
      @IsString()
      label!: string;
    }
    expect(await prepareMetricEvent(TransformedEvent, { label: ' value ' })).toEqual({
      name: 'transformed',
      payload: { label: 'value' },
    });
  });

  it('extracts the declared name and inherited/nested fields without Expose', async () => {
    const event = await prepareMetricEvent(CompletedEvent, {
      id: 'one',
      amount: 1,
      details: { label: 'item' },
      unrelated: 'not payload',
    });
    expect(event).toEqual({ name: 'test.completed', payload: { id: 'one', amount: 1, details: { label: 'item' } } });
  });

  it('snapshots nested input before asynchronous validation', async () => {
    const data = { id: 'one', amount: 1, details: { label: 'before' } };
    const pending = prepareMetricEvent(CompletedEvent, data);
    data.id = 'changed';
    data.details.label = 'after';
    expect((await pending).payload).toMatchObject({ id: 'one', details: { label: 'before' } });
  });

  it.each([
    { amount: 1, details: { label: 'item' } },
    { id: 'one', amount: '1', details: { label: 'item' } },
    { id: 'one', amount: 1, details: { label: 1 } },
    { id: 'one', amount: 1, details: { label: 'item' }, note: 1 },
  ])('rejects invalid data without implicit conversion: %j', async (data) => {
    await expect(prepareMetricEvent(CompletedEvent, data)).rejects.toBeInstanceOf(Array);
  });

  it('rejects undecorated classes, including subclasses without their own event name', async () => {
    class Undeclared extends CompletedEvent {}
    await expect(prepareMetricEvent(Undeclared, {})).rejects.toThrow('@MetricEvent');
  });

  it('rejects an empty name and constructor failures', async () => {
    @MetricEvent(' ')
    class Empty {}
    @MetricEvent('broken')
    class Broken {
      constructor() {
        throw new Error('broken constructor');
      }
    }
    await expect(prepareMetricEvent(Empty, {})).rejects.toThrow('non-empty');
    await expect(prepareMetricEvent(Broken, {})).rejects.toThrow('broken constructor');
  });

  it('rejects cycles and functions without recursing indefinitely', async () => {
    const details: Record<string, unknown> = { label: 'item' };
    details.self = details;
    await expect(prepareMetricEvent(CompletedEvent, { id: 'one', amount: 1, details })).rejects.toThrow('cycles');
    await expect(
      prepareMetricEvent(CompletedEvent, {
        id: 'one',
        amount: 1,
        details: { label: () => 'bad' },
      }),
    ).rejects.toThrow('functions');
  });
});
