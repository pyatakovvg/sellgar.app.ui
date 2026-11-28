import type {
  ApplicationControllerInterface,
  ApplicationReport,
  ApplicationReportHandlerInterface,
  ApplicationReporterContextInterface,
  ApplicationStoreInterface,
  RouterLocationSnapshot,
  RuntimeContextInterface,
} from '../core';

export const checkApplicationContext = (
  context: ApplicationReporterContextInterface,
  handler: ApplicationReportHandlerInterface,
  report: ApplicationReport,
): void => {
  const runtimeContext: RuntimeContextInterface = context;
  const store: ApplicationStoreInterface = context.store;
  class StoredValue {}
  store.set(StoredValue, new StoredValue());
  const value: StoredValue | undefined = store.get(StoredValue);
  store.setMany(StoredValue, [new StoredValue()]);
  const values: StoredValue[] | undefined = store.getMany(StoredValue);
  store.has(StoredValue);
  store.delete(StoredValue);
  store.clear();
  void runtimeContext;
  void value;
  void values;
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
