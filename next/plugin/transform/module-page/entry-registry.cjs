const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const ts = require('typescript');
const { entryId, entryDeclarations } = require('./entry-declarations.cjs');

function collectEntries(context) {
  context.addDependency(__filename);
  context.addDependency(require.resolve('./entry-declarations.cjs'));
  const { appDir, projectDir } = context.getOptions();
  const entries = [];
  const scan = (directory) => {
    context.addContextDependency(directory);
    for (const item of fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(directory, item.name);
      if (item.isDirectory()) {
        if (!item.name.startsWith('_')) scan(filePath);
        continue;
      }
      if (!/^(page|layout)\.[cm]?[jt]sx?$/.test(item.name)) continue;
      context.addDependency(filePath);
      const file = ts.createSourceFile(
        filePath,
        fs.readFileSync(filePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const declaration of entryDeclarations(file)) {
        const expected = declaration.kind === 'layout' ? 'layout.' : 'page.';
        if (!item.name.startsWith(expected))
          throw new Error(`Декларация ${declaration.kind} должна находиться в файле ${expected}tsx.`);
        let resolved;
        try {
          resolved = createRequire(filePath).resolve(declaration.specifier);
        } catch {
          const configPath = ts.findConfigFile(projectDir, ts.sys.fileExists, 'tsconfig.json');
          const config = configPath && ts.readConfigFile(configPath, ts.sys.readFile);
          const options =
            config && ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath)).options;
          resolved = ts.resolveModuleName(declaration.specifier, filePath, options || {}, ts.sys).resolvedModule
            ?.resolvedFileName;
        }
        if (!resolved || /\.d\.[cm]?ts$/.test(resolved))
          throw new Error(`Не удалось разрешить декларацию runtime ${declaration.specifier} из ${filePath}.`);
        context.addDependency(resolved);
        const paramKeys = path
          .relative(appDir, directory)
          .split(path.sep)
          .flatMap((segment) => {
            const match = /^\[\[?(?:\.\.\.)?([^\]]+)\]\]?$/.exec(segment);
            return match ? [match[1]] : [];
          });
        entries.push({ id: entryId(filePath), kind: declaration.kind, resolved, directory, filePath, paramKeys });
      }
    }
  };
  scan(appDir);
  return entries.map((entry) => {
    const parents = entries
      .filter(
        (candidate) =>
          candidate.kind === 'layout' &&
          candidate.filePath !== entry.filePath &&
          (candidate.directory === entry.directory || entry.directory.startsWith(candidate.directory + path.sep)),
      )
      .sort((a, b) => b.directory.length - a.directory.length);
    return { ...entry, parentId: parents[0]?.id };
  });
}

const relativeImport = (from, target) => './' + path.relative(path.dirname(from), target).split(path.sep).join('/');
module.exports = { collectEntries, relativeImport };
