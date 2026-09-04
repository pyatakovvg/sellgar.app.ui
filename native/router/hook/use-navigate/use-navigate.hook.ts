import { NavigateServiceInterface } from '../../../../core/router/service/navigate-service';
import { useDependency } from '../../../runtime/scope/runtime-scope-context';

export const useNavigate = (): NavigateServiceInterface => useDependency(NavigateServiceInterface);
