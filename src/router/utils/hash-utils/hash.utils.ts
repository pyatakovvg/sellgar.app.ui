export interface RouterHashOptions {
  readonly enableTypeConversion?: boolean;
}

export type RouterHashObject = Record<string, unknown>;

const COMPONENT_REGEX = /(?:^|&)([a-zA-Z_][\w-]*)\(([^)]*)\)(?=&|$)/g;
const QUOTED_STRING_REGEX = /^'(.*)'$/;

export const createHashFromObject = (value: RouterHashObject): string => {
  const segments: string[] = [];

  Object.entries(value).forEach(([key, item]) => {
    appendHashPair(segments, key, item);
  });

  return segments.join('&');
};

export const parseHashToObject = (hash: string, options: RouterHashOptions = {}): RouterHashObject => {
  const normalizedHash = hash.replace(/^#/, '');
  const result: RouterHashObject = {};

  if (!normalizedHash) {
    return result;
  }

  const components = Array.from(normalizedHash.matchAll(COMPONENT_REGEX)).map((match) => ({
    fullMatch: match[0].replace(/^&/, ''),
    name: match[1],
    params: match[2],
  }));

  let remainingHash = normalizedHash;

  components.forEach((component) => {
    remainingHash = remainingHash.replace(component.fullMatch, '');
  });

  components.forEach((component) => {
    if (component.params.trim() === '') {
      result[component.name] = {};
      return;
    }

    const nestedValue: RouterHashObject = {};

    component.params.split('&').forEach((param) => {
      const separatorIndex = param.indexOf('=');
      const rawKey = separatorIndex === -1 ? param : param.slice(0, separatorIndex);
      const rawValue = separatorIndex === -1 ? 'null' : param.slice(separatorIndex + 1);

      if (!rawKey) {
        return;
      }

      nestedValue[rawKey] = decodeHashValue(rawValue, options);
    });

    result[component.name] = nestedValue;
  });

  remainingHash
    .split('&')
    .map((param) => {
      return param.trim();
    })
    .filter(Boolean)
    .forEach((param) => {
      const separatorIndex = param.indexOf('=');
      const rawKey = separatorIndex === -1 ? param : param.slice(0, separatorIndex);
      const rawValue = separatorIndex === -1 ? 'null' : param.slice(separatorIndex + 1);

      if (!rawKey || rawKey in result) {
        return;
      }

      result[rawKey] = decodeHashValue(rawValue, options);
    });

  return result;
};

const appendHashPair = (segments: string[], key: string, value: unknown): void => {
  if (value === undefined) {
    return;
  }

  if (value === null) {
    segments.push(key);
    return;
  }

  if (typeof value === 'object') {
    const nestedHash = createHashFromObject(value as RouterHashObject);

    segments.push(`${key}(${nestedHash})`);
    return;
  }

  const serializedValue = typeof value === 'string' ? `'${encodeHashString(value)}'` : String(value);

  segments.push(`${key}=${serializedValue}`);
};

const decodeHashValue = (value: string, options: RouterHashOptions): unknown => {
  const quotedStringMatch = value.match(QUOTED_STRING_REGEX);

  if (quotedStringMatch) {
    return safeDecodeURIComponent(quotedStringMatch[1]);
  }

  const decodedValue = safeDecodeURIComponent(value);

  if (!options.enableTypeConversion) {
    return decodedValue;
  }

  if (/^-?\d+$/.test(decodedValue)) {
    return Number.parseInt(decodedValue, 10);
  }

  if (/^-?\d*\.\d+$/.test(decodedValue)) {
    return Number.parseFloat(decodedValue);
  }

  if (decodedValue === 'true') {
    return true;
  }

  if (decodedValue === 'false') {
    return false;
  }

  if (decodedValue === 'null') {
    return null;
  }

  if (decodedValue === 'undefined') {
    return undefined;
  }

  return decodedValue;
};

const encodeHashString = (value: string): string => {
  return encodeURIComponent(value).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
};

const safeDecodeURIComponent = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};
