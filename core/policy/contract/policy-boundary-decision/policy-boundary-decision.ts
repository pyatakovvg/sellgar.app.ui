import type { RouteToken } from '../../../router/declaration/route-token';

export type PolicyBoundaryDecision =
  | { readonly type: 'continue' }
  | {
      readonly params: Readonly<Record<string, unknown>>;
      readonly replace: boolean;
      readonly saveCurrentLocation: boolean;
      readonly to: RouteToken;
      readonly type: 'redirect';
    }
  | {
      readonly replace: boolean;
      readonly type: 'redirect-to-saved-location';
    }
  | { readonly type: 'forbidden' }
  | { readonly type: 'not-found' }
  | {
      readonly error: unknown;
      readonly type: 'error';
    };

export const isPolicyBoundaryDecision = (value: unknown): value is PolicyBoundaryDecision => {
  if (typeof value !== 'object' || value === null || !('type' in value)) {
    return false;
  }

  const type = Reflect.get(value, 'type');

  switch (type) {
    case 'continue':
    case 'forbidden':
    case 'not-found':
      return true;
    case 'error':
      return 'error' in value;
    case 'redirect':
      return (
        typeof Reflect.get(value, 'to') === 'function' &&
        isRecord(Reflect.get(value, 'params')) &&
        typeof Reflect.get(value, 'replace') === 'boolean' &&
        typeof Reflect.get(value, 'saveCurrentLocation') === 'boolean'
      );
    case 'redirect-to-saved-location':
      return typeof Reflect.get(value, 'replace') === 'boolean';
    default:
      return false;
  }
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};
