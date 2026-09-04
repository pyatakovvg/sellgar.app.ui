interface ShellDismissInput {
  readonly distance: number;
  readonly height: number;
  readonly velocityY: number;
}

const DISTANCE_RATIO = 0.25;
const VELOCITY = 900;

export const shouldCommitShellDismiss = (input: ShellDismissInput): boolean => {
  'worklet';

  return input.distance >= Math.max(input.height, 1) * DISTANCE_RATIO || input.velocityY >= VELOCITY;
};
