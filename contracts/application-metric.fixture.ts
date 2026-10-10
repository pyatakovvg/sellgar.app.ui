import { ApplicationMetricInterface, Metric, MetricEvent, type MetricInterface, type MetricToken } from '../core';
import { IsNumber, IsOptional, IsString } from 'class-validator';

@MetricEvent('contract.event')
class ContractEvent {
  @IsString()
  readonly id!: string;
  @IsNumber()
  readonly amount!: number;
  @IsOptional()
  @IsString()
  readonly note?: string;
}

@Metric()
class Adapter implements MetricInterface {
  track(_name: string, _payload: Readonly<Record<string, unknown>>): void {}
  static configure(): MetricToken {
    @Metric({ token: Adapter })
    class Configured implements MetricInterface {
      track(): void {}
    }
    return Configured;
  }
}

export const checkMetricContract = (metric: ApplicationMetricInterface): void => {
  metric.track(ContractEvent, { id: 'one', amount: 1 });
  metric.track(ContractEvent, { id: 'one', amount: 1, note: 'note' }, { to: [Adapter] });
  // @ts-expect-error Data must retain required class fields.
  metric.track(ContractEvent, { id: 'one' });
  // @ts-expect-error Payload does not widen the event's field types.
  metric.track(ContractEvent, { id: 'one', amount: '1' });
  // @ts-expect-error Unrelated fields are not part of the event contract.
  metric.track(ContractEvent, { id: 'one', amount: 1, unrelated: true });
  // @ts-expect-error Event names cannot replace event classes.
  metric.track('contract.event', { id: 'one', amount: 1 });
  // @ts-expect-error Receiver identity is a metric class token.
  metric.track(ContractEvent, { id: 'one', amount: 1 }, { to: ['adapter'] });
};
