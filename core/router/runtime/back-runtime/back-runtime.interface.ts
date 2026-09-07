import type { BackCondition, BackHandler, BackInterception } from '../../service/back-service';
import type { BackBoundary } from './back-boundary.ts';

export abstract class BackRuntimeInterface {
  abstract handle(boundaries: readonly BackBoundary[]): Promise<boolean>;

  abstract register(boundary: BackBoundary, condition: BackCondition, handler: BackHandler): BackInterception;
}
