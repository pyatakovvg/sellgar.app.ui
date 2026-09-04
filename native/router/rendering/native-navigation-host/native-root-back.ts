export interface RootBackResolution {
  readonly exit: boolean;
  readonly pressedAt: number | null;
}

const ROOT_BACK_CONFIRMATION_WINDOW = 2_000;

export const resolveRootBack = (previousPressedAt: number | null, pressedAt: number): RootBackResolution => {
  const elapsed = previousPressedAt === null ? Number.POSITIVE_INFINITY : pressedAt - previousPressedAt;
  const exit = elapsed >= 0 && elapsed <= ROOT_BACK_CONFIRMATION_WINDOW;

  return Object.freeze({ exit, pressedAt: exit ? null : pressedAt });
};
