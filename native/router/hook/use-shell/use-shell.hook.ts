import type { ShellController } from '../../declaration/shell';
import { useShellRuntime } from '../../runtime/shell-runtime-context';

export const useShell = (): ShellController => useShellRuntime().controller;
