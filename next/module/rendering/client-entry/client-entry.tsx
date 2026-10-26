'use client';

import type { ReactNode } from 'react';
import type { ModuleSnapshot } from '../../contract/module-snapshot';

interface IProps {
  readonly children?: ReactNode;
  readonly moduleId: string;
  readonly snapshot: ModuleSnapshot;
}

/** Replaced in memory by the plugin's static client registry. */
export default function ModuleClientEntry(_props: IProps): ReactNode {
  throw new Error('Клиентский реестр модулей Next требует подключения withApp().');
}
