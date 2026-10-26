const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const loader = require('./server-registry-loader.cjs');
const clientLoader = require('./client-registry-loader.cjs');
const { entryId } = require('./entry-declarations.cjs');

test('derives DI ancestry from route-group layouts and keeps descendant params out of parent layouts', () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'sellgar-layout-registry-'));
  const appDir = path.join(projectDir, 'app');
  const dependencies = new Set();
  try {
    const directory = path.join(appDir, '(site)/section/[id]');
    mkdirSync(directory, { recursive: true });
    writeFileSync(path.join(projectDir, 'entry.js'), 'export class Entry {}');
    writeFileSync(path.join(appDir, 'layout.tsx'), 'export default ({ children }) => children;');
    const site = path.join(appDir, '(site)/layout.tsx');
    const section = path.join(appDir, '(site)/section/layout.tsx');
    const page = path.join(directory, 'page.tsx');
    for (const [file, factory] of [
      [site, 'withLayout'],
      [section, 'withLayout'],
      [page, 'withModule'],
    ]) {
      const specifier =
        './' + path.relative(path.dirname(file), path.join(projectDir, 'entry.js')).split(path.sep).join('/');
      writeFileSync(
        file,
        `import { ${factory} as entry } from '@sellgar/app/next'; export default entry(() => import('${specifier}'));`,
      );
    }
    const context = {
      resourcePath: path.join(projectDir, 'registry.ts'),
      getOptions: () => ({ appDir, projectDir }),
      addDependency: (file) => dependencies.add(file),
      addContextDependency: () => {},
    };
    const source = loader.call(context);
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require: () => ({}) });
    const entries = exports.serverEntries;
    assert.equal(Object.keys(entries).length, 3);
    assert.equal(entries[entryId(site)].kind, 'layout');
    assert.equal(entries[entryId(site)].parentId, undefined);
    assert.equal(entries[entryId(section)].parentId, entryId(site));
    assert.equal(entries[entryId(page)].parentId, entryId(section));
    assert.equal(JSON.stringify(entries[entryId(site)].paramKeys), '[]');
    assert.equal(JSON.stringify(entries[entryId(page)].paramKeys), '["id"]');
    assert.ok(dependencies.has(site) && dependencies.has(section) && dependencies.has(page));
    const client = clientLoader.call(context);
    assert.match(client, /snapshot.kind === 'layout' \? props.moduleId : props.snapshot.id/);
    assert.match(client, /snapshot: props.snapshot }, props.children/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});

test('registers a framework layout embedded in the root document as the parent of ordinary nested routes', () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'sellgar-root-layout-registry-'));
  const appDir = path.join(projectDir, 'app');
  try {
    mkdirSync(path.join(appDir, 'section'), { recursive: true });
    writeFileSync(path.join(projectDir, 'main.js'), 'export class MainLayout {}');
    writeFileSync(path.join(projectDir, 'page.js'), 'export class SectionModule {}');
    const root = path.join(appDir, 'layout.tsx');
    const page = path.join(appDir, 'section/page.tsx');
    writeFileSync(
      root,
      `import { withLayout } from '@sellgar/app/next';
const MainLayout = withLayout(() => import('../main.js'));
export default function RootLayout({ children }) { return <html><body><MainLayout>{children}</MainLayout></body></html>; }`,
    );
    writeFileSync(
      page,
      `import { withModule } from '@sellgar/app/next'; export default withModule(() => import('../../page.js'));`,
    );
    const source = loader.call({
      resourcePath: path.join(projectDir, 'registry.ts'),
      getOptions: () => ({ appDir, projectDir }),
      addDependency: () => {},
      addContextDependency: () => {},
    });
    const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    vm.runInNewContext(compiled, { exports, require: () => ({}) });
    assert.equal(Object.keys(exports.serverEntries).length, 2);
    assert.equal(exports.serverEntries[entryId(root)].kind, 'layout');
    assert.equal(exports.serverEntries[entryId(root)].parentId, undefined);
    assert.equal(exports.serverEntries[entryId(page)].parentId, entryId(root));
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
