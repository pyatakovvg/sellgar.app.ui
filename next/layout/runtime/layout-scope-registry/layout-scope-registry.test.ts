import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Controller } from '../../../../core/controller/contract/controller';
import { Inject } from '../../../../core/di/injection/decorators';
import { UseBindings } from '../../../../core/di/composition/use-bindings';
import type { BindingRegistryInterface } from '../../../../core/di/binding/binding-registry';
import { Layout } from '../../../../react/layout/declaration/layout';
import { Module } from '../../../../react/module/declaration/module';
import { Application, startApplication } from '../../../application/lifecycle/application';
import { captureModuleSnapshot, createModuleRuntime } from '../../../module/runtime/module-session';
import { ClientModule } from '../../../module/runtime/client-module';
import { LayoutScopeRegistry } from './layout-scope-registry';

function fixture() {
  const events: string[] = [];
  let siteLoads = 0;
  let sectionLoads = 0;
  const state = { site: 0, section: 0, alive: true };
  abstract class SharedToken {
    abstract site: number;
    abstract section: number;
    abstract alive: boolean;
  }
  abstract class SiteToken {
    abstract loader(): unknown;
  }
  abstract class SectionToken {
    abstract loader(): unknown;
  }
  abstract class PageToken {
    abstract loader(): unknown;
    abstract increment(): number;
  }

  @Controller()
  class SiteController {
    loader() {
      siteLoads++;
      return { title: 'site' };
    }
    dispose() {
      state.alive = false;
      events.push('site.dispose');
    }
  }
  class SiteBindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(SharedToken).toConstantValue(state);
      registry.bind(SiteToken).to(SiteController).inSingletonScope();
    }
  }
  @UseBindings(SiteBindings)
  @Layout({ view: () => null })
  class SiteLayout {}

  @Controller()
  class SectionController {
    constructor(@Inject(SharedToken) private readonly shared: SharedToken) {}
    loader() {
      sectionLoads++;
      return { site: this.shared.site };
    }
    dispose() {
      assert.equal(this.shared.alive, true);
      events.push('section.dispose');
    }
  }
  class SectionBindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(SectionToken).to(SectionController).inSingletonScope();
    }
  }
  @UseBindings(SectionBindings)
  @Layout({ view: () => null })
  class SectionLayout {}

  @Controller()
  class PageController {
    constructor(@Inject(SharedToken) private readonly shared: SharedToken) {}
    loader() {
      return { inherited: this.shared.site };
    }
    increment() {
      return ++this.shared.site;
    }
    dispose() {
      assert.equal(this.shared.alive, true);
      events.push('page.dispose');
    }
  }
  class PageBindings {
    register(registry: BindingRegistryInterface) {
      registry.bind(PageToken).to(PageController).inSingletonScope();
    }
  }
  @UseBindings(PageBindings)
  @Module({ view: () => null })
  class PageModule {}
  const entries = {
    site: { kind: 'layout' as const, load: async () => ({ SiteLayout }), paramKeys: [] },
    section: {
      kind: 'layout' as const,
      load: async () => ({ SectionLayout }),
      parentId: 'site',
      paramKeys: ['sectionId'],
    },
    page: {
      kind: 'module' as const,
      load: async () => ({ PageModule }),
      parentId: 'section',
      paramKeys: ['sectionId', 'id'],
    },
  };
  return { entries, events, state, PageToken, SiteToken, SectionToken, loads: () => ({ siteLoads, sectionLoads }) };
}

test('parallel page/layout rendering shares each parent scope and filters descendant params from layout cache keys', async () => {
  const value = fixture();
  const app = await startApplication(() => new Application());
  const registry = new LayoutScopeRegistry(app, value.entries);
  const [parent, section, site] = await Promise.all([
    registry.parentFor('page', { sectionId: 'one', id: 'details' }),
    registry.ensure('section', { sectionId: 'one' }),
    registry.ensure('site', {}),
  ]);
  assert.equal(parent, section);
  assert.equal(site, await registry.ensure('site', { id: 'ignored' }));
  assert.deepEqual(value.loads(), { siteLoads: 1, sectionLoads: 1 });
  assert.deepEqual(section.runtime.getParams(), { sectionId: 'one' });
  const page = createModuleRuntime(app, value.entries.page.load, 'page-render', { parent: section });
  await page.runtime.load({ params: {}, props: {}, signal: page.abort.signal });
  page.runtime.commit();
  assert.equal(page.runtime.invoke(value.PageToken, 'increment', []), 1);
  assert.equal(value.state.site, 1);
  await app.dispose();
  assert.deepEqual(value.events, ['page.dispose', 'section.dispose', 'site.dispose']);
});

test('different dynamic layout params create separate child scopes under the same site layout', async () => {
  const value = fixture();
  const app = await startApplication(() => new Application());
  const registry = new LayoutScopeRegistry(app, value.entries);
  const first = await registry.ensure('section', { sectionId: 'one' });
  const second = await registry.ensure('section', { sectionId: 'two' });
  assert.notEqual(first, second);
  assert.deepEqual(value.loads(), { siteLoads: 1, sectionLoads: 2 });
  await app.dispose();
});

test('browser layouts hydrate independently and a page inherits their live DI scope', async () => {
  const value = fixture();
  const server = await startApplication(() => new Application());
  const registry = new LayoutScopeRegistry(server, value.entries);
  const site = await registry.ensure('site', {});
  const section = await registry.ensure('section', { sectionId: 'one' });
  const page = createModuleRuntime(server, value.entries.page.load, 'page', { parent: section });
  await page.runtime.load({ params: {}, props: {}, signal: page.abort.signal });
  page.runtime.commit();
  const snapshot = (session: typeof page, kind: 'module' | 'layout') =>
    captureModuleSnapshot(session.runtime, {
      id: session.id,
      kind,
      params: { ...session.runtime.getParams() },
      props: { searchParams: {} },
    });
  const browserValue = fixture();
  const browser = await startApplication(() => new Application());
  const root = new ClientModule(await browserValue.entries.site.load(), snapshot(site, 'layout'));
  const nested = new ClientModule(await browserValue.entries.section.load(), snapshot(section, 'layout'));
  const leaf = new ClientModule(await browserValue.entries.page.load(), snapshot(page, 'module'));
  const rootLease = root.acquire(browser);
  await rootLease.ready;
  const nestedLease = nested.acquire(browser, root.session!);
  await nestedLease.ready;
  const leafLease = leaf.acquire(browser, nested.session!);
  await leafLease.ready;
  assert.equal(leaf.invoke(browserValue.PageToken, 'increment', []), 1);
  assert.equal(value.state.site, 0);
  assert.equal(browserValue.state.site, 1);
  assert.deepEqual(browserValue.loads(), { siteLoads: 0, sectionLoads: 0 });
  assert.deepEqual(value.loads(), { siteLoads: 1, sectionLoads: 1 });
  leafLease.release();
  nestedLease.release();
  rootLease.release();
  await new Promise((resolve) => setImmediate(resolve));
  await server.dispose();
  await browser.dispose();
  assert.deepEqual(value.events, ['page.dispose', 'section.dispose', 'site.dispose']);
  assert.deepEqual(browserValue.events, ['page.dispose', 'section.dispose', 'site.dispose']);
});
