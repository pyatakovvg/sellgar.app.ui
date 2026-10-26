import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CONFIGURED = Symbol.for('@sellgar/app/next:configured');
const normalize = (value) => value.split(path.sep).join('/');
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Register bootstrap and rendering integration; never create an application while evaluating next.config. */
export function withApp(config = {}, options = {}) {
  if (config[CONFIGURED]) return config;
  if (typeof config === 'function' || typeof config?.then === 'function') {
    throw new Error('В текущем прототипе withApp() принимает объект NextConfig.');
  }

  const projectDir = path.resolve(options.projectDir ?? process.cwd());
  const root = path.resolve(config.turbopack?.root ?? projectDir);
  // Next resolves alias targets from the application directory, even when
  // turbopack.root points to the containing monorepo.
  const inProject = (file) => './' + normalize(path.relative(projectDir, file));
  const resolve = (relative) => fileURLToPath(new URL(relative, import.meta.url));
  const candidates = ['app', 'src/app']
    .flatMap((directory) =>
      (config.pageExtensions ?? ['tsx', 'ts', 'jsx', 'js']).map((extension) =>
        path.resolve(projectDir, directory, `layout.${extension}`),
      ),
    )
    .filter(existsSync);
  const layout = options.rootLayout ? path.resolve(projectDir, options.rootLayout) : candidates[0];

  if ((!options.rootLayout && candidates.length !== 1) || !layout || !existsSync(layout)) {
    throw new Error('withApp() требует единственный корневой layout в app/ или src/app/. Укажите rootLayout явно.');
  }

  const application = options.application
    ? path.resolve(projectDir, options.application)
    : resolve('../../../application/config/application-entry/index.ts');
  if (!existsSync(application)) throw new Error(`Файл фабрики приложения для withApp() не найден: ${application}`);

  const instrumentation =
    './' + normalize(path.relative(projectDir, resolve('../../../instrumentation/client/index.ts')));
  const nodeEntry = resolve('../../../entry/node/index.mjs');
  const existingRules = config.turbopack?.rules ?? {};
  const wildcardRules = existingRules['*'];
  const rules = wildcardRules ? (Array.isArray(wildcardRules) ? [...wildcardRules] : [wildcardRules]) : [];
  const matches = (file) => ({ path: new RegExp('(^|/)' + escapeRegExp(normalize(path.relative(root, file))) + '$') });

  rules.push(
    { condition: matches(layout), loaders: [resolve('../../transform/root-layout/index.cjs')] },
    { condition: matches(nodeEntry), loaders: [resolve('../../transform/runtime-entry/index.cjs')] },
    {
      condition: { path: /(^|\/)app\/(?:.*\/)?(?:page|layout)\.[cm]?[jt]sx?$/ },
      loaders: [resolve('../../transform/module-page/index.cjs')],
    },
    {
      condition: matches(resolve('../../../module/rendering/client-entry/client-entry.tsx')),
      loaders: [
        {
          loader: resolve('../../transform/module-page/client-registry-loader.cjs'),
          options: { appDir: path.dirname(layout), projectDir },
        },
      ],
    },
    {
      condition: matches(resolve('../../../layout/runtime/server-layout-registry/server-layout-registry.ts')),
      loaders: [
        {
          loader: resolve('../../transform/module-page/server-registry-loader.cjs'),
          options: { appDir: path.dirname(layout), projectDir },
        },
      ],
    },
  );

  const result = {
    ...config,
    instrumentationClientInject: [...new Set([...(config.instrumentationClientInject ?? []), instrumentation])],
    turbopack: {
      ...config.turbopack,
      root,
      resolveAlias: {
        ...config.turbopack?.resolveAlias,
        'sellgar-next-application': inProject(application),
        'sellgar-next-root-layout': inProject(resolve('../../../application/rendering/root-layout/index.ts')),
        'sellgar-next-client-entry': inProject(resolve('../../../entry/client/index.ts')),
      },
      rules: { ...existingRules, '*': rules },
    },
  };

  Object.defineProperty(result, CONFIGURED, { value: true });
  return result;
}
