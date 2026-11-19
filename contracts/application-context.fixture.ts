import type {
  ApplicationControllerInterface,
  ApplicationReport,
  ApplicationReportHandlerInterface,
  RouterLocationSnapshot,
  RuntimeContextInterface,
} from '../core';

export const checkApplicationContext = (
  context: RuntimeContextInterface,
  handler: ApplicationReportHandlerInterface,
  report: ApplicationReport,
): void => {
  const app: ApplicationControllerInterface = context.app;
  const location: RouterLocationSnapshot | null = app.location;
  const unsubscribe = app.subscribeLocation((next) => {
    const current: RouterLocationSnapshot | null = next;
    void current;
  });
  void app.lifecycle.phase;
  void handler.initialize?.(context);
  void handler.report(report, context);
  unsubscribe();

  // @ts-expect-error Location is owned by the application runtime.
  app.location = null;
  if (location) {
    // @ts-expect-error The context does not prescribe the application payload shape.
    void location.state.businessField;
    // @ts-expect-error The public location projection is read-only.
    location.state = {};
  }
  // @ts-expect-error The framework supplies context when invoking a reporter.
  void handler.report(report);
};
