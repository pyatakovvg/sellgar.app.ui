const RUNTIME_INTERRUPTION = Symbol.for('tiyn.app.runtime-interruption');

export type RuntimeInterruptionReason = 'request-cancelled';

export interface RuntimeInterruption {
  readonly [RUNTIME_INTERRUPTION]: true;
  readonly cause: unknown;
  readonly reason: RuntimeInterruptionReason;
}

export const createRuntimeInterruption = (cause: unknown, reason: RuntimeInterruptionReason): RuntimeInterruption => ({
  [RUNTIME_INTERRUPTION]: true,
  cause,
  reason,
});

export const isRuntimeInterruption = (value: unknown): value is RuntimeInterruption => {
  return typeof value === 'object' && value !== null && Reflect.get(value, RUNTIME_INTERRUPTION) === true;
};
