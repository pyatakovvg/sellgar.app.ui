'use client';

import { useContext } from 'react';

import { ApplicationContext } from '../../runtime/application-context';

/** Null while the browser bootstrap is pending, including the initial server HTML render. */
export const useApplication = () => useContext(ApplicationContext);
