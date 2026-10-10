export type MetricEventConstructor<TEvent extends object = object> = new () => TEvent;

export type MetricEventData<TEvent extends object> = {
  [
    TKey in keyof TEvent as TKey extends string ? (TEvent[TKey] extends CallableFunction ? never : TKey) : never
  ]: TEvent[TKey];
};

const METRIC_EVENT_METADATA = Symbol('tiyn-app:metric-event');

export const MetricEvent = (name: string) => {
  return <TConstructor extends MetricEventConstructor>(constructor: TConstructor): void => {
    Reflect.defineMetadata(METRIC_EVENT_METADATA, Object.freeze({ name }), constructor);
  };
};

export const getMetricEventName = (token: MetricEventConstructor): string | undefined => {
  const metadata = Reflect.getOwnMetadata(METRIC_EVENT_METADATA, token) as { readonly name: string } | undefined;
  return typeof metadata?.name === 'string' && metadata.name.trim() ? metadata.name : undefined;
};
