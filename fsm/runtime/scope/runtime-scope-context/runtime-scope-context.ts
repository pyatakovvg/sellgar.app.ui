import React from 'react';

import type { RuntimeScope } from '../../../../core/runtime/scope/base/runtime-scope';

export const RuntimeScopeContext = React.createContext<RuntimeScope | null>(null);
