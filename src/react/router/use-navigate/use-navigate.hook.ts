import { NavigateServiceInterface } from '../../../router/service/navigate-service';
import { useDependency } from '../../../runtime/react';

export const useNavigate = (): NavigateServiceInterface => {
  return useDependency(NavigateServiceInterface);
};
