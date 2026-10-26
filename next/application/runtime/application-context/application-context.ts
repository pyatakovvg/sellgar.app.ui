'use client';

import { createContext } from 'react';

import type { Application } from '../../lifecycle/application';

export const ApplicationContext = createContext<Application | null>(null);
