import type { ShellConstructor } from '../../../declaration/shell';

export const resolveNestedShell = (
  local: ShellConstructor | undefined,
  fallback: ShellConstructor | undefined,
): ShellConstructor => {
  const shell = local ?? fallback;

  if (!shell) {
    throw new Error('Вложенный Router требует локальный shell или app.routing({ shell }).');
  }

  return shell;
};
