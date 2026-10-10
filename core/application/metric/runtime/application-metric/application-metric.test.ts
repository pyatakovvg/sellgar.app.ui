import { IsString, ValidateBy } from 'class-validator';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  Metric,
  type MetricInitializeContext,
  type MetricInterface,
  type MetricPayload,
  type MetricToken,
} from '../../declaration/metric';
import { MetricEvent } from '../../declaration/metric-event';
import { ApplicationMetric } from './application-metric';

@MetricEvent('test.event')
class TestEvent {
  @IsString()
  id!: string;
}

@Metric()
class First implements MetricInterface {
  track(): void {}
}
@Metric()
class Second implements MetricInterface {
  track(): void {}
}

const deferred = () => {
  let resolve!: () => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<void>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const setup = (instances: readonly [MetricToken, MetricInterface][]) => {
  const reporter = { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warning: vi.fn() };
  const runtime = new ApplicationMetric(reporter);
  runtime.activate(
    instances.map(([token]) => token),
    (token) => () => instances.find(([key]) => key === token)![1],
  );
  return { runtime, reporter };
};

afterEach(() => vi.useRealTimers());

describe('application metric runtime', () => {
  it('fans out and routes by token; empty to sends nowhere and duplicates send once', async () => {
    const first = { track: vi.fn() };
    const second = { track: vi.fn() };
    const { runtime } = setup([
      [First, first],
      [Second, second],
    ]);
    runtime.track(TestEvent, { id: 'all' });
    runtime.track(TestEvent, { id: 'first' }, { to: [First, First] });
    runtime.track(TestEvent, { id: 'none' }, { to: [] });
    await flush();
    expect(first.track.mock.calls).toEqual([
      ['test.event', { id: 'all' }],
      ['test.event', { id: 'first' }],
    ]);
    expect(second.track.mock.calls).toEqual([['test.event', { id: 'all' }]]);
    await runtime.dispose();
  });

  it('uses original identity for a configured declaration', async () => {
    @Metric({ token: First })
    class ConfiguredFirst implements MetricInterface {
      track(): void {}
    }
    const adapter = { track: vi.fn() };
    const { runtime } = setup([[ConfiguredFirst, adapter]]);
    runtime.track(TestEvent, { id: 'configured' }, { to: [First] });
    await flush();
    expect(adapter.track).toHaveBeenCalledWith('test.event', { id: 'configured' });
    await runtime.dispose();
  });

  it('preserves the original token for a decorated configured subclass', async () => {
    @Metric()
    class ConfiguredFirst extends First {}
    const adapter = { track: vi.fn() };
    const { runtime } = setup([[ConfiguredFirst, adapter]]);
    runtime.track(TestEvent, { id: 'subclass' }, { to: [First] });
    await flush();
    expect(adapter.track).toHaveBeenCalledWith('test.event', { id: 'subclass' });
    await runtime.dispose();
  });

  it('reports unknown recipients and preserves known ones', async () => {
    const adapter = { track: vi.fn() };
    const { runtime, reporter } = setup([[First, adapter]]);
    runtime.track(TestEvent, { id: 'one' }, { to: [First, Second] });
    await flush();
    expect(adapter.track).toHaveBeenCalledOnce();
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.routing.failed' }));
    await runtime.dispose();
  });

  it('validates once and reports without throwing or delivering invalid data', async () => {
    const first = { track: vi.fn() };
    const second = { track: vi.fn() };
    const { runtime, reporter } = setup([
      [First, first],
      [Second, second],
    ]);
    expect(() => runtime.track(TestEvent, { id: 5 as unknown as string })).not.toThrow();
    await flush();
    expect(first.track).not.toHaveBeenCalled();
    expect(second.track).not.toHaveBeenCalled();
    expect(reporter.error).toHaveBeenCalledTimes(1);
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.prepare.failed' }));
    await runtime.dispose();
  });

  it('isolates payloads from a mutating adapter and caller', async () => {
    @MetricEvent('nested')
    class NestedEvent {
      details!: { id: string };
    }
    const first = {
      track: vi.fn((_name: string, payload: MetricPayload) => {
        (payload.details as { id: string }).id = 'mutated';
      }),
    };
    const second = { track: vi.fn() };
    const { runtime } = setup([
      [First, first],
      [Second, second],
    ]);
    const details = { id: 'original' };
    runtime.track(NestedEvent, { details });
    details.id = 'caller changed';
    await flush();
    expect(second.track).toHaveBeenCalledWith('nested', { details: { id: 'original' } });
    await runtime.dispose();
  });

  it('buffers at most 150 pending events and drops the oldest while another receiver works', async () => {
    const ready = deferred();
    const first = { initialize: () => ready.promise, track: vi.fn() };
    const second = { track: vi.fn() };
    const { runtime, reporter } = setup([
      [First, first],
      [Second, second],
    ]);
    for (let i = 0; i < 151; i++) {
      runtime.track(TestEvent, { id: String(i) });
      await flush();
    }
    expect(first.track).not.toHaveBeenCalled();
    expect(second.track).toHaveBeenCalledTimes(151);
    ready.resolve();
    await vi.waitFor(() => expect(first.track).toHaveBeenCalledTimes(150));
    expect(first.track.mock.calls[0]).toEqual(['test.event', { id: '1' }]);
    expect(first.track.mock.calls.at(-1)).toEqual(['test.event', { id: '150' }]);
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.overflow.failed' }));
    await runtime.dispose();
  });

  it('preserves order for asynchronous validation completing out of order', async () => {
    const slow = deferred();
    @MetricEvent('validated')
    class Validated {
      @ValidateBy({
        name: 'wait',
        async: true,
        validator: { validate: (value: string) => (value === 'first' ? slow.promise.then(() => true) : true) },
      })
      id!: string;
    }
    const adapter = { track: vi.fn() };
    const { runtime } = setup([[First, adapter]]);
    runtime.track(Validated, { id: 'first' });
    runtime.track(Validated, { id: 'second' });
    await flush();
    expect(adapter.track).not.toHaveBeenCalled();
    slow.resolve();
    await flush();
    expect(adapter.track.mock.calls).toEqual([
      ['validated', { id: 'first' }],
      ['validated', { id: 'second' }],
    ]);
    await runtime.dispose();
  });

  it('does not let an invalid event evict an already validated pending event', async () => {
    const ready = deferred();
    const adapter = { initialize: () => ready.promise, track: vi.fn() };
    const { runtime, reporter } = setup([[First, adapter]]);
    for (let i = 0; i < 150; i++) {
      runtime.track(TestEvent, { id: String(i) });
      await flush();
    }
    runtime.track(TestEvent, { id: 5 as unknown as string });
    await flush();
    ready.resolve();
    await vi.waitFor(() => expect(adapter.track).toHaveBeenCalledTimes(150));
    expect(adapter.track.mock.calls[0]).toEqual(['test.event', { id: '0' }]);
    expect(reporter.error.mock.calls.filter(([report]) => report.event === 'metric.overflow.failed')).toHaveLength(0);
    expect(reporter.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'metric.prepare.failed',
        context: expect.objectContaining({ metricEvent: 'test.event' }),
      }),
    );
    await runtime.dispose();
  });

  it('bounds pending preparation and keeps an unrelated receiver independent', async () => {
    const validation = deferred();
    const validate = vi.fn(() => validation.promise.then(() => true));
    @MetricEvent('slow.validation')
    class SlowEvent {
      @ValidateBy({ name: 'slow', async: true, validator: { validate } })
      id!: string;
    }
    const first = { track: vi.fn() };
    const second = { track: vi.fn() };
    const { runtime, reporter } = setup([
      [First, first],
      [Second, second],
    ]);
    await flush();
    for (let i = 0; i < 153; i++) runtime.track(SlowEvent, { id: String(i) }, { to: [First] });
    expect(validate).toHaveBeenCalledTimes(151);
    runtime.track(TestEvent, { id: 'independent' }, { to: [Second] });
    await flush();
    expect(second.track).toHaveBeenCalledWith('test.event', { id: 'independent' });
    expect(first.track).not.toHaveBeenCalled();
    expect(reporter.error.mock.calls.filter(([report]) => report.event === 'metric.overflow.failed')).toHaveLength(2);
    validation.resolve();
    await vi.waitFor(() => expect(first.track).toHaveBeenCalledTimes(151));
    expect(first.track.mock.calls[0]).toEqual(['slow.validation', { id: '0' }]);
    expect(first.track.mock.calls.at(-1)).toEqual(['slow.validation', { id: '150' }]);
    await runtime.dispose();
  });

  it('uses the same shutdown budget for pending preparation, delivery and cleanup', async () => {
    vi.useFakeTimers();
    const validation = deferred();
    const delivery = deferred();
    const cleanup = deferred();
    @MetricEvent('shutdown.validation')
    class SlowEvent {
      @ValidateBy({ name: 'slow', async: true, validator: { validate: () => validation.promise.then(() => true) } })
      id!: string;
    }
    const adapter = { track: vi.fn(() => delivery.promise), dispose: vi.fn(() => cleanup.promise) };
    const { runtime } = setup([[First, adapter]]);
    await flush();
    runtime.track(SlowEvent, { id: 'accepted' });
    const stopped = runtime.dispose();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(adapter.dispose).not.toHaveBeenCalled();
    validation.resolve();
    await flush();
    expect(adapter.track).toHaveBeenCalledWith('shutdown.validation', { id: 'accepted' });
    await vi.advanceTimersByTimeAsync(1_000);
    await stopped;
    expect(adapter.dispose).toHaveBeenCalledOnce();
    delivery.reject(new Error('late delivery'));
    cleanup.reject(new Error('late cleanup'));
    await flush();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('shares the waiting capacity between prepared events and pending validation', async () => {
    const ready = deferred();
    const validation = deferred();
    const validate = vi.fn(() => validation.promise.then(() => true));
    @MetricEvent('waiting.validation')
    class SlowEvent {
      @ValidateBy({ name: 'waiting', async: true, validator: { validate } })
      id!: string;
    }
    const adapter = { initialize: () => ready.promise, track: vi.fn() };
    const { runtime, reporter } = setup([[First, adapter]]);
    for (let i = 0; i < 140; i++) {
      runtime.track(TestEvent, { id: String(i) });
      await flush();
    }
    for (let i = 0; i < 12; i++) runtime.track(SlowEvent, { id: String(i) });
    expect(validate).toHaveBeenCalledTimes(11);
    expect(reporter.error.mock.calls.filter(([report]) => report.event === 'metric.overflow.failed')).toHaveLength(1);
    validation.resolve();
    await vi.waitFor(() =>
      expect(reporter.error.mock.calls.filter(([report]) => report.event === 'metric.overflow.failed')).toHaveLength(2),
    );
    ready.resolve();
    await vi.waitFor(() => expect(adapter.track).toHaveBeenCalledTimes(150));
    expect(adapter.track.mock.calls[0]).toEqual(['test.event', { id: '1' }]);
    expect(adapter.track.mock.calls.at(-1)).toEqual(['waiting.validation', { id: '10' }]);
    await runtime.dispose();
  });

  it('waits for preparation restarted in the completion microtask before shutdown', async () => {
    const validation = deferred();
    const shutdownStarted = deferred();
    @MetricEvent('last.validation')
    class SlowEvent {
      @ValidateBy({ name: 'last', async: true, validator: { validate: () => validation.promise.then(() => true) } })
      id!: string;
    }
    let stopped!: Promise<void>;
    const adapter = {
      track: vi.fn((name: string) => {
        if (name !== 'test.event') return;
        queueMicrotask(() => {
          runtime.track(SlowEvent, { id: 'last' });
          stopped = runtime.dispose();
          shutdownStarted.resolve();
        });
      }),
      dispose: vi.fn(),
    };
    const { runtime } = setup([[First, adapter]]);
    await flush();
    runtime.track(TestEvent, { id: 'first' });
    await shutdownStarted.promise;
    await flush();
    expect(adapter.dispose).not.toHaveBeenCalled();
    validation.resolve();
    await stopped;
    expect(adapter.track.mock.calls.map(([name]) => name)).toEqual(['test.event', 'last.validation']);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it('reports synchronous and asynchronous delivery errors without retries or blocking others', async () => {
    const first = {
      track: vi
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('sync');
        })
        .mockRejectedValueOnce(new Error('async')),
    };
    const second = { track: vi.fn() };
    const { runtime, reporter } = setup([
      [First, first],
      [Second, second],
    ]);
    for (const id of ['one', 'two', 'three']) runtime.track(TestEvent, { id });
    await flush();
    expect(first.track).toHaveBeenCalledTimes(3);
    expect(second.track).toHaveBeenCalledTimes(3);
    expect(reporter.error.mock.calls.filter(([report]) => report.event === 'metric.delivery.failed')).toHaveLength(2);
    await runtime.dispose();
  });

  it('disables a failed initializer, still disposes it and leaves the other receiver working', async () => {
    const first = { initialize: vi.fn().mockRejectedValue(new Error('init')), track: vi.fn(), dispose: vi.fn() };
    const second = { track: vi.fn() };
    const { runtime, reporter } = setup([
      [First, first],
      [Second, second],
    ]);
    runtime.track(TestEvent, { id: 'queued' });
    await flush();
    runtime.track(TestEvent, { id: 'later' });
    await flush();
    expect(first.track).not.toHaveBeenCalled();
    expect(second.track).toHaveBeenCalledTimes(2);
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.initialize.failed' }));
    await runtime.dispose();
    expect(first.dispose).toHaveBeenCalledOnce();
  });

  it('reports duplicate and undecorated registrations and resolves only the first', async () => {
    class Undeclared {
      track(): void {}
    }
    const reporter = { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const runtime = new ApplicationMetric(reporter);
    const adapter = { track: vi.fn() };
    const bind = vi.fn(() => () => adapter);
    runtime.activate([First, First, Undeclared], bind);
    runtime.track(TestEvent, { id: 'one' });
    await flush();
    expect(bind).toHaveBeenCalledTimes(1);
    expect(reporter.error).toHaveBeenCalledTimes(2);
    expect(adapter.track).toHaveBeenCalledOnce();
    await runtime.dispose();
  });

  it('contains binding and constructor failures', async () => {
    const reporter = { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warning: vi.fn() };
    const runtime = new ApplicationMetric(reporter);
    expect(() =>
      runtime.activate([First, Second], (token) => {
        if (token === First) throw new Error('bindings');
        return () => {
          throw new Error('constructor');
        };
      }),
    ).not.toThrow();
    await flush();
    expect(reporter.error).toHaveBeenCalledTimes(2);
    await runtime.dispose();
  });

  it('drains accepted events before dispose, rejects new work and cleans up once', async () => {
    const delivery = deferred();
    const adapter = { track: vi.fn().mockImplementationOnce(() => delivery.promise), dispose: vi.fn() };
    const { runtime } = setup([[First, adapter]]);
    runtime.track(TestEvent, { id: 'one' });
    runtime.track(TestEvent, { id: 'two' });
    await flush();
    const stopped = runtime.dispose();
    expect(runtime.dispose()).toBe(stopped);
    runtime.track(TestEvent, { id: 'late' });
    expect(adapter.dispose).not.toHaveBeenCalled();
    delivery.resolve();
    await stopped;
    expect(adapter.track.mock.calls).toEqual([
      ['test.event', { id: 'one' }],
      ['test.event', { id: 'two' }],
    ]);
    expect(adapter.dispose).toHaveBeenCalledOnce();
  });

  it('bounds hung delivery and cleanup by one 2 second deadline', async () => {
    vi.useFakeTimers();
    const delivery = deferred();
    const cleanup = deferred();
    const adapter = { track: vi.fn(() => delivery.promise), dispose: vi.fn(() => cleanup.promise) };
    const { runtime, reporter } = setup([[First, adapter]]);
    runtime.track(TestEvent, { id: 'one' });
    runtime.track(TestEvent, { id: 'two' });
    await flush();
    const stopped = runtime.dispose();
    await vi.advanceTimersByTimeAsync(2_000);
    await stopped;
    expect(adapter.dispose).toHaveBeenCalledOnce();
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.dispose.failed' }));
    delivery.reject(new Error('late delivery'));
    cleanup.reject(new Error('late cleanup'));
    await flush();
    expect(adapter.track).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('aborts initialization and never delivers after a late initialization result', async () => {
    const ready = deferred();
    let signal!: AbortSignal;
    const adapter = {
      initialize: vi.fn((context: MetricInitializeContext) => {
        signal = context.signal;
        return ready.promise;
      }),
      track: vi.fn(),
      dispose: vi.fn(),
    };
    const { runtime } = setup([[First, adapter]]);
    runtime.track(TestEvent, { id: 'pending' });
    await runtime.dispose();
    expect(signal.aborted).toBe(true);
    expect(adapter.dispose).toHaveBeenCalledOnce();
    ready.resolve();
    await flush();
    expect(adapter.track).not.toHaveBeenCalled();
  });

  it('is safe without recipients and when diagnostics themselves throw', async () => {
    const { runtime, reporter } = setup([]);
    reporter.error.mockImplementation(() => {
      throw new Error('reporter');
    });
    expect(() => runtime.track(TestEvent, { id: 'none' })).not.toThrow();
    expect(() => runtime.track(TestEvent, { id: 'unknown' }, { to: [First] })).not.toThrow();
    await runtime.dispose();
  });

  it('keeps the pending queue bounded behind an in-flight delivery', async () => {
    const pending = deferred();
    const adapter = { track: vi.fn().mockImplementationOnce(() => pending.promise) };
    const { runtime, reporter } = setup([[First, adapter]]);
    runtime.track(TestEvent, { id: 'in-flight' });
    await flush();
    for (let i = 0; i < 151; i++) runtime.track(TestEvent, { id: String(i) });
    expect(adapter.track).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.overflow.failed' })),
    );
    pending.resolve();
    await vi.waitFor(() => expect(adapter.track).toHaveBeenCalledTimes(151));
    expect(adapter.track.mock.calls[1]).toEqual(['test.event', { id: '1' }]);
    expect(reporter.error).toHaveBeenCalledWith(expect.objectContaining({ event: 'metric.overflow.failed' }));
    await runtime.dispose();
  });
});
