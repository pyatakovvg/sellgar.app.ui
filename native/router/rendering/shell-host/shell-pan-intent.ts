export type ShellPanIntent = 'activate' | 'fail' | 'wait';

interface ShellPanIntentInput {
  readonly deltaX: number;
  readonly deltaY: number;
  readonly horizontalTolerance: number;
  readonly scrollOffset: number;
  readonly verticalActivationDistance: number;
}

interface ShellScrollBoundsInput {
  readonly bottom: number;
  readonly top: number;
}

export const isTouchWithinShellScrollBounds = (absoluteY: number, bounds: ShellScrollBoundsInput | null): boolean => {
  'worklet';

  return bounds !== null && absoluteY >= bounds.top && absoluteY <= bounds.bottom;
};

export const resolveShellPanIntent = (input: ShellPanIntentInput): ShellPanIntent => {
  'worklet';

  if (Math.abs(input.deltaX) > input.horizontalTolerance) return 'fail';
  if (input.deltaY <= -input.verticalActivationDistance) return 'fail';
  if (input.deltaY < input.verticalActivationDistance) return 'wait';

  return input.scrollOffset <= 0 ? 'activate' : 'wait';
};
