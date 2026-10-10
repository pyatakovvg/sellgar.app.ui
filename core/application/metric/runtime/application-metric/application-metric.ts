import { Inject, Injectable } from '../../../../di/injection/decorators';
import { ApplicationReporterInterface } from '../../../reporting/application-report';
import { getMetricToken, type MetricInterface, type MetricPayload, type MetricToken } from '../../declaration/metric';
import { getMetricEventName, type MetricEventConstructor, type MetricEventData } from '../../declaration/metric-event';
import { ApplicationMetricInterface, type MetricTrackOptions } from '../../service/application-metric';
import { cloneMetricValue, prepareMetricEvent, type PreparedMetricEvent } from '../metric-event-preparation';

interface MetricReceiver {
  readonly token: MetricToken;
  readonly controller: AbortController;
  readonly pending: Promise<PreparedMetricEvent | null>[];
  readonly queue: PreparedMetricEvent[];
  state: 'initializing' | 'ready' | 'failed' | 'disposed';
  instance?: MetricInterface;
  preparation?: Promise<void>;
  delivery?: Promise<void>;
}

const QUEUE_CAPACITY = 150;
const SHUTDOWN_TIMEOUT_MS = 2_000;

@Injectable()
export class ApplicationMetric implements ApplicationMetricInterface {
  private readonly receivers = new Map<MetricToken, MetricReceiver>();
  private activated = false;
  private accepting = true;
  private disposed = false;
  private disposal?: Promise<void>;

  constructor(@Inject(ApplicationReporterInterface) private readonly reporter: ApplicationReporterInterface) {}

  activate(declarations: readonly MetricToken[], bind: (declaration: MetricToken) => () => MetricInterface): void {
    if (this.activated || !this.accepting) return;
    this.activated = true;
    const factories = new Map<MetricReceiver, () => MetricInterface>();

    for (const declaration of declarations) {
      try {
        const token = getMetricToken(declaration);
        if (!token || typeof token !== 'function') {
          this.report('declaration', new Error('Metric class must be decorated with @Metric().'));
          continue;
        }
        if (this.receivers.has(token)) {
          this.report('declaration', new Error('Metric token is registered more than once.'), token);
          continue;
        }
        const receiver: MetricReceiver = {
          token,
          controller: new AbortController(),
          pending: [],
          queue: [],
          state: 'initializing',
        };
        this.receivers.set(token, receiver);
        try {
          factories.set(receiver, bind(declaration));
        } catch (cause) {
          receiver.state = 'failed';
          this.report('resolve', cause, token);
        }
      } catch (cause) {
        this.report('declaration', cause);
      }
    }

    // All bindings and receiver identities exist before any constructor/initialize runs.
    for (const [receiver, factory] of factories) {
      void this.initialize(receiver, factory);
    }
  }

  track<TEvent extends object>(
    event: MetricEventConstructor<TEvent>,
    data: NoInfer<MetricEventData<TEvent>>,
    options?: MetricTrackOptions,
  ): void {
    if (!this.accepting) return;
    try {
      const selected =
        options?.to === undefined
          ? [...this.receivers.values()]
          : [...new Set(options.to)].flatMap((token) => {
              const receiver = this.receivers.get(token);
              if (!receiver) this.report('routing', new Error('Metric receiver is not registered.'), token);
              return receiver ? [receiver] : [];
            });
      const receivers = selected.filter((receiver) => {
        if (receiver.state !== 'initializing' && receiver.state !== 'ready') return false;
        if (!receiver.preparation || receiver.pending.length + receiver.queue.length < QUEUE_CAPACITY) return true;
        this.report(
          'overflow',
          new Error('Metric preparation capacity exceeded; incoming event dropped.'),
          receiver.token,
        );
        return false;
      });
      if (!receivers.length) return;

      const eventName = getMetricEventName(event);
      const prepared = prepareMetricEvent(event, data).catch((cause) => {
        this.report('prepare', cause, undefined, eventName);
        return null;
      });
      for (const receiver of receivers) {
        receiver.pending.push(prepared);
        this.prepare(receiver);
      }
    } catch (cause) {
      this.report('track', cause);
    }
  }

