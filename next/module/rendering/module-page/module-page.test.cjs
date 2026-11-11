const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const compile = (path) =>
  ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

function fixture(fail = false) {
  const events = { load: 0, commit: 0, dispose: 0 };
  const composition = { exports: {} };
  vm.runInNewContext(
    compile(
      new URL('../../../../core/metadata/composition/metadata-composition/metadata-composition.ts', importBase()),
    ),
    composition,
  );
  const app = {
    metadataOptions: { formatTitle: ({ application, page }) => `${application.title} / ${page.title}` },
    getDependency: () => ({ getSnapshot: () => ({ title: 'Кабинет' }) }),
  };
  const runtime = {
    async load() {
      events.load++;
      if (fail) throw new Error('loader failed');
    },
    commit() {
      events.commit++;
    },
  };
  const session = {
    runtime,
    abort: new AbortController(),
    async dispose() {
      events.dispose++;
    },
  };
  const exports = {};
  const cache = (fn) => {
    const values = new Map();
    return (...args) => {
      const key = JSON.stringify(args);
      if (!values.has(key)) values.set(key, fn(...args));
      return values.get(key);
    };
  };
  vm.runInNewContext(compile(new URL('./module-page.tsx', importBase())), {
    exports,
    require(id) {
      if (id === 'server-only') return {};
      if (id === 'react') return { cache };
      if (id === 'react/jsx-runtime') return { jsx: (type, props, key) => ({ type, props, key }) };
      if (id === 'node:crypto') return { randomUUID: () => 'request-module-id' };
      if (id === 'next/server') return { connection: async () => {} };
      if (id.endsWith('/metadata-composition')) return composition.exports;
      if (id.endsWith('/metadata-service')) return { MetadataServiceInterface: class {} };
      if (id.endsWith('/server-application')) return { getApplication: async () => app };
      if (id.endsWith('/module-session'))
        return {
          createModuleRuntime: () => session,
          captureModuleSnapshot: (_runtime, input) => ({ ...input, metadata: { title: 'Заказы' }, controllers: [] }),
        };
      if (id.endsWith('/server-layout'))
        return { getLayoutScopeRegistry: async () => ({ parentFor: async () => undefined }) };
      if (id.endsWith('/client-entry')) return { __esModule: true, default: 'ModuleClientEntry' };
      throw new Error(`Unexpected import: ${id}`);
    },
  });
  return { page: exports.withModule(async () => ({}), 'module-id'), events, session };
}

// CommonJS tests run through the package node:test loader.
function importBase() {
  return require('node:url').pathToFileURL(__filename);
}

test('page and generated metadata share one request preparation and preserve the server formatter in the snapshot', async () => {
  const { page, events } = fixture();
  const [metadata, element] = await Promise.all([
    page.generateMetadata({ params: Promise.resolve({ id: '42', slug: 'orders' }) }),
    page({ params: Promise.resolve({ slug: 'orders', id: '42' }) }),
  ]);
  assert.equal(events.load, 1);
  assert.equal(events.commit, 1);
  assert.equal(metadata.title, 'Кабинет / Заказы');
  assert.equal(element.props.snapshot.resolvedMetadata.title, metadata.title);
  assert.equal(element.props.snapshot.applicationMetadata.title, 'Кабинет');
});

test('shared preparation failure aborts and disposes the module once', async () => {
  const { page, events, session } = fixture(true);
  const results = await Promise.allSettled([page({}), page.generateMetadata({})]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(events.load, 1);
  assert.equal(events.commit, 0);
  assert.equal(events.dispose, 1);
  assert.equal(session.abort.signal.aborted, true);
});
