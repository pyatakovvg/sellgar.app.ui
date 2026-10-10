import type { MetricEventConstructor, MetricEventData } from '../../declaration/metric-event';
import type { MetricToken } from '../../declaration/metric';

export interface MetricTrackOptions {
  readonly to?: readonly MetricToken[];
}

export abstract class ApplicationMetricInterface {
  abstract track<TEvent extends object>(
    event: MetricEventConstructor<TEvent>,
    data: NoInfer<MetricEventData<TEvent>>,
    options?: MetricTrackOptions,
  ): void;
}
