import { Injectable } from '../../../di/injection/decorators';
import type { RuntimeFailureReport } from '../../../runtime/failure';
import { RuntimeFailureSinkInterface } from '../../../runtime/failure';

@Injectable()
export class ConsoleRuntimeFailureSink implements RuntimeFailureSinkInterface {
  report(report: RuntimeFailureReport): void {
    globalThis.console.error(report);
  }
}
