export type PolicyResult =
  | { readonly type: 'pass' }
  | {
      readonly data?: unknown;
      readonly reason?: string;
      readonly type: 'fail';
    };
