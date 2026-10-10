import { ApplicationMetricInterface } from '../../../../../core/application/metric/service/application-metric';
import { useDependency } from '../../../../runtime/scope/runtime-scope-context';

export const useMetric = (): ApplicationMetricInterface => useDependency(ApplicationMetricInterface);
