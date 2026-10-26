const path = require('node:path');
const { collectEntries, relativeImport } = require('./entry-registry.cjs');

module.exports = function clientRegistryLoader() {
  this.addDependency(__filename);
  const entries = collectEntries(this);
  const host = relativeImport(
    this.resourcePath,
    path.resolve(__dirname, '../../../module/rendering/module-host/index.ts'),
  );
  return `'use client';
import React from 'react';
import { ModuleHost } from ${JSON.stringify(host)};
const entries = {
${entries.map((entry) => `${JSON.stringify(entry.id)}: React.lazy(() => import(${JSON.stringify(relativeImport(this.resourcePath, entry.resolved))}).then(moduleExports => ({ default: function SellgarEntryView(props) { return React.createElement(ModuleHost, { moduleExports, snapshot: props.snapshot }, props.children); } })))`).join(',\n')}
};
export default function ModuleClientEntry(props) {
  const View = entries[props.moduleId];
  if (!View) throw new Error('Неизвестная клиентская декларация фреймворка Next.');
  const key = props.snapshot.kind === 'layout' ? props.moduleId : props.snapshot.id;
  return React.createElement(View, { key, snapshot: props.snapshot }, props.children);
}
`;
};
