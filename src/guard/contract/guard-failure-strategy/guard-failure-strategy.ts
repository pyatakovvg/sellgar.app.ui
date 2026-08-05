export type GuardFailureStrategy<TValue = unknown> =
  | { readonly type: 'throw' }
  | {
      readonly type: 'return-value';
      readonly value: TValue;
    };

export class GuardFailure {
  static returnNull(): GuardFailureStrategy<null> {
    return {
      type: 'return-value',
      value: null,
    };
  }

  static returnUndefined(): GuardFailureStrategy<void> {
    return {
      type: 'return-value',
      value: void 0,
    };
  }

  static returnValue<TValue>(value: TValue): GuardFailureStrategy<TValue> {
    return {
      type: 'return-value',
      value,
    };
  }

  static throw(): GuardFailureStrategy<never> {
    return {
      type: 'throw',
    };
  }
}
