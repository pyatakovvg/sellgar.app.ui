import type { DependencyConstructor } from '../../../di/binding/binding-builder';
import type { RuntimeContextInterface } from '../../../runtime/context/runtime-context';
import type { ApplicationStoreInterface } from '../../store/application-store';

export type ApplicationReportLevel = 'debug' | 'info' | 'warning' | 'error';

export interface ApplicationReportInput {
  readonly context?: Readonly<Record<string, unknown>>;
  readonly event: string;
  readonly message?: string;
}

export interface ApplicationErrorReportInput extends ApplicationReportInput {
  readonly cause?: unknown;
}

export interface ApplicationReport extends ApplicationErrorReportInput {
  readonly id: string;
  readonly level: ApplicationReportLevel;
  readonly reportedAt: number;
}

export interface ApplicationReporterContextInterface extends RuntimeContextInterface {
  readonly store: ApplicationStoreInterface;
}

export interface ApplicationReportHandlerInterface {
  initialize?(context: ApplicationReporterContextInterface): void | Promise<void>;

  report(report: ApplicationReport, context: ApplicationReporterContextInterface): void | Promise<void>;

  dispose?(): void | Promise<void>;
}

export type ApplicationReporterDeclaration = DependencyConstructor<ApplicationReportHandlerInterface>;

export abstract class ApplicationReporterInterface {
  abstract debug(report: ApplicationReportInput): void;

  abstract info(report: ApplicationReportInput): void;

  abstract warning(report: ApplicationReportInput): void;

  abstract error(report: ApplicationErrorReportInput): void;
}

export abstract class ApplicationReportDispatcherInterface {
  abstract report(report: ApplicationReport): Promise<void>;
}

let applicationReportSequence = 0;

export const createApplicationReport = (
  level: ApplicationReportLevel,
  input: ApplicationErrorReportInput,
): ApplicationReport => {
  const reportedAt = Date.now();

  return {
    ...input,
    id: `application-report:${reportedAt}:${++applicationReportSequence}`,
    level,
    reportedAt,
  };
};
