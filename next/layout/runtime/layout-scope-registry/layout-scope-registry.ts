import type { Application } from '../../../application/lifecycle/application';
import type { RuntimeEntryRegistration } from '../../../runtime/contract/runtime-entry';
import { createModuleRuntime, type ModuleSession } from '../../../module/runtime/module-session';

/** Scope ancestry comes from Next's layout files, independent of render scheduling and framework routing. */
export class LayoutScopeRegistry {
  private readonly sessions = new Map<string, Promise<ModuleSession>>();

  constructor(
    private readonly app: Application,
    private readonly entries: Readonly<Record<string, RuntimeEntryRegistration>>,
  ) {}

  parentFor(id: string, params: Readonly<Record<string, unknown>>): Promise<ModuleSession | undefined> {
    const entry = this.getEntry(id);
    return entry.parentId ? this.ensure(entry.parentId, params) : Promise.resolve(undefined);
  }

  ensure(id: string, params: Readonly<Record<string, unknown>>): Promise<ModuleSession> {
    const entry = this.getEntry(id);
    if (entry.kind !== 'layout')
      throw new Error('Постоянная область зависимостей layout доступна только декларациям layout Next.');
    const layoutParams = Object.fromEntries(entry.paramKeys.map((key) => [key, params[key]]));
    const key = id + ':' + JSON.stringify(layoutParams);
    let session = this.sessions.get(key);
    if (!session) {
      session = this.activate(id, entry, layoutParams);
      this.sessions.set(key, session);
    }
    return session;
  }

  private async activate(id: string, entry: RuntimeEntryRegistration, params: Record<string, unknown>) {
    const parent = await this.parentFor(id, params);
    const session = createModuleRuntime(this.app, entry.load, crypto.randomUUID(), { kind: 'layout', parent });
    try {
      await session.runtime.load({ params, props: { searchParams: {} }, signal: session.abort.signal });
      session.runtime.commit();
      return session;
    } catch (error) {
      await session.dispose();
      throw error;
    }
  }

  private getEntry(id: string) {
    const entry = this.entries[id];
    if (!entry) throw new Error(`Декларация фреймворка Next ${id} не зарегистрирована через withApp().`);
    return entry;
  }
}
