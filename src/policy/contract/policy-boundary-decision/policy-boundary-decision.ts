export type PolicyBoundaryDecision =
  | { readonly type: 'continue' }
  | {
      readonly replace?: boolean;
      readonly to: string;
      readonly type: 'redirect';
    }
  | {
      readonly key?: string;
      readonly replace?: boolean;
      readonly to: string;
      readonly type: 'redirect-and-save-location';
    }
  | {
      readonly fallback?: string;
      readonly key?: string;
      readonly replace?: boolean;
      readonly type: 'redirect-to-saved-location';
    }
  | { readonly type: 'forbidden' }
  | { readonly type: 'not-found' }
  | {
      readonly error: unknown;
      readonly type: 'error';
    };
