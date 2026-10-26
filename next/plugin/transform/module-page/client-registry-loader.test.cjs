const assert = require('node:assert/strict');
const { test } = require('node:test');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loader = require('./client-registry-loader.cjs');
const { moduleId } = require('./module-page-loader.cjs');

test('registers multiple module pages, tracks page files and directory changes, and skips ordinary pages', () => {
  const projectDir = mkdtempSync(path.join(os.tmpdir(), 'sellgar-module-registry-'));
  const appDir = path.join(projectDir, 'app');
  const dependencies = new Set();
  const directories = new Set();
  try {
    mkdirSync(path.join(appDir, 'orders'), { recursive: true });
    mkdirSync(path.join(appDir, 'about'), { recursive: true });
    const home = path.join(appDir, 'page.tsx');
    const orders = path.join(appDir, 'orders/page.tsx');
    writeFileSync(path.join(projectDir, 'home.js'), 'export class HomeModule {}');
    writeFileSync(path.join(projectDir, 'orders.js'), 'export class OrdersModule {}');
    writeFileSync(
      home,
      `import { withModule } from '@sellgar/app/next'; export default withModule(() => import('../home.js'));`,
    );
    writeFileSync(
      orders,
      `import { withModule as page } from '@sellgar/app/next'; export default page(() => import('../../orders.js'));`,
    );
    writeFileSync(path.join(appDir, 'about/page.tsx'), 'export default () => null;');
    const source = loader.call({
      resourcePath: path.join(projectDir, 'registry.tsx'),
      getOptions: () => ({ appDir, projectDir }),
      addDependency: (file) => dependencies.add(file),
      addContextDependency: (directory) => directories.add(directory),
    });
    assert.match(source, /^'use client'/);
    assert.ok(source.includes(moduleId(home)) && source.includes(moduleId(orders)));
    assert.match(source, /React.lazy\(\(\) => import\("\.\/home.js"\)/);
    assert.match(source, /React.lazy\(\(\) => import\("\.\/orders.js"\)/);
    assert.ok(dependencies.has(home) && dependencies.has(orders));
    assert.ok(directories.has(appDir) && directories.has(path.join(appDir, 'orders')));
    assert.doesNotMatch(source, /about\/page|withModule/);
  } finally {
    rmSync(projectDir, { recursive: true, force: true });
  }
});
