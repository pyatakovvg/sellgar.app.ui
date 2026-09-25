import { ApplicationReporterInterface } from '../../../../../core/application/reporting/application-report';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';

export const useApplicationReporter = (): ApplicationReporterInterface => {
  return useDependency(ApplicationReporterInterface);
};
