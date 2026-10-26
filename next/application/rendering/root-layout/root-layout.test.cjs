const assert = require('node:assert/strict');
const { test } = require('node:test');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

test('application context reaches a framework layout rendered inside the root body and preserves document markup', async () => {
  const ApplicationContext = React.createContext(null);
  let starts = 0;
  const app = { ready: true };
  function ApplicationHost({ children }) {
    return React.createElement(ApplicationContext.Provider, { value: app }, children);
  }
  const rootLoader = require('../../../plugin/transform/root-layout/root-layout-loader.cjs');
  const entryLoader = require('../../../plugin/transform/module-page/module-page-loader.cjs');
  const source = readFileSync(path.join(__dirname, 'root-layout.tsx'), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require(specifier) {
      if (specifier === 'server-only') return {};
      if (specifier === '../../runtime/server-application')
        return {
          getApplication: async () => {
            starts++;
            return app;
          },
        };
      if (specifier === '../application-host') return { ApplicationHost };
      return require(specifier);
    },
  });
  function MainLayout({ children }) {
    const context = React.useContext(ApplicationContext);
    assert.equal(context, app, 'MainLayout must receive context even though it wraps RootLayout children');
    return React.createElement(
      React.Fragment,
      null,
      React.createElement('header', null, 'Main'),
      children,
      React.createElement('footer', null, 'Footer'),
    );
  }
  const rootSource = `import { withLayout } from '@sellgar/app/next';
const MainLayout = withLayout(() => import('@layout/main'));
export const metadata = { title: 'Root' };
export default function RootLayout({ children }) {
  return <html lang="ru"><body><MainLayout>{children}</MainLayout></body></html>;
}`;
  for (const loaders of [
    [rootLoader, entryLoader],
    [entryLoader, rootLoader],
  ]) {
    const transformed = loaders.reduce(
      (text, loader) => loader.call({ resourcePath: '/fixture/app/layout.tsx' }, text),
      rootSource,
    );
    const rootCompiled = ts.transpileModule(transformed, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const rootExports = {};
    vm.runInNewContext(rootCompiled, {
      exports: rootExports,
      require(specifier) {
        if (specifier === 'sellgar-next-root-layout')
          return { withRootLayout: exports.withRootLayout, ApplicationHost };
        if (specifier === '@sellgar/app/next')
          return {
            withLayout: (_load, id) => {
              assert.equal(typeof id, 'string');
              return MainLayout;
            },
          };
        return require(specifier);
      },
    });
    assert.equal(rootExports.metadata.title, 'Root');
    const result = await rootExports.default({ children: React.createElement('main', null, 'Page') });
    const html = renderToStaticMarkup(result);

    assert.match(
      html,
      /<html lang="ru"><head><\/head><body><header>Main<\/header><main>Page<\/main><footer>Footer<\/footer><\/body><\/html>/,
    );
  }
  assert.equal(starts, 2);
});
