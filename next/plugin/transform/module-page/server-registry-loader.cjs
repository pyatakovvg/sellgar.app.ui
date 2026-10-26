const { collectEntries, relativeImport } = require('./entry-registry.cjs');

module.exports = function serverRegistryLoader() {
  this.addDependency(__filename);
  const entries = collectEntries(this);
  return `import 'server-only';\nexport const serverEntries = {\n${entries.map((entry) => `${JSON.stringify(entry.id)}: { kind: ${JSON.stringify(entry.kind)}, parentId: ${JSON.stringify(entry.parentId)}, paramKeys: ${JSON.stringify(entry.paramKeys)}, load: () => import(${JSON.stringify(relativeImport(this.resourcePath, entry.resolved))}) }`).join(',\n')}\n};\n`;
};
