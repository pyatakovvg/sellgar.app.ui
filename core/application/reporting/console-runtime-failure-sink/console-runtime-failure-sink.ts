import { Injectable } from '../../../di/injection/decorators';
import { RuntimeFailureSinkInterface, type RuntimeFailureReport } from '../../../runtime/failure/runtime-failure';

@Injectable()
export class ConsoleRuntimeFailureSink implements RuntimeFailureSinkInterface {
  report(report: RuntimeFailureReport): void {
    globalThis.console.error(report);
  }
}