  dispose(): Promise<void> {
    if (this.disposal) return this.disposal;
    this.accepting = false;
    this.disposal = this.shutdown();
    return this.disposal;
  }

  private async initialize(receiver: MetricReceiver, factory: () => MetricInterface): Promise<void> {
    try {
      receiver.instance = factory();
      await receiver.instance.initialize?.({ signal: receiver.controller.signal });
      if (!this.accepting || receiver.state !== 'initializing') return;
      receiver.state = 'ready';
      this.drain(receiver);
    } catch (cause) {
      if (receiver.state !== 'disposed') receiver.state = 'failed';
      receiver.pending.length = 0;
      receiver.queue.length = 0;
      this.report(receiver.instance ? 'initialize' : 'resolve', cause, receiver.token);
    }
  }

  private prepare(receiver: MetricReceiver): void {
    if (
      (receiver.state !== 'initializing' && receiver.state !== 'ready') ||
      receiver.preparation ||
      !receiver.pending.length
    )
      return;
    receiver.preparation = this.admit(receiver).finally(() => {
      receiver.preparation = undefined;
      this.prepare(receiver);
    });
  }

  private async admit(receiver: MetricReceiver): Promise<void> {
    while (receiver.pending.length) {
      const event = await receiver.pending.shift()!;
      if (receiver.state !== 'initializing' && receiver.state !== 'ready') return;
      if (!event) continue;
      // Only validated events compete for delivery capacity; invalid input cannot evict them.
      if (receiver.queue.length === QUEUE_CAPACITY) {
        receiver.queue.shift();
        this.report(
          'overflow',
          new Error('Metric queue capacity exceeded; oldest pending event dropped.'),
          receiver.token,
        );
      }
      receiver.queue.push(event);
      this.drain(receiver);
    }
  }

  private drain(receiver: MetricReceiver): void {
    if (receiver.state !== 'ready' || receiver.delivery || !receiver.queue.length) return;
    receiver.delivery = this.deliver(receiver).finally(() => {
      receiver.delivery = undefined;
      this.drain(receiver);
    });
  }

  private async deliver(receiver: MetricReceiver): Promise<void> {
    while (receiver.state === 'ready' && receiver.queue.length) {
      const event = receiver.queue.shift()!;
      try {
        await receiver.instance!.track(event.name, cloneMetricValue(event.payload) as MetricPayload);
      } catch (cause) {
        this.report('delivery', cause, receiver.token, event.name);
      }
    }
  }

  private async shutdown(): Promise<void> {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<void>((resolve) => {
      timeout = setTimeout(() => {
        this.report('dispose', new Error('Metric shutdown exceeded 2000 ms.'));
        resolve();
      }, SHUTDOWN_TIMEOUT_MS);
    });

    for (const receiver of this.receivers.values()) {
      if (receiver.state === 'initializing') {
        receiver.state = 'failed';
        receiver.pending.length = 0;
        receiver.queue.length = 0;
        receiver.controller.abort();
      }
    }
    await Promise.race([
      Promise.allSettled(
        [...this.receivers.values()].map(async (receiver) => {
          if (receiver.state !== 'ready') return;
          while (receiver.preparation || receiver.delivery) {
            await receiver.preparation;
            await receiver.delivery;
          }
        }),
      ),
      deadline,
    ]);

    const cleanup = [...this.receivers.values()].map(async (receiver) => {
      receiver.state = 'disposed';
      receiver.pending.length = 0;
      receiver.queue.length = 0;
      receiver.controller.abort();
      try {
        await receiver.instance?.dispose?.();
      } catch (cause) {
        this.report('dispose', cause, receiver.token);
      }
    });
    await Promise.race([Promise.allSettled(cleanup), deadline]);
    clearTimeout(timeout);
    this.disposed = true;
    this.receivers.clear();
  }

  private report(operation: string, cause: unknown, token?: MetricToken, eventName?: string): void {
    if (this.disposed) return;
    try {
      this.reporter.error({
        event: `metric.${operation}.failed`,
        cause,
        context: { metric: token?.name, metricEvent: eventName, operation },
      });
    } catch {
      // Diagnostics must not escape into application execution, including a broken reporter.
    }
  }
}
