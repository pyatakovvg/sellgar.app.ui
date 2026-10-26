const ts = require('typescript');
const { entryId, entryDeclarations } = require('./entry-declarations.cjs');

module.exports = function entryLoader(source) {
  this.addDependency?.(__filename);
  this.addDependency?.(require.resolve('./entry-declarations.cjs'));
  const file = ts.createSourceFile(this.resourcePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const entries = entryDeclarations(file);
  if (!entries.length) return source;
  const result = ts.transform(file, [
    (context) => {
      const visit = (node) =>
        entries.some((entry) => entry.node === node)
          ? ts.factory.updateCallExpression(node, node.expression, node.typeArguments, [
              node.arguments[0],
              ts.factory.createStringLiteral(entryId(this.resourcePath)),
            ])
          : ts.visitEachChild(node, visit, context);
      return (node) => ts.visitNode(node, visit);
    },
  ]);
  try {
    return ts.createPrinter().printFile(result.transformed[0]);
  } finally {
    result.dispose();
  }
};

module.exports.moduleId = entryId;
