'use client';

import { createContext } from 'react';
import type { ClientModule } from '../client-module';

export const ModuleContext = createContext<ClientModule | null>(null);
