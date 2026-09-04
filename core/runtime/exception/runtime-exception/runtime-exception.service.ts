import { Injectable } from '../../../di/injection/decorators';

import { RuntimeExceptionServiceInterface } from './runtime-exception-service.interface.ts';
import { createRuntimeExceptionSignal } from './runtime-exception-signal.ts';

@Injectable()
export class RuntimeExceptionService implements RuntimeExceptionServiceInterface {
  raise(error: unknown): never {
    throw createRuntimeExceptionSignal(error);
  }
}
