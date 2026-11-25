import { named } from 'inversify';

import { Inject } from '../../../di/injection/decorators';
import { CollectorInterface } from '../../runtime/collector';

const COLLECTOR_INJECTIONS = Symbol('tiyn-app:collector:injections');

export interface CollectorInjection {
  readonly constructor: Function;
  readonly parameterIndex: number;
  readonly key: string;
  readonly slot: symbol;
}

export const InjectCollector = (key: string): ParameterDecorator => {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Collector key must be a non-empty string.');
  }

  return (target, propertyKey, parameterIndex) => {
    if (typeof target !== 'function' || propertyKey !== undefined) {
      throw new Error('InjectCollector can only decorate a controller constructor parameter.');
    }

    const injections = getCollectorInjections(target);

    if (injections.some((injection) => injection.parameterIndex === parameterIndex)) {
      throw new Error('A controller parameter can declare only one collector.');
    }

    const injection: CollectorInjection = {
      constructor: target,
      parameterIndex,
      key,
      slot: Symbol(`tiyn-app:collector:${key}`),
    };

    Inject(CollectorInterface)(target, propertyKey, parameterIndex);
    named(injection.slot)(target, propertyKey, parameterIndex);
    Reflect.defineMetadata(COLLECTOR_INJECTIONS, [...injections, injection], target);
  };
};

export const getCollectorInjections = (constructor: Function): readonly CollectorInjection[] => {
  return (Reflect.getOwnMetadata(COLLECTOR_INJECTIONS, constructor) as readonly CollectorInjection[] | undefined) ?? [];
};
