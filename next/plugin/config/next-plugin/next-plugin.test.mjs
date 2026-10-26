import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { withApp } from './index.mjs';
import { withApp as publicPlugin } from '@sellgar/app/next';

test('the public Node entry loads the plugin without importing a React runtime', () => {
  assert.equal(publicPlugin, withApp);
});

test('registers bootstrap without editing layouts and preserves existing Next configuration', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'sellgar-next-config-'));
  const layout = 'export default function Layout({ children }) { return children; }\n';

  try {
    await mkdir(path.join(projectDir, 'src/app'), { recursive: true });
    await writeFile(path.join(projectDir, 'src/app/layout.tsx'), layout);

    const existingRule = { condition: { path: '*.svg' }, loaders: ['existing-loader'] };
    const config = {
      reactStrictMode: true,
      instrumentationClientInject: ['existing-instrumentation'],
      turbopack: { resolveAlias: { existing: './existing.ts' }, rules: { '*': existingRule } },
    };
    const result = withApp(config, { projectDir });

    assert.equal(result.reactStrictMode, true);
    assert.equal(result.turbopack.resolveAlias.existing, './existing.ts');
    assert.equal(result.instrumentationClientInject[0], 'existing-instrumentation');
    assert.equal(result.instrumentationClientInject.length, 2);
    assert.equal(result.turbopack.rules['*'][0], existingRule);
    assert.equal(result.turbopack.rules['*'].length, 6);
    assert.equal(await readFile(path.join(projectDir, 'src/app/layout.tsx'), 'utf8'), layout);
    assert.equal(config.instrumentationClientInject.length, 1);
    assert.equal(withApp(result, { projectDir }), result);
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('rejects an ambiguous root instead of silently wrapping the wrong layout', async () => {
  const projectDir = await mkdtemp(path.join(os.tmpdir(), 'sellgar-next-roots-'));
  try {
    for (const directory of ['app', 'src/app']) {
      await mkdir(path.join(projectDir, directory), { recursive: true });
      await writeFile(path.join(projectDir, directory, 'layout.tsx'), 'export default () => null;');
    }
    assert.throws(() => withApp({}, { projectDir }), /единственный корневой layout/);
    assert.doesNotThrow(() => withApp({}, { projectDir, rootLayout: 'src/app/layout.tsx' }));
  } finally {
    await rm(projectDir, { recursive: true, force: true });
  }
});

test('resolves framework aliases from the client directory inside a monorepo', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'sellgar-next-workspace-'));
  const projectDir = path.join(workspace, 'clients/site');
  try {
    await mkdir(path.join(projectDir, 'src/app'), { recursive: true });
    await writeFile(path.join(projectDir, 'src/app/layout.tsx'), 'export default () => null;');
    const result = withApp({ turbopack: { root: workspace } }, { projectDir });
    const target = path.resolve(projectDir, result.turbopack.resolveAlias['sellgar-next-root-layout']);
    assert.equal(
      target,
      fileURLToPath(new URL('../../../application/rendering/root-layout/index.ts', import.meta.url)),
    );
    assert.ok(result.turbopack.rules['*'][0].condition.path.test('clients/site/src/app/layout.tsx'));
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
