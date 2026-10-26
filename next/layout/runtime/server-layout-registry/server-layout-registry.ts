import 'server-only';
import type { RuntimeEntryRegistration } from '../../../runtime/contract/runtime-entry';

/** Replaced in memory by the Next plugin. */
export const serverEntries: Readonly<Record<string, RuntimeEntryRegistration>> = {};
