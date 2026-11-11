const { collectEntries, relativeImport } = require('./entry-registry.cjs');

module.exports = function serverRegistryLoader() {
  this.addDependency(__filename);
  const entries = collectEntries(this);
  const registryBody = entries
    .map(
      (entry) =>
        `${JSON.stringify(entry.id)}: { kind: ${JSON.stringify(entry.kind)}, parentId: ${JSON.stringify(entry.parentId)}, paramKeys: ${JSON.stringify(entry.paramKeys)}, load: () => import(${JSON.stringify(relativeImport(this.resourcePath, entry.resolved))}) }`,
    )
    .join(',\n');
  return `import 'server-only';\nexport const serverEntries = {\n${registryBody}\n};\n`;
};
