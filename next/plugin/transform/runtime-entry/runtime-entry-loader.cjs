module.exports = function runtimeEntryLoader() {
  // Node loads the untouched entry to configure Next. Turbopack replaces it
  // only in the application graph, where SSR needs the client runtime facade.
  return "export * from 'sellgar-next-client-entry';\n";
};
