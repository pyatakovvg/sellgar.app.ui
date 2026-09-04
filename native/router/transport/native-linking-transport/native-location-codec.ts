import type { RouterBridgeLocationInterface } from '../../../../core/router/bridge/router-bridge';

export interface NativeLocationCodecOptions {
  readonly prefixes?: readonly string[];
}

export const decodeNativeLocation = (
  url: string,
  options: NativeLocationCodecOptions = {},
): RouterBridgeLocationInterface => {
  const source = splitNativeUrl(url);

  return Object.freeze({
    address: Object.freeze(decodeAddress(resolveAddress(source.target, options.prefixes ?? []))),
    nested: decodeNestedLocation(source.hash),
    query: decodeQuery(source.query),
    revalidate: true,
    state: undefined,
  });
};

interface NativeUrlParts {
  readonly hash: string;
  readonly query: string;
  readonly target: string;
}

const splitNativeUrl = (url: string): NativeUrlParts => {
  const hashIndex = url.indexOf('#');
  const hash = hashIndex < 0 ? '' : url.slice(hashIndex + 1);
  const targetAndQuery = hashIndex < 0 ? url : url.slice(0, hashIndex);
  const queryIndex = targetAndQuery.indexOf('?');

  return Object.freeze({
    hash,
    query: queryIndex < 0 ? '' : targetAndQuery.slice(queryIndex + 1),
    target: queryIndex < 0 ? targetAndQuery : targetAndQuery.slice(0, queryIndex),
  });
};

const resolveAddress = (target: string, prefixes: readonly string[]): string => {
  for (const prefix of prefixes) {
    if (!target.startsWith(prefix)) continue;

    return target.slice(prefix.length);
  }

  const scheme = /^([a-z][a-z\d+.-]*):\/\/(.*)$/iu.exec(target);

  if (!scheme) return target;

  const protocol = scheme[1]?.toLowerCase();
  const remainder = scheme[2] ?? '';

  if (protocol !== 'http' && protocol !== 'https') return remainder;

  const pathIndex = remainder.indexOf('/');
  return pathIndex < 0 ? '' : remainder.slice(pathIndex);
};

const decodeNestedLocation = (hash: string): RouterBridgeLocationInterface['nested'] => {
  if (!hash) return null;

  const queryIndex = hash.indexOf('?');
  const address = queryIndex < 0 ? hash : hash.slice(0, queryIndex);
  const query = queryIndex < 0 ? '' : hash.slice(queryIndex + 1);

  return Object.freeze({
    address: Object.freeze(decodeAddress(address)),
    query: decodeQuery(query),
  });
};

const decodeAddress = (source: string): string[] => {
  return source
    .split('/')
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
};

const decodeQuery = (source: string): Readonly<Record<string, unknown>> => {
  const values: Record<string, unknown> = {};

  for (const part of source.split('&')) {
    if (!part) continue;

    const separator = part.indexOf('=');
    const key = decodeQueryValue(separator < 0 ? part : part.slice(0, separator));
    const value = decodeQueryValue(separator < 0 ? '' : part.slice(separator + 1));
    const current = values[key];

    if (current === undefined) {
      values[key] = value;
    } else if (Array.isArray(current)) {
      current.push(value);
    } else {
      values[key] = [current, value];
    }
  }

  return Object.freeze(values);
};

const decodeQueryValue = (value: string): string => {
  return decodeURIComponent(value.replace(/\+/gu, ' '));
};
