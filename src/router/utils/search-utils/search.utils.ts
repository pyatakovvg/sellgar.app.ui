export type RouterSearchObject = Record<string, unknown>;

export interface RouterSearchParseOptions {
  readonly arraySeparator?: string;
  readonly decode?: boolean;
  readonly enableTypeConversion?: boolean;
  readonly parseArrays?: boolean;
  readonly parseObjects?: boolean;
}

export interface RouterSearchUpdateOptions {
  readonly clearUndefined?: boolean;
}

export const parseSearchParams = <TValue = RouterSearchObject>(
  searchString: string,
  options: RouterSearchParseOptions = {},
): TValue => {
  const {
    arraySeparator = '',
    decode = true,
    enableTypeConversion = false,
    parseArrays = true,
    parseObjects = true,
  } = options;
  const result: RouterSearchObject = {};

  for (const [key, value] of getSearchEntries(searchString, decode)) {
    setSearchValue(result, key, value, {
      arraySeparator,
      enableTypeConversion,
      parseArrays,
      parseObjects,
    });
  }

  return result as TValue;
};

export const updateSearchParams = <TParams extends object>(
  currentSearch: string,
  params: TParams,
  options: RouterSearchUpdateOptions = {},
): string => {
  const { clearUndefined = true } = options;
  const searchParams = new URLSearchParams(currentSearch);

  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      searchParams.delete(key);

      value.forEach((item) => {
        const serializedValue = serializeSearchValue(item);

        if (serializedValue !== null) {
          searchParams.append(key, serializedValue);
        }
      });

      return;
    }

    const serializedValue = serializeSearchValue(value);

    if (serializedValue === null) {
      if (clearUndefined) {
        searchParams.delete(key);
      }

      return;
    }

    searchParams.set(key, serializedValue);
  });

  return searchParams.toString();
};

const getSearchEntries = (searchString: string, decode: boolean): Array<[string, string]> => {
  if (decode) {
    return Array.from(new URLSearchParams(searchString).entries());
  }

  const normalizedSearch = searchString.replace(/^\?/, '');

  if (!normalizedSearch) {
    return [];
  }

  return normalizedSearch
    .split('&')
    .filter(Boolean)
    .map((param) => {
      const [key, ...valueParts] = param.split('=');

      return [key, valueParts.join('=')];
    });
};

const isPlainObjectString = (value: string): boolean => {
  return value.startsWith('{') || value.startsWith('[');
};

const parseSearchValue = (
  value: string,
  options: Pick<Required<RouterSearchParseOptions>, 'enableTypeConversion' | 'parseObjects'>,
): unknown => {
  if (options.parseObjects && isPlainObjectString(value)) {
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

  if (!Number.isNaN(numberValue) && value.trim() !== '') {
    return numberValue;
  }

  return value;
};

const serializeSearchValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? null : value;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

const setSearchValue = (
  target: RouterSearchObject,
  key: string,
  rawValue: string,
  options: Required<Omit<RouterSearchParseOptions, 'decode'>>,
): void => {
  if (key.includes('.') && options.parseObjects) {
    const keyParts = key.split('.');
    const nestedKey = keyParts.pop();

    if (!nestedKey) {
      return;
    }

    const nestedTarget = keyParts.reduce<RouterSearchObject>((current, part) => {
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }

      return current[part] as RouterSearchObject;
    }, target);

    setSearchValue(nestedTarget, nestedKey, rawValue, options);
    return;
  }

  const arrayIndexMatch = key.match(/^(.+)\[(\d+)]$/);

  if (arrayIndexMatch && options.parseArrays) {
    const [, arrayKey, indexValue] = arrayIndexMatch;
    const index = Number.parseInt(indexValue, 10);
    const array = Array.isArray(target[arrayKey]) ? target[arrayKey] : [];

    while (array.length <= index) {
      array.push(undefined);
    }

    array[index] = parseSearchValue(rawValue, options);
    target[arrayKey] = array;
    return;
  }

  if (key.endsWith('[]') && options.parseArrays) {
    const arrayKey = key.slice(0, -2);
    const array = Array.isArray(target[arrayKey]) ? target[arrayKey] : [];

    array.push(parseSearchValue(rawValue, options));
    target[arrayKey] = array;
    return;
  }

  const shouldParseSeparatedArray =
    options.parseArrays && options.arraySeparator.length > 0 && rawValue.includes(options.arraySeparator);
  const parsedValue = shouldParseSeparatedArray
    ? rawValue.split(options.arraySeparator).map((item) => parseSearchValue(item.trim(), options))
    : parseSearchValue(rawValue, options);

  if (!(key in target)) {
    target[key] = parsedValue;
    return;
  }

  if (Array.isArray(target[key])) {
    target[key].push(parsedValue);
    return;
  }

  target[key] = [target[key], parsedValue];
};
