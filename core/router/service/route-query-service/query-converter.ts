import { instanceToPlain, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

import {
  getQueryMetadata,
  type QueryConstructor,
  type QueryConstructors,
  type QueryInput,
  type QueryValue,
  type QueryValues,
} from '../../declaration/query';
import type { RouteQuery } from './route-query-service.interface.ts';

export const readQuery = <TQuery extends object>(
  target: QueryConstructor<TQuery>,
  source: Readonly<Record<string, unknown>>,
): QueryValue<TQuery> => {
  const metadata = getQueryMetadata(target);
  const result = plainToInstance(target, selectQueryFields(metadata.keys, source), {
    enableImplicitConversion: metadata.enableTypeConversion,
    exposeDefaultValues: false,
    exposeUnsetFields: false,
  });
  const errors = validateSync(result, {
    forbidUnknownValues: false,
    skipMissingProperties: true,
    skipNullProperties: true,
    skipUndefinedProperties: true,
  });

  if (errors.length > 0) {
    throw errors;
  }

  return result;
};

export const readQueries = <const TTargets extends QueryConstructors>(
  targets: TTargets,
  source: Readonly<Record<string, unknown>>,
): QueryValues<TTargets> => {
  assertQueryKeysDoNotOverlap(targets);

  if (targets.length === 1) {
    return readQuery(targets[0], source) as QueryValues<TTargets>;
  }

  return Object.freeze(
    Object.assign({}, ...targets.map((target) => readQuery(target, source))),
  ) as QueryValues<TTargets>;
};

export const createQueryReplacement = <TQuery extends object>(
  target: QueryConstructor<TQuery>,
  value: QueryInput<TQuery>,
): RouteQuery => {
  const metadata = getQueryMetadata(target);
  const normalized = selectQueryFields(metadata.keys, value, true);
  const instance = readQuery(target, normalized);
  const serialized = instanceToPlain(instance, {
    exposeDefaultValues: false,
    exposeUnsetFields: false,
  }) as Readonly<Record<string, unknown>>;
  const replacement: Record<string, unknown> = {};

  for (const key of metadata.keys) {
    replacement[key] = null;
  }

  return Object.freeze({
    ...replacement,
    ...selectQueryFields(metadata.keys, serialized, true),
  });
};

export const createQueryClear = (target: QueryConstructor): RouteQuery => {
  const result: Record<string, null> = {};

  for (const key of getQueryMetadata(target).keys) {
    result[key] = null;
  }

  return Object.freeze(result);
};

const selectQueryFields = (
  keys: readonly string[],
  source: Readonly<Record<string, unknown>>,
  omitEmpty = false,
): Readonly<Record<string, unknown>> => {
  const result: Record<string, unknown> = {};

  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) continue;

    const value = source[key];

    if (omitEmpty && isEmptyQueryValue(value)) continue;
    result[key] = value;
  }

  return result;
};

const isEmptyQueryValue = (value: unknown): boolean => {
  return value === null || value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
};

const assertQueryKeysDoNotOverlap = (targets: QueryConstructors): void => {
  const owners = new Map<string, QueryConstructor>();

  for (const target of targets) {
    for (const key of getQueryMetadata(target).keys) {
      const owner = owners.get(key);

      if (owner) {
        throw new Error(`Query-классы ${getQueryName(owner)} и ${getQueryName(target)} объявляют общий ключ "${key}".`);
      }

      owners.set(key, target);
    }
  }
};

const getQueryName = (target: QueryConstructor): string => {
  return (target as { readonly name?: string }).name || '<anonymous>';
};
