import { renderHook } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';

import {
  ApplicationReportDispatcherInterface,
  ApplicationReporterInterface,
} from '../../../../../core/application/reporting/application-report';
import { ApplicationScope } from '../../../../../core/runtime/scope/kind/application-scope';
import { RuntimeScopeProvider } from '../../../../runtime/scope/runtime-scope-context';

import { useApplicationReporter } from './use-application-reporter.hook.ts';

describe('useApplicationReporter', () => {
  it('returns the application reporter from the current native runtime scope', () => {
    const scope = new ApplicationScope();
    const wrapper: React.FC<React.PropsWithChildren> = ({ children }) => {
      return <RuntimeScopeProvider scope={scope}>{children}</RuntimeScopeProvider>;
    };
    const { result } = renderHook(useApplicationReporter, { wrapper });

    expect(result.current).toBe(scope.get(ApplicationReporterInterface));
    expect(result.current).toBe(scope.get(ApplicationReportDispatcherInterface));
  });
});
