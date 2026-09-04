const routeAddressParams = Symbol('route-address-params');

export interface RouteParam<TName extends string = string> {
  readonly name: TName;
  readonly type: 'param';
}

export type RouteAddressSegment = string | RouteParam;

export interface RouteAddress<TParamName extends string = string> {
  readonly segments: readonly RouteAddressSegment[];
  readonly [routeAddressParams]: TParamName;
}

type SegmentParamName<TSegment> = TSegment extends RouteParam<infer TName> ? TName : never;

type AddressParamNames<TSegments extends readonly RouteAddressSegment[]> = SegmentParamName<TSegments[number]>;

export const param = <const TName extends string>(name: TName): RouteParam<TName> => {
  validateSegmentValue(name, 'Имя параметра');

  return Object.freeze({
    name,
    type: 'param' as const,
  });
};

export const segments = <const TSegments extends readonly [RouteAddressSegment, ...RouteAddressSegment[]]>(
  ...values: TSegments
): RouteAddress<AddressParamNames<TSegments>> => {
  const names = new Set<string>();

  for (const value of values) {
    if (typeof value === 'string') {
      validateSegmentValue(value, 'Сегмент address');
      continue;
    }

    validateSegmentValue(value.name, 'Имя параметра');

    if (names.has(value.name)) {
      throw new Error(`Address не может содержать повторяющийся параметр: ${value.name}.`);
    }

    names.add(value.name);
  }

  return Object.freeze({
    segments: Object.freeze([...values]),
  }) as RouteAddress<AddressParamNames<TSegments>>;
};

export const getRouteAddressParamNames = (address: RouteAddress | undefined): readonly string[] => {
  if (!address) {
    return [];
  }

  return address.segments.flatMap((segment) => (typeof segment === 'string' ? [] : [segment.name]));
};

export const getRouteAddressIdentity = (address: RouteAddress | undefined): string | undefined => {
  if (!address) {
    return undefined;
  }

  return address.segments
    .map((segment) => (typeof segment === 'string' ? `s:${segment}` : `p:${segment.name}`))
    .join('/');
};

const validateSegmentValue = (value: string, label: string): void => {
  if (value.length === 0 || value.trim() !== value || value.includes('/')) {
    throw new Error(`${label} должен быть непустым значением без пробелов по краям и символа '/'.`);
  }
};
