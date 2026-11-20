'use client';

import React from 'react';

import type { NavigationActivity } from '../navigation-activity';

export const NavigationContext = React.createContext<NavigationActivity | null>(null);
