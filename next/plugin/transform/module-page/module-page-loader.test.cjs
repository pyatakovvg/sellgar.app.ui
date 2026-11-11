const assert = require('node:assert/strict');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');
const loader = require('./index.cjs');
const { moduleId } = require('./module-page-loader.cjs');

const source = `import { withModule as createPage } from '@sellgar/app/next';
export const metadata = { title: 'Module page' };
export default createPage(() => import('@module/home'));`;

test('recognizes an aliased withLayout without changing Next metadata', () => {
  const source = `import { withLayout as createLayout } from '@sellgar/app/next';
export const metadata = { title: 'Site' };
export default createLayout(() => import('@layout/site'));`;
  const output = loader.call({ resourcePath: '/fixture/app/(site)/layout.tsx' }, source);
  assert.ok(output.includes(moduleId('/fixture/app/(site)/layout.tsx')));
  assert.match(output, /export const metadata/);
  assert.match(output, /import\('@layout\/site'\)/);
  assert.throws(
    () => loader.call({ resourcePath: '/fixture/app/layout.tsx' }, `'use client';\n${source}`),
    /серверном компоненте/,
  );
});

test('adds a stable module ID while keeping the loader and named Next exports on the server', () => {
  const output = loader.call({ resourcePath: '/fixture/app/page.tsx' }, source);
  assert.ok(output.includes(moduleId('/fixture/app/page.tsx')));
  assert.doesNotMatch(output, /sellgar-module-client|__SellgarModuleClient/);
  const compiled = ts.transpileModule(output, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const client = moduleId('/fixture/app/page.tsx');
  vm.runInNewContext(compiled, {
    exports,
    require: (id) =>
      id === '@sellgar/app/next'
        ? { withModule: (load, component) => ({ load, component }) }
        : { __esModule: true, default: client },
  });
  assert.equal(exports.metadata.title, 'Module page');
  assert.equal(exports.default.component, client);
  assert.equal(typeof exports.default.load, 'function');
});

test('leaves ordinary pages intact and rejects a client page or a nonstatic loader', () => {
  const ordinary = 'export default function Page() { return null; }';
  assert.equal(loader.call({ resourcePath: '/fixture/app/page.tsx' }, ordinary), ordinary);
  assert.throws(
    () => loader.call({ resourcePath: '/fixture/app/page.tsx' }, `'use client';\n${source}`),
    /серверном компоненте/,
  );
  assert.throws(
    () =>
      loader.call({ resourcePath: '/fixture/app/page.tsx' }, source.replace("import('@module/home')", 'loadModule()')),
    /статический загрузчик/,
  );
});

test('exports generated metadata from the same prepared page and keeps explicit Next metadata authoritative', () => {
  const source = `import { withModule } from '@sellgar/app/next';
    const __sellgarMetadataPage = 'existing identifier';
    export default withModule(() => import('@module/home'));`;
  const transformed = loader.call({ resourcePath: '/fixture/app/page.tsx' }, source);
  const compiled = ts.transpileModule(transformed, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  let calls = 0;
  const generate = () => ({ title: 'generated' });
  vm.runInNewContext(compiled, {
    exports,
    require: () => ({
      withModule: () => {
        calls++;
        return { generateMetadata: generate };
      },
    }),
  });
  assert.equal(calls, 1);
  assert.equal(exports.generateMetadata, generate);
  assert.equal(exports.default.generateMetadata, exports.generateMetadata);

  for (const declaration of [
    'export const metadata = { title: "manual" };',
    'export async function generateMetadata() { return { title: "manual" }; }',
    'export { metadata } from "./manual";',
  ]) {
    const output = loader.call(
      { resourcePath: '/fixture/app/page.tsx' },
      declaration + source.replace("const __sellgarMetadataPage = 'existing identifier';", ''),
    );
    assert.match(output, /withModule\([\s\S]*false\)/);
    assert.doesNotMatch(output, /\.generateMetadata/);
  }
});
