export interface WebQueryParseOptions {
  readonly arraySeparator?: string;
  readonly enableTypeConversion?: boolean;
  readonly parseArrays?: boolean;
  readonly parseObjects?: boolean;
}

export const parseWebQuery = (search: string, options: WebQueryParseOptions): Readonly<Record<string, unknown>> => {
  const resolved = {
    arraySeparator: options.arraySeparator ?? '',
    enableTypeConversion: options.enableTypeConversion ?? false,
    parseArrays: options.parseArrays ?? true,
    parseObjects: options.parseObjects ?? true,
  };
  const query = createQueryRecord();

  for (const [key, value] of new URLSearchParams(search)) {
    setQueryValue(query, key, value, resolved);
  }

  return Object.freeze(query);
};

export const serializeWebQuery = (query: Readonly<Record<string, unknown>>): string => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    const values = Array.isArray(value) ? value : [value];

    for (const entry of values) {
      const serialized = serializeQueryValue(entry);

      if (serialized !== null) {
        search.append(key, serialized);
      }
    }
  }

  return search.toString();
};

const setQueryValue = (
  target: Record<string, unknown>,
  key: string,
  rawValue: string,
  options: Required<WebQueryParseOptions>,
): void => {
  if (key.includes('.') && options.parseObjects) {
    const parts = key.split('.');
    const nestedKey = parts.pop();

    if (!nestedKey) {
      return;
    }

    const nested = parts.reduce<Record<string, unknown>>((current, part) => {
      const value = current[part];

      if (!Object.hasOwn(current, part) || !isRecord(value)) {
        setOwnValue(current, part, createQueryRecord());
      }

      return current[part] as Record<string, unknown>;
    }, target);

    setQueryValue(nested, nestedKey, rawValue, options);
    return;
  }

  const indexed = key.match(/^(.+)\[(\d+)]$/);

  if (indexed && options.parseArrays) {
    const arrayKey = indexed[1]!;
    const index = Number.parseInt(indexed[2]!, 10);
    const values = Array.isArray(target[arrayKey]) ? [...target[arrayKey]] : [];

    while (values.length <= index) {
      values.push(undefined);
    }

    values[index] = parseQueryValue(rawValue, options);
    setOwnValue(target, arrayKey, values);
    return;
  }

  if (key.endsWith('[]') && options.parseArrays) {
    appendQueryValue(target, key.slice(0, -2), parseQueryValue(rawValue, options));
    return;
  }

  const parsed =
    options.parseArrays && options.arraySeparator.length > 0 && rawValue.includes(options.arraySeparator)
      ? rawValue.split(options.arraySeparator).map((value) => parseQueryValue(value.trim(), options))
      : parseQueryValue(rawValue, options);

  appendQueryValue(target, key, parsed);
};

const appendQueryValue = (target: Record<string, unknown>, key: string, value: unknown): void => {
  if (!Object.hasOwn(target, key)) {
    setOwnValue(target, key, value);
    return;
  }

  setOwnValue(target, key, Array.isArray(target[key]) ? [...target[key], value] : [target[key], value]);
};

const parseQueryValue = (value: string, options: Required<WebQueryParseOptions>): unknown => {
  if (options.parseObjects && (value.startsWith('{') || value.startsWith('['))) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  if (!options.enableTypeConversion) {
    return value;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'null') {
    return null;
  }

  if (value === 'undefined') {
    return undefined;
  }

  const numberValue = Number(value);

  return !Number.isNaN(numberValue) && value.trim().length > 0 ? numberValue : value;
};

const serializeQueryValue = (value: unknown): string | null => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim().length === 0)) {
    return null;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const createQueryRecord = (): Record<string, unknown> => Object.create(null) as Record<string, unknown>;

const setOwnValue = (target: Record<string, unknown>, key: string, value: unknown): void => {
  Object.defineProperty(target, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
};
