import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { getMetricEventName, type MetricEventConstructor } from '../../declaration/metric-event';
import type { MetricPayload } from '../../declaration/metric';

export interface PreparedMetricEvent {
  readonly name: string;
  readonly payload: MetricPayload;
}

export const prepareMetricEvent = async (token: MetricEventConstructor, data: object): Promise<PreparedMetricEvent> => {
  const name = getMetricEventName(token);
  if (!name) throw new Error('Metric event must have @MetricEvent with a non-empty name.');
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Metric event data must be an object.');
  }

  const keys = getDeclaredKeys(new token());
  const selected = Object.fromEntries(
    keys.filter((key) => Object.hasOwn(data, key)).map((key) => [key, (data as Record<string, unknown>)[key]]),
  );
  // Capture caller data before the first await, including nested values.
  const schemas = new Map<MetricEventConstructor, readonly string[]>([[token, keys]]);
  const instance = projectMetricFields(
    plainToInstance(token, cloneMetricValue(selected), {
      enableImplicitConversion: false,
      // Field discovery belongs to the declaration, never to exposed getters/methods.
      // class-transformer still applies @Type and explicit input @Transform metadata.
      ignoreDecorators: true,
    }),
    schemas,
  ) as object;
  const errors = await validate(instance, {
    forbidUnknownValues: false,
    skipMissingProperties: false,
    skipNullProperties: false,
    skipUndefinedProperties: false,
    validationError: { target: false, value: false },
  });
  if (errors.length) throw errors;

  // Serialize data fields directly: instanceToPlain invokes callable members and exposed getters.
  return { name, payload: projectMetricFields(instance, schemas, false) as MetricPayload };
};

const getDeclaredKeys = (declaration: object): string[] =>
  Object.entries(Object.getOwnPropertyDescriptors(declaration))
    .filter(
      ([key, descriptor]) =>
        key !== '__proto__' &&
        key !== 'constructor' &&
        descriptor.enumerable &&
        'value' in descriptor &&
        typeof descriptor.value !== 'function',
    )
    .map(([key]) => key);

/** Retain class identity for validation; records have no declaration and keep their data keys. */
const projectMetricFields = (
  value: unknown,
  schemas: Map<MetricEventConstructor, readonly string[]>,
  preservePrototype = true,
  ancestors = new Set<object>(),
): unknown => {
  if (value === null || typeof value !== 'object' || value instanceof Date) return cloneMetricValue(value);
  if (ancestors.has(value)) throw new Error('Metric payload must not contain cycles.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => projectMetricFields(item, schemas, preservePrototype, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    const constructor = prototype && Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value;
    const isDeclaration = prototype !== null && prototype !== Object.prototype;
    let keys = Object.keys(value);
    if (isDeclaration) {
      if (typeof constructor !== 'function') throw new Error('Unsupported metric payload value.');
      let declared = schemas.get(constructor);
      if (!declared) {
        declared = getDeclaredKeys(new constructor());
        schemas.set(constructor, declared);
      }
      keys = keys.filter((key) => declared.includes(key));
    }
    const projected = Object.create(preservePrototype ? prototype : Object.prototype);
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new Error('Metric payload must contain data, not accessors.');
      if (!preservePrototype && descriptor.value === undefined) continue;
      Object.defineProperty(projected, key, {
        value: projectMetricFields(descriptor.value, schemas, preservePrototype, ancestors),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    return projected;
  } finally {
    ancestors.delete(value);
  }
};

/** Copies data without sharing references with callers or other receivers. */
export const cloneMetricValue = (value: unknown, ancestors = new Set<object>()): unknown => {
  if (typeof value === 'function' || typeof value === 'symbol') {
    throw new Error('Metric payload must contain data, not functions or symbols.');
  }
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new Error('Metric payload must not contain cycles.');
  if (value instanceof Date) return new Date(value.getTime());
  if (!Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') {
    throw new Error('Unsupported metric payload value.');
  }

  ancestors.add(value);
  try {
    return Array.isArray(value)
      ? value.map((item) => cloneMetricValue(item, ancestors))
      : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneMetricValue(item, ancestors)]));
  } finally {
    ancestors.delete(value);
  }
};
