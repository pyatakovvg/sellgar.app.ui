import { describe, expect, it } from 'vitest';
import { RequestExecutorInterface } from '../../../../application/request/request-executor';
import { SessionRuntimeState } from '../../../../application/session/session-runtime-state';
import { ApplicationScope } from '../../kind/application-scope';
import { ModuleScope } from '../../kind/module-scope';
import { WidgetScope } from '../../kind/widget-scope';

describe('Runtime scope request cancellation', () => {
  it('aborts descendant lifecycle signals and renews them on focus while keeping a shared executor', async () => {
    const app = new ApplicationScope();
    app.bindSession(new SessionRuntimeState());
    const page = new ModuleScope(app);
    const widget = new WidgetScope(page);
    const other = new ModuleScope(app);
    const pageSignal = page.getRequestSignal();
    const widgetSignal = widget.getRequestSignal();
    page.suspendRequests();
    expect(pageSignal.aborted).toBe(true);
    expect(widgetSignal.aborted).toBe(true);
    expect(other.getRequestSignal().aborted).toBe(false);
    expect(page.get(RequestExecutorInterface)).toBe(app.get(RequestExecutorInterface));
    page.resumeRequests();
    expect(widget.getRequestSignal().aborted).toBe(false);
    widget.dispose();
    page.dispose();
    other.dispose();
    app.dispose();
  });
});
