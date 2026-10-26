const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const loader = require('./index.cjs');

function executeLayout(source) {
  const transformed = loader.call({ resourcePath: '/fixture/app/layout.tsx' }, source);
  const output = ts.transpileModule(transformed, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  let wrappers = 0;

  vm.runInNewContext(output, {
    exports,
    require(specifier) {
      assert.equal(specifier, 'sellgar-next-root-layout');
      return {
        withRootLayout: (component) => {
          wrappers += 1;
          return component;
        },
      };
    },
  });

  return { exports, wrappers };
}

test('preserves metadata, segment configuration, async root props and named function identity', async () => {
  const { exports, wrappers } = executeLayout(`
    export const metadata = { title: 'Preserved title' };
    export const dynamic = 'force-dynamic';
    export default async function RootLayout(props: { children: string }) { return 'body:' + props.children; }
  `);

  assert.equal(exports.metadata.title, 'Preserved title');
  assert.equal(exports.dynamic, 'force-dynamic');
  assert.equal(exports.default.name, 'RootLayout');
  assert.equal(await exports.default({ children: 'content' }), 'body:content');
  assert.equal(wrappers, 1);
});

test('supports an anonymous default root and a default arrow export', () => {
  for (const source of [
    'export default function (props) { return props.children; }',
    'const Root = (props) => props.children; export default Root;',
  ]) {
    const { exports, wrappers } = executeLayout(source);
    assert.equal(exports.default({ children: 'content' }), 'content');
    assert.equal(wrappers, 1);
  }
});

test('rejects unsupported root exports and client roots with an actionable error', () => {
  assert.throws(() => executeLayout("'use client'; export default () => null;"), /серверный корневой layout/);
  assert.throws(() => executeLayout("export { default } from './other';"), /локальный default export/);
});
